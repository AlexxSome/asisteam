// Canal operativo confirmado por producto para el issue #116.
export const SUPPORT_EMAIL = "soporte@asisteam.cl";

// Solo el motivo; nunca precargar datos personales o información de pupilos.
export const SUPPORT_REQUEST_URLS = {
  help: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Solicitud de ayuda en Asisteam")}`,
  copy: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Solicitud de copia de mis datos en Asisteam")}`,
  deletion: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Solicitud de supresión de datos en Asisteam")}`,
  revocation: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Solicitud de revocación de consentimiento en Asisteam")}`,
} as const;
