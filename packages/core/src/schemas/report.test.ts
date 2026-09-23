import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { attendanceMetrics, reportAttendanceTone, reportFilterSchema, reportPercentage } from "./report";

const sql = readFileSync(new URL("../../../../supabase/tests/report_metrics.test.sql", import.meta.url), "utf8");
const cases = JSON.parse(sql.match(/jsonb_to_recordset\(\$cases\$([\s\S]*?)\$cases\$/)![1]!) as { name: string; present: number; late: number; absent: number; excused: number; convened: number; attendance_pct: number | null; late_rate: number | null }[];
describe("métrica compartida SQL y core", () => {
  it.each(cases)("$name", ({ name: _name, ...expected }) => {
    const { present, late, absent, excused } = expected;
    expect(attendanceMetrics({ present, late, absent, excused })).toEqual(expected);
  });
  it("valida filtros y conserva la selección múltiple", () => {
    expect(reportFilterSchema.parse({})).toEqual({ period: "month", activity_type_ids: [], include_inactive: false, page: 1, sort: "attendance" });
    for (const filter of [{ period: "custom" }, { period: "custom", from: "2026-08-02", to: "2026-08-01" }, { from: "2026-02-30" }, { page: 0 }, { page: "bad" }, { period: "year" }, { activity_type_ids: ["bad"] }, { include_inactive: "false" }]) {
      expect(reportFilterSchema.safeParse(filter).success).toBe(false);
    }
    expect(reportFilterSchema.parse({ period: "custom", from: "2026-02-28", to: "2026-02-28", activity_type_ids: ["b2c3d4e5-0001-4b3c-8d4e-111111111111", "b2c3d4e5-0003-4b3c-8d4e-333333333333"] }).activity_type_ids).toHaveLength(2);
  });
  it("presenta un decimal, Sin datos y umbrales canónicos", () => {
    expect(reportPercentage(0)).toBe("0.0 %"); expect(reportPercentage(85.7)).toBe("85.7 %");
    expect(reportPercentage(null)).toBe("Sin datos");
    expect(reportAttendanceTone(85)).toContain("green"); expect(reportAttendanceTone(84.9)).toContain("amber");
    expect(reportAttendanceTone(70)).toContain("amber"); expect(reportAttendanceTone(69.9)).toContain("red");
  });
});
