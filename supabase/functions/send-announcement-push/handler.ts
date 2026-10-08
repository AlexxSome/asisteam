import { runAnnouncementPush, type AnnouncementPushOptions } from "../../../packages/core/src/announcement-push.ts";
export function createAnnouncementPushHandler(options: AnnouncementPushOptions & { serviceRoleKey?: string }) {
  return async (request: Request): Promise<Response> => {
    const failure = (code: string, message: string, status: number) => Response.json({ error: { code, message, details: {} } }, { status, headers: { "Cache-Control": "private, no-store" } });
    if (request.method !== "POST") return failure("method_not_allowed", "Método no permitido.", 405);
    if (!options.serviceRoleKey) return failure("unavailable", "Servicio no disponible.", 503);
    if (request.headers.get("Authorization") !== `Bearer ${options.serviceRoleKey}`) return failure("authentication_required", "No autorizado.", 401);
    return runAnnouncementPush(options);
  };
}
