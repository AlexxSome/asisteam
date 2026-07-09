/**
 * Enums canónicos del dominio y sus etiquetas visibles en español.
 * Fuente: docs/04-modelo-de-datos.md (en la base se implementan como text + CHECK).
 */

export const ACCOUNT_STATUSES = ["ACTIVE", "INVITED", "MANAGED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const MEMBERSHIP_ROLES = ["ADMIN", "ATHLETE", "GUARDIAN"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const MEMBERSHIP_STATUSES = ["INVITED", "PENDING", "ACTIVE", "INACTIVE"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Presente",
  ABSENT: "Ausente",
  LATE: "Atrasado",
  EXCUSED: "Justificado",
};

export const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  ADMIN: "Administrador",
  ATHLETE: "Deportista",
  GUARDIAN: "Apoderado",
};
