type JobClient = {
  rpc(name: "run_guardianship_majority" | "claim_guardianship_majority_emails" | "complete_guardianship_majority_email",
    args?: { p_delivery_id: string; p_claim_token: string }): PromiseLike<{ data: unknown; error: unknown }>;
};
type Delivery = { delivery_id: string; claim_token: string; email: string; full_name: string; audience: "ATHLETE" | "GUARDIAN" | "ADMIN" };
type Options = {
  client: JobClient;
  serviceRoleKey?: string;
  resendApiKey?: string;
  emailFrom?: string;
  sendEmail?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
};

function isDelivery(value: unknown): value is Delivery {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return ["delivery_id", "claim_token", "email", "full_name"].every((field) => typeof item[field] === "string")
    && ["ATHLETE", "GUARDIAN", "ADMIN"].includes(String(item.audience));
}

export function createGuardianshipMajorityHandler(options: Options) {
  return async (request: Request): Promise<Response> => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
    const fail = (code: string, message: string, status: number) => json({ error: { code, message, details: {} } }, status);
    if (request.method !== "POST") return fail("method_not_allowed", "Método no permitido", 405);
    if (!options.serviceRoleKey) return fail("unavailable", "Servicio no disponible", 503);
    if (request.headers.get("Authorization") !== `Bearer ${options.serviceRoleKey}`) {
      return fail("authentication_required", "No autorizado", 401);
    }
    try {
      // La baja es transaccional e independiente del transporte de correo.
      const result = await options.client.rpc("run_guardianship_majority");
      if (result.error || typeof result.data !== "number") return fail("unavailable", "No pudimos procesar la mayoría de edad", 503);
      if (!options.resendApiKey || !options.emailFrom) return fail("email_unavailable", "Servicio de correo no disponible", 503);
      const batch = await options.client.rpc("claim_guardianship_majority_emails");
      if (batch.error || !Array.isArray(batch.data) || !batch.data.every(isDelivery)) {
        return fail("unavailable", "No pudimos preparar los avisos", 503);
      }
      let delivered = 0;
      for (const [index, item] of batch.data.entries()) {
        // Lotes SQL de cinco: <= 50 s de timeout total. Espaciado compatible
        // con el límite inicial de Resend (2 solicitudes/s).
        if (index > 0) await (options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(600);
        const text = item.audience === "ATHLETE"
          ? "Cumpliste 18 años. Tus antiguos apoderados ya no tienen acceso a tus datos en Asisteam. Si tu cuenta aún es gestionada, pide al administrador que te invite a activar tus credenciales."
          : item.audience === "GUARDIAN"
            ? `${item.full_name} cumplió 18 años y dejó de aparecer entre tus pupilos. Ya no tienes acceso a su perfil, actividades, historial ni estadísticas como apoderado.`
            : `${item.full_name} cumplió 18 años y mantiene una cuenta gestionada. Inicia la invitación para activar su cuenta propia desde la gestión de integrantes. Sus antiguos apoderados ya no tienen acceso a sus datos.`;
        try {
          const response = await (options.sendEmail ?? fetch)("https://api.resend.com/emails", {
            method: "POST", signal: AbortSignal.timeout(10_000),
            headers: { Authorization: `Bearer ${options.resendApiKey}`, "Content-Type": "application/json",
              "Idempotency-Key": `guardianship-majority-${item.delivery_id}` },
            body: JSON.stringify({ from: options.emailFrom, to: [item.email], subject: "Mayoría de edad en Asisteam", text }),
          });
          const receipt = response.ok ? await response.json() : null;
          if (!response.ok || typeof receipt?.id !== "string") continue;
          const completed = await options.client.rpc("complete_guardianship_majority_email", {
            p_delivery_id: item.delivery_id, p_claim_token: item.claim_token,
          });
          if (!completed.error) delivered++;
        } catch {
          // El lease expira y cron reintenta; nunca registrar PII ni respuestas del proveedor.
        }
      }
      const failed = batch.data.length - delivered;
      if (failed) return fail("email_delivery_failed", "Quedan avisos pendientes de envío", 503);
      return json({ processed: result.data, delivered });
    } catch {
      return fail("unavailable", "Servicio no disponible", 503);
    }
  };
}
