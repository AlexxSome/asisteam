import type { GroupAttendanceReport } from "@asisteam/core";

export const reportFixture: GroupAttendanceReport = {
  group_id: "32000000-0000-4000-8000-000000000201",
  period: { type: "month", from: "2026-03-01", to: "2026-03-31", timezone: "America/Santiago" },
  has_activities: true, page: 1, page_size: 50,
  totals: { athletes: 1, activities: 8, convened: 8, present: 5, late: 1, absent: 1, excused: 1, attendance_pct: 85.7, late_rate: 16.7, average_attendance_pct: 85.7, best_full_name: "Persona sintética" },
  by_athlete: [{ membership_id: "32000000-0000-4000-8000-000000000302", full_name: "Persona sintética", membership_status: "ACTIVE", convened: 8, present: 5, late: 1, absent: 1, excused: 1, attendance_pct: 85.7, late_rate: 16.7 }],
  by_activity_type: [{ activity_type_id: "b2c3d4e5-0003-4b3c-8d4e-333333333333", name: "COMPETITION", color: "#DC2626", is_system: true, activities: 2, convened: 2, present: 0, late: 1, absent: 1, excused: 0, attendance_pct: 50, late_rate: 100 }],
  trend: [{ week_from: "2026-03-02", attendance_pct: 85.7, convened: 8 }],
};
