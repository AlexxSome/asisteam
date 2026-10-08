type JobClient = {
  rpc(name: "claim_announcement_push" | "complete_announcement_push" | "record_announcement_push_run",
    args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};
type Delivery = { delivery_id: string; claim_token: string; token: string | null; announcement_id: string; group_id: string; ticket_id: string | null };
export type AnnouncementPushOptions = { client: JobClient; expoAccessToken?: string; send?: typeof fetch };
type Outcome = "accepted" | "delivered" | "retry" | "unregistered" | "failed" | "receipt_pending";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function isDelivery(value: unknown): value is Delivery {
  const item = object(value);
  return !!item && ["delivery_id", "claim_token", "announcement_id", "group_id"].every((key) => typeof item[key] === "string")
    && (item.token === null || typeof item.token === "string") && (item.ticket_id === null || typeof item.ticket_id === "string");
}
function errorOutcome(value: Record<string, unknown>): Outcome {
  const code = object(value.details)?.error;
  return code === "DeviceNotRegistered" ? "unregistered" : code === "MessageRateExceeded" ? "retry" : "failed";
}

export async function runAnnouncementPush(options: AnnouncementPushOptions): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const failure = (code: string, message: string, status: number) => json({ error: { code, message, details: {} } }, status);
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (options.expoAccessToken) headers.Authorization = `Bearer ${options.expoAccessToken}`;
    const post = (path: string, body: unknown) => (options.send ?? fetch)(`https://exp.host/--/api/v2/push/${path}`, {
      method: "POST", headers, redirect: "error", body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    let processed = 0;
    let pending = false;
    const complete = async (item: Delivery, outcome: Outcome, ticketId?: string) => {
      const result = await options.client.rpc("complete_announcement_push", {
        p_delivery_id: item.delivery_id, p_claim_token: item.claim_token, p_outcome: outcome, p_ticket_id: ticketId ?? null,
      });
      if (result.error) throw new Error("completion_failed");
      if (outcome === "accepted" || outcome === "delivered") processed++;
      if (outcome === "retry" || outcome === "receipt_pending" || outcome === "failed") pending = true;
    };
    const claim = async (receipts: boolean) => {
      const result = await options.client.rpc("claim_announcement_push", { p_receipts: receipts });
      if (result.error || !Array.isArray(result.data) || !result.data.every(isDelivery)) throw new Error("claim_failed");
      if (result.data.some((item) => receipts ? !item.ticket_id : !item.token)) throw new Error("claim_failed");
      return result.data;
    };
    try {
      const deliveries = await claim(false);
      // Cinco conexiones como máximo y un token por petición: un dispositivo de
      // otro proyecto Expo no invalida el lote completo de usuarios del grupo.
      for (let offset = 0; offset < deliveries.length; offset += 5) {
        const completed = await Promise.allSettled(deliveries.slice(offset, offset + 5).map(async (item) => {
          let outcome: Outcome = "retry";
          let ticketId: string | undefined;
          try {
            const response = await post("send", {
              to: item.token, title: "Nuevo anuncio en Asisteam", body: "Hay un nuevo anuncio en el muro de tu grupo.",
              sound: "default", ttl: 3600, collapseId: item.announcement_id, tag: item.announcement_id,
              data: { type: "GROUP_ANNOUNCEMENT", announcement_id: item.announcement_id, group_id: item.group_id,
                url: `/groups/${item.group_id}/announcements#${item.announcement_id}` },
            });
            if (response.ok) {
              const payload = object(await response.json());
              const ticket = object(payload?.data);
              if (ticket?.status === "ok" && typeof ticket.id === "string" && ticket.id.length > 0 && ticket.id.length <= 200) {
                outcome = "accepted"; ticketId = ticket.id;
              } else if (ticket?.status === "error") outcome = errorOutcome(ticket);
            } else if (response.status !== 429 && response.status < 500) outcome = "failed";
          } catch { /* La base limita y espacia los reintentos; nunca loguear tokens ni respuestas. */ }
          await complete(item, outcome, ticketId);
        }));
        if (completed.some((result) => result.status === "rejected")) throw new Error("completion_failed");
      }
      const receipts = await claim(true);
      if (receipts.length) {
        let data: Record<string, unknown> | null = null;
        try {
          const response = await post("getReceipts", { ids: receipts.map((item) => item.ticket_id) });
          if (response.ok) data = object(object(await response.json())?.data);
        } catch { /* Conservar tickets: un fallo consultando recibos no reenvía el push. */ }
        for (const item of receipts) {
          const receipt = object(data?.[item.ticket_id!]);
          await complete(item, receipt?.status === "ok" ? "delivered"
            : receipt?.status === "error" ? errorOutcome(receipt) : "receipt_pending");
        }
      }
      const run = await options.client.rpc("record_announcement_push_run", { p_processed: processed });
      if (run.error) throw new Error("run_failed");
      if (pending) return failure("push_incomplete", "Hay avisos pendientes o fallidos. Revisa el registro de envíos.", 503);
      return json({ processed });
    } catch { return failure("unavailable", "No pudimos completar el envío de avisos.", 503); }
}
