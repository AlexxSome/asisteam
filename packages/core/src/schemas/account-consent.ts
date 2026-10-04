import { z } from "zod";

// Snapshot del aviso de invitaciones existente. Producto debe validar este
// contenido y su versión antes del release (issue #107); no es texto legal nuevo.
export const ACCOUNT_TERMS_2026_09_21 = {
  version: "2026-09-21",
  purpose: "Asisteam usa tus datos de perfil y asistencia para gestionar tu participación en los grupos deportivos.",
  visibility: "Los administradores del grupo gestionan tus registros. Tus datos de contacto y fecha de nacimiento no se muestran a otros integrantes.",
  minors: "Si eres menor de edad, tu apoderado debe consentir el tratamiento de tus datos antes de activar tu cuenta.",
  rights: "Puedes solicitar acceso, rectificación o eliminación de tus datos al responsable de tu grupo.",
} as const;
export const ACCOUNT_TERMS_VERSION = ACCOUNT_TERMS_2026_09_21.version;
export const ACCOUNT_TERMS_URL = `/legal/${ACCOUNT_TERMS_VERSION}#condiciones`;
export const ACCOUNT_PRIVACY_URL = `/legal/${ACCOUNT_TERMS_VERSION}#privacidad`;

export const accountConsentSchema = z.object({
  terms_accepted: z.literal(true, { errorMap: () => ({ message: "Debes aceptar las condiciones de uso y privacidad" }) }),
  terms_version: z.literal(ACCOUNT_TERMS_VERSION, { errorMap: () => ({ message: "Las condiciones cambiaron. Actualiza la página y revísalas antes de aceptar." }) }),
});
export type AccountConsentInput = z.infer<typeof accountConsentSchema>;
