import { describe, expect, it } from "vitest";
import { attendanceBatchSchema, attendanceCounts, attendanceRecordSchema } from "./attendance";

const record = { membership_id: "a0000000-0000-4000-8000-000000000001", status: "PRESENT" };
describe("contrato de asistencia", () => {
  it.each(["PRESENT", "ABSENT", "LATE", "EXCUSED"])("acepta %s y nota opcional", (status) => {
    expect(attendanceRecordSchema.parse({ ...record, status })).toEqual({ ...record, status });
    expect(attendanceRecordSchema.parse({ ...record, status, note: null }).note).toBeNull();
  });
  it("valida notas, estado, UUID y campos enviados por el cliente", () => {
    expect(attendanceRecordSchema.safeParse({ ...record, note: "a".repeat(500) }).success).toBe(true);
    for (const change of [{ note: "a".repeat(501) }, { note: 1 }, { status: null }, { status: "UNKNOWN" }, { membership_id: "bad" }, { recorded_by: record.membership_id }]) {
      expect(attendanceRecordSchema.safeParse({ ...record, ...change }).success).toBe(false);
    }
  });
  it("lote de 1 a 500, sin duplicados incluso con UUID en mayúsculas", () => {
    const records = Array.from({ length: 500 }, (_, index) => ({ ...record, membership_id: `a0000000-0000-4000-8000-${index.toString().padStart(12, "0")}` }));
    expect(attendanceBatchSchema.safeParse(records).success).toBe(true);
    expect(attendanceBatchSchema.safeParse([]).success).toBe(false);
    expect(attendanceBatchSchema.safeParse([...records, { ...record, membership_id: "b0000000-0000-4000-8000-000000000501" }]).success).toBe(false);
    expect(attendanceBatchSchema.safeParse([record, { ...record, membership_id: record.membership_id.toUpperCase() }]).success).toBe(false);
  });
  it("separa sin marcar y justificados de los cuatro contadores", () => {
    expect(attendanceCounts([{ status: "PRESENT" }, { status: "LATE" }, { status: "ABSENT" }, { status: "EXCUSED" }, { status: null }, { status: null }])).toEqual({ PRESENT: 1, LATE: 1, ABSENT: 1, EXCUSED: 1, unmarked: 2 });
  });
});
