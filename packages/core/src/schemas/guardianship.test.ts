import { describe, expect, it } from "vitest";
import { guardianshipSchema } from "./guardianship";

const input = { athlete_user_id: "25000000-0000-4000-8000-000000000111", full_name: " Apoderado nuevo ", email: " GUARDIAN@Example.test ", relationship: " Madre " };
describe("registro de apoderados", () => {
  it("normaliza los datos sin aceptar estado, credenciales ni consentimiento", () => {
    expect(guardianshipSchema.parse(input)).toEqual({ ...input, full_name: "Apoderado nuevo", email: "guardian@example.test", relationship: "Madre" });
    for (const extra of [{ account_status: "ACTIVE" }, { guardian_user_id: input.athlete_user_id }, { consent: true }, { password: "password" }]) {
      expect(guardianshipSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
  });
  it.each([{ athlete_user_id: "" }, { full_name: " " }, { email: "no-email" }, { relationship: " " }, { relationship: "a".repeat(41) }])("rechaza campos inválidos: %j", invalid => {
    expect(guardianshipSchema.safeParse({ ...input, ...invalid }).success).toBe(false);
  });
});
