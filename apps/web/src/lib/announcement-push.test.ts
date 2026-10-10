import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAnnouncementPush } from "@asisteam/core";

const delivery = { delivery_id: "delivery", claim_token: "claim", token: "ExpoPushToken[syntheticToken]", announcement_id: "announcement", group_id: "group", ticket_id: null };
const rpc = vi.fn();
const send = vi.fn<typeof fetch>();
const options = { client: { rpc }, serviceRoleKey: "synthetic-service", expoAccessToken: "synthetic-expo", send };
const request = (token = options.serviceRoleKey, method = "POST") => new Request("http://localhost/job", { method, headers: { Authorization: `Bearer ${token}` } });
beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockImplementation(async (name, args) => ({ data: name === "claim_announcement_push" ? args.p_receipts ? [] : [delivery] : null, error: null }));
  send.mockResolvedValue(Response.json({ data: { status: "ok", id: "ticket" } }));
});
describe("worker Expo de anuncios", () => {
  it("rechaza una cola sin capacidad válida antes de contactar al proveedor", async () => {
    // There is no HTTP worker gateway. API/member role rejection is asserted
    // against real native SQL in announcement_push.test.sql + native HTTP80.
    for (const invalid of [null, {}, [{...delivery,claim_token:null}]]) {
      rpc.mockResolvedValueOnce({data:invalid,error:null});
      expect((await runAnnouncementPush(options)).status).toBe(503);
    }
    expect(send).not.toHaveBeenCalled();
  });
  it("envía solo contexto genérico y conserva ticket para recibo posterior", async () => {
    expect(await (await runAnnouncementPush(options)).json()).toEqual({ processed: 1 });
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer synthetic-expo" });
    expect(JSON.parse(init?.body as string)).toEqual({ to: delivery.token, title: "Nuevo anuncio en Asisteam", body: "Hay un nuevo anuncio en el muro de tu grupo.",
      sound: "default", ttl: 3600, collapseId: "announcement", tag: "announcement", data: { type: "GROUP_ANNOUNCEMENT", announcement_id: "announcement", group_id: "group", url: "/groups/group/announcements#announcement" } });
    expect(rpc).toHaveBeenCalledWith("complete_announcement_push", { p_delivery_id: "delivery", p_claim_token: "claim", p_outcome: "accepted", p_ticket_id: "ticket" });
    expect(rpc).toHaveBeenCalledWith("record_announcement_push_run", { p_processed: 1 });
  });
  it.each([[429, "retry"], [503, "retry"], [400, "failed"]])("HTTP %s produce %s sin revelar proveedor", async (status, outcome) => {
    send.mockResolvedValue(Response.json({ message: "private-token@example.test" }, { status }));
    const response = await runAnnouncementPush(options);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-token");
    expect(rpc).toHaveBeenCalledWith("complete_announcement_push", expect.objectContaining({ p_outcome: outcome }));
  });
  it.each([["DeviceNotRegistered", "unregistered"], ["MessageRateExceeded", "retry"], ["InvalidCredentials", "failed"]])("interpreta rechazo %s", async (code, outcome) => {
    send.mockResolvedValue(Response.json({ data: { status: "error", message: "PII", details: { error: code } } }));
    await runAnnouncementPush(options);
    expect(rpc).toHaveBeenCalledWith("complete_announcement_push", expect.objectContaining({ p_outcome: outcome, p_ticket_id: null }));
  });
  it("no trata ticket incompleto ni timeout como entrega confirmada", async () => {
    for (const result of [Response.json({ data: { status: "ok" } }), null]) {
      if (result) send.mockResolvedValueOnce(result); else send.mockRejectedValueOnce(new Error("private"));
      const response = await runAnnouncementPush(options);
      expect(response.status).toBe(503);
      expect(rpc).toHaveBeenLastCalledWith("record_announcement_push_run", { p_processed: 0 });
    }
  });
  it.each([[{ status: "ok" }, "delivered"], [{ status: "error", details: { error: "DeviceNotRegistered" } }, "unregistered"], [null, "receipt_pending"]])("verifica recibos sin reenviar el push", async (receipt, outcome) => {
    rpc.mockImplementation(async (name, args) => ({ data: name === "claim_announcement_push" ? args.p_receipts ? [{ ...delivery, token: null, ticket_id: "ticket" }] : [] : null, error: null }));
    send.mockResolvedValue(Response.json({ data: receipt ? { ticket: receipt } : {} }));
    await runAnnouncementPush(options);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toBe("https://exp.host/--/api/v2/push/getReceipts");
    expect(rpc).toHaveBeenCalledWith("complete_announcement_push", expect.objectContaining({ p_outcome: outcome }));
  });
  it("respuesta de cola inválida o error DB no dispara llamadas Expo", async () => {
    rpc.mockResolvedValueOnce({ data: [{}], error: null });
    expect((await runAnnouncementPush(options)).status).toBe(503);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "private" } });
    expect((await runAnnouncementPush(options)).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });
  it("no envía de nuevo un lote completado; los ACK fallidos quedan pendientes", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await (await runAnnouncementPush(options)).json()).toEqual({ processed: 0 });
    expect(send).not.toHaveBeenCalled();
    rpc.mockImplementation(async (name, args) => ({ data: name === "claim_announcement_push" ? args.p_receipts ? [] : [delivery] : null, error: name === "complete_announcement_push" ? { message: "private" } : null }));
    expect((await runAnnouncementPush(options)).status).toBe(503);
  });
  it("espera los ACK restantes aunque una confirmación del lote falle", async () => {
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    rpc.mockImplementation(async (name, args) => {
      if (name === "claim_announcement_push") return { data: args.p_receipts ? [] : [delivery, { ...delivery, delivery_id: "second" }], error: null };
      if (name === "complete_announcement_push" && args.p_delivery_id === "delivery") return { data: null, error: { message: "failure" } };
      if (name === "complete_announcement_push") await delayed;
      return { data: null, error: null };
    });
    send.mockImplementation(async () => Response.json({ data: { status: "ok", id: "ticket" } }));
    let settled = false;
    const response = runAnnouncementPush(options).then((value) => { settled = true; return value; });
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith("complete_announcement_push", expect.objectContaining({ p_delivery_id: "second" })));
    expect(settled).toBe(false);
    release(); expect((await response).status).toBe(503);
  });
});
