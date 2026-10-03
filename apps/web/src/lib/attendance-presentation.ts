import { reportAttendanceTone, type AttendanceStatus } from "@asisteam/core";

/** Shared by attendance controls and history badges; labels remain in core. */
export const attendanceStatusClasses: Record<AttendanceStatus, string> = {
  PRESENT: "border-success bg-success-subtle text-success",
  LATE: "border-warning bg-warning-subtle text-warning",
  ABSENT: "border-error bg-error-subtle text-error",
  EXCUSED: "border-neutral bg-neutral-subtle text-neutral",
};

const reportToneClasses: Record<ReturnType<typeof reportAttendanceTone>, string> = {
  neutral: "text-neutral",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
};

export function reportAttendanceClass(value: number | null) {
  return reportToneClasses[reportAttendanceTone(value)];
}
