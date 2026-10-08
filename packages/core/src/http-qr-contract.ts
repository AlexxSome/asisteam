import { z } from "zod";
import { qrCheckinSettingsSchema, checkinInputSchema, checkinQrSchema, checkinResultSchema } from "./schemas/check-in";
const common = { module: "qr", authenticated: true, state: "implemented", status: 200 } as const;
export const qrHttpSchemas = {
  CheckinActivityParams: z.object({ activityId: z.string().uuid() }).strict(),
  QrSettings: qrCheckinSettingsSchema,
  CheckinInput: checkinInputSchema,
  CheckinQr: checkinQrSchema.strict(),
  CheckinReceipt: checkinResultSchema,
} as const;
export const qrHttpOperations = {
  getQrSettings: { ...common, method: "GET", path: "/api/v1/groups/{groupId}/check-in-settings", params: "GroupParams", response: "QrSettings", summary: "ADMIN ACTIVE consulta horario QR del grupo" },
  setQrSettings: { ...common, method: "PUT", path: "/api/v1/groups/{groupId}/check-in-settings", params: "GroupParams", body: "QrSettings", response: "QrSettings", summary: "ADMIN configura ventana/atraso mediante RPC canónica" },
  issueCheckinQr: { ...common, method: "POST", path: "/api/v1/activities/{activityId}/check-in-qr", params: "CheckinActivityParams", response: "CheckinQr", summary: "ADMIN emite HMAC temporal; clave y reloj permanecen en SQL" },
  selfCheckin: { ...common, method: "POST", path: "/api/v1/me/check-in", body: "CheckinInput", response: "CheckinReceipt", summary: "ATHLETE ACTIVE registra solo llegada propia; conserva marca previa" },
} as const;
