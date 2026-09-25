import type { AttendanceHistory } from "@asisteam/core";

export const historyFixture: AttendanceHistory = {
  group_id: "39000000-0000-4000-8000-000000000201", membership_id: "39000000-0000-4000-8000-000000000302", full_name: "Deportista de prueba",
  period: { type: "month", from: "2026-03-01", to: "2026-03-31", timezone: "America/Santiago" },
  totals: { convened: 10, present: 6, late: 1, absent: 2, excused: 1, attendance_pct: 77.8, late_rate: 14.3 },
  records: [{ id: "39000000-0000-4000-8000-000000000701", activity_id: "39000000-0000-4000-8000-000000000501",
    title: "Entrenamiento de prueba", starts_at: "2026-03-02T01:30:00+00:00", activity_type_id: "b2c3d4e5-0001-4b3c-8d4e-111111111111",
    activity_type_name: "TRAINING", activity_type_color: "#123456", is_system_type: true, status: "PRESENT", note: "Mi nota propia" }],
  page: 1, page_size: 50,
};
