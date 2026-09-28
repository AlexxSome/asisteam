import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGuardianshipMajorityHandler } from "../../../../supabase/functions/guardianship-majority/handler";

const deliveries = ["ATHLETE", "GUARDIAN", "ADMIN"].map((audience, index) => ({
  delivery_id: `delivery-${index}`, claim_token: `lease-${index}`, email: `synthetic-${index}@example.test`,
  full_name: "Deportista sintético", audience,
}));
const rpc = vi.fn();
const sendEmail = vi.fn<typeof fetch>();
const wait = vi.fn(async () => {});
const options = { client: { rpc }, serviceRoleKey: "synthetic-service", resendApiKey: "synthetic-resend",
  emailFrom: "Asisteam <test@example.test>", sendEmail, wait };
const request = (token = options.serviceRoleKey, method = "POST") => new Request("http://localhost/job", {
  method, headers: { Authorization: `Bearer ${token}` },
});
beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockImplementation(async (name: string) => ({
    data: name === "run_guardianship_majority" ? 1 : name === "claim_guardianship_majority_emails" ? deliveries : null,
    error: null,
  }));
  sendEmail.mockImplementation(async () => Response.json({ id: "synthetic-receipt" }));
});

describe("job privado de mayoría de edad", () => {
  it("rechaza visitantes y JWT de usuario antes de consultar datos", async () => {
    for (const token of ["", "user-jwt", "anon-key"]) {
      expect((await createGuardianshipMajorityHandler(options)(request(token))).status).toBe(401);
    }
    expect((await createGuardianshipMajorityHandler(options)(request(undefined, "GET"))).status).toBe(405);
    expect(rpc).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("persiste transición y avisa a las tres audiencias sin PII en la respuesta", async () => {
    const response = await createGuardianshipMajorityHandler(options)(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 1, delivered: 3 });
    expect(rpc.mock.calls[0]).toEqual(["run_guardianship_majority"]);
    expect(sendEmail).toHaveBeenCalledTimes(3);
    for (const [index, item] of deliveries.entries()) {
      const [url, init] = sendEmail.mock.calls[index]!;
      expect(url).toBe("https://api.resend.com/emails");
      expect(init?.headers).toMatchObject({ "Idempotency-Key": `guardianship-majority-${item.delivery_id}` });
      const mail = JSON.parse(init?.body as string);
      expect(mail.to).toEqual([item.email]);
      expect(mail.text).toContain("18 años");
      expect(mail.html).toBeUndefined();
      expect(rpc).toHaveBeenCalledWith("complete_guardianship_majority_email", { p_delivery_id: item.delivery_id, p_claim_token: item.claim_token });
    }
    expect(wait).toHaveBeenCalledTimes(2);
  });
  it("falta de correo no impide la baja ni consume los avisos", async () => {
    const response = await createGuardianshipMajorityHandler({ ...options, resendApiKey: undefined })(request());
    expect(response.status).toBe(503);
    expect(rpc.mock.calls).toEqual([["run_guardianship_majority"]]);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("fallo del proveedor conserva recibo pendiente y oculta sus detalles", async () => {
    sendEmail.mockResolvedValueOnce(Response.json({ error: "secret@example.test" }, { status: 429 }));
    const response = await createGuardianshipMajorityHandler(options)(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
    expect(rpc).not.toHaveBeenCalledWith("complete_guardianship_majority_email", {
      p_delivery_id: deliveries[0]!.delivery_id, p_claim_token: deliveries[0]!.claim_token,
    });
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });
  it("si falla la confirmación, el siguiente intento usa la misma clave de idempotencia", async () => {
    rpc.mockImplementation(async (name: string) => ({ data: name === "run_guardianship_majority" ? 0 : [deliveries[0]],
      error: name === "complete_guardianship_majority_email" ? { message: "internal" } : null }));
    const handler = createGuardianshipMajorityHandler(options);
    expect((await handler(request())).status).toBe(503);
    expect((await handler(request())).status).toBe(503);
    expect(sendEmail.mock.calls[0]![1]?.headers).toEqual(sendEmail.mock.calls[1]![1]?.headers);
  });
  it("no envía correos si la transacción falla o la respuesta de la cola es inválida", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "internal PII" } });
    let response = await createGuardianshipMajorityHandler(options)(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PII");
    rpc.mockResolvedValueOnce({ data: 0, error: null }).mockResolvedValueOnce({ data: [{}], error: null });
    response = await createGuardianshipMajorityHandler(options)(request());
    expect(response.status).toBe(503);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("no vuelve a enviar un lote que la base ya completó", async () => {
    rpc.mockResolvedValueOnce({ data: 0, error: null }).mockResolvedValueOnce({ data: [], error: null });
    expect(await (await createGuardianshipMajorityHandler(options)(request())).json()).toEqual({ processed: 0, delivered: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
