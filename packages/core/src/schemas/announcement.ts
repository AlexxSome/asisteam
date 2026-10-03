import { z } from "zod";

export const announcementSchema = z.object({
  title: z.string().trim().min(1, "Escribe un título.").max(120, "El título admite hasta 120 caracteres."),
  body: z.string().trim().min(1, "Escribe el anuncio.").max(5000, "El anuncio admite hasta 5000 caracteres."),
}).strict();
export const announcementVersionSchema = z.string().datetime({ offset: true });
export const announcementIdSchema = z.string().uuid();
export const announcementPageSchema = z.coerce.number().int().min(1).max(100000);
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const ANNOUNCEMENT_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para continuar.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  admin_required: "Solo un administrador del grupo puede gestionar anuncios.",
  announcement_not_found: "El anuncio no existe o ya fue eliminado.",
  invalid_announcement: "Revisa el título y el contenido del anuncio.",
  announcement_changed: "Otro administrador cambió este anuncio. Actualiza el muro antes de volver a editarlo.",
  announcement_request_conflict: "No pudimos confirmar esta publicación. Actualiza el muro antes de reintentar.",
  announcement_save_failed: "No pudimos guardar el cambio. Vuelve a intentarlo.",
  invalid_push_preference: "Elige si quieres recibir avisos de anuncios.",
};
