import { describe, expect, it } from "vitest";
import { checkinInputSchema, checkinPath, parseCheckinFragment, qrCheckinSettingsSchema } from "./check-in";

const input = { activity_id: "58000000-0000-4000-8000-000000000501", token: "a".repeat(64) };
describe("contrato QR", () => {
  it("conserva el token solo en fragmento y acepta el recorrido de ida y vuelta", () => {
    const path = checkinPath(input);
    expect(path).toBe(`/check-in#activity_id=${input.activity_id}&token=${input.token}`);
    expect(parseCheckinFragment(new URL(path, "https://asisteam.test").hash)).toEqual(input);
  });
  it("rechaza payloads con identidad/estado/hora falsificados y enlaces ambiguos", () => {
    for (const extra of [{ user_id: input.activity_id }, { status: "PRESENT" }, { recorded_at: "ayer" }]) {
      expect(checkinInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
    for (const fragment of ["", "#token=a", `#activity_id=${input.activity_id}&token=${input.token}&token=${input.token}`, `#activity_id=${input.activity_id}&token=${input.token}&next=//evil.test`]) {
      expect(parseCheckinFragment(fragment)).toBeNull();
    }
    expect(checkinInputSchema.safeParse({ ...input, token: "a".repeat(63) }).success).toBe(false);
  });
  it("valida ajustes del grupo y relaciones entre sus tiempos", () => {
    const settings = { opens_before_minutes: 15, closes_after_minutes: 60, late_after_minutes: 10 };
    expect(qrCheckinSettingsSchema.safeParse(settings).success).toBe(true);
    for (const patch of [{ opens_before_minutes: -1 }, { opens_before_minutes: 1441 }, { closes_after_minutes: 0 }, { late_after_minutes: 61 }, { late_after_minutes: 1.5 }, { opens_before_minutes: "15" }, { extra: 0 }]) {
      expect(qrCheckinSettingsSchema.safeParse({ ...settings, ...patch }).success).toBe(false);
    }
  });
});
