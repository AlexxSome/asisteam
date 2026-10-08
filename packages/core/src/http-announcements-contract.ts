import { z } from "zod";
import { announcementSchema, announcementVersionSchema } from "./schemas/announcement";
const uuid = z.string().uuid(), date = z.string().datetime({ offset: true });
const path = "/api/v1/groups/{groupId}/announcements";
const common = { module: "announcements", authenticated: true, state: "implemented", status: 200 } as const;
export const announcementHttpSchemas = {
  AnnouncementParams: z.object({ groupId: uuid, announcementId: uuid }).strict(),
  AnnouncementQuery: z.object({ page: z.number().int().min(1).max(100000).default(1) }).strict(),
  AnnouncementWall: z.object({ announcements: z.array(z.object({ id: uuid, group_id: uuid, title: z.string(), body: z.string(), created_at: date, updated_at: date, total_count: z.number().int().nonnegative() }).strict()).max(50), page: z.number().int().positive(), pushEnabled: z.boolean(), hasDevices: z.boolean() }).strict(),
  PublishAnnouncement: announcementSchema.extend({ request_id: uuid }).strict(),
  UpdateAnnouncement: announcementSchema.extend({ updated_at: announcementVersionSchema }).strict(),
  DeleteAnnouncement: z.object({ updated_at: announcementVersionSchema }).strict(),
  AnnouncementPublished: z.object({ id: uuid }).strict(),
  PushPreference: z.object({ enabled: z.boolean() }).strict(),
  PushState: z.object({ enabled: z.boolean(), hasDevices: z.boolean() }).strict(),
  RegisterPushToken: z.object({ token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/), platform: z.enum(["IOS", "ANDROID"]) }).strict(),
  UnregisterPushToken: z.object({ token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/) }).strict(),
  PushTokenRegistered: z.object({ id: uuid }).strict(),
} as const;
export const announcementHttpOperations = {
  getAnnouncements: { ...common, method: "GET", path, params: "GroupParams", query: "AnnouncementQuery", response: "AnnouncementWall", summary: "Muro por membresía ACTIVE; preferencias/dispositivos propios sin tokens" },
  publishAnnouncement: { ...common, method: "POST", path, params: "GroupParams", body: "PublishAnnouncement", response: "AnnouncementPublished", summary: "ADMIN publica/encola atómicamente con UUID idempotente" },
  updateAnnouncement: { ...common, method: "PATCH", path: path + "/{announcementId}", params: "AnnouncementParams", body: "UpdateAnnouncement", response: "Success", summary: "ADMIN edita con versión exacta; no emite nuevo push" },
  deleteAnnouncement: { ...common, method: "DELETE", path: path + "/{announcementId}", params: "AnnouncementParams", body: "DeleteAnnouncement", response: "Success", summary: "ADMIN elimina lógicamente con versión exacta" },
  getAnnouncementPush: { ...common, method: "GET", path: "/api/v1/me/announcement-push", response: "PushState", summary: "Opt-in y existencia de dispositivos propios; default false" },
  setAnnouncementPush: { ...common, method: "PATCH", path: "/api/v1/me/announcement-push", body: "PushPreference", response: "Success", summary: "Preferencia explícita global del usuario; opt-out cancela pendientes" },
  registerAnnouncementToken: { ...common, method: "POST", path: "/api/v1/me/announcement-push/tokens", body: "RegisterPushToken", response: "PushTokenRegistered", summary: "Registra Expo propio sin reasignar tokens activos ajenos" },
  unregisterAnnouncementToken: { ...common, method: "DELETE", path: "/api/v1/me/announcement-push/tokens", body: "UnregisterPushToken", response: "Success", summary: "Desregistra solo token propio antes del logout" },
} as const;
