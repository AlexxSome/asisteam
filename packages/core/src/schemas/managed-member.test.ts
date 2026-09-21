import { afterEach, describe, expect, it, vi } from "vitest";
import { managedMemberProfileSchema, managedMemberSchema } from "./managed-member";

const profile = { full_name: "Persona gestionada", birthdate: "1990-01-01", email: "" };
afterEach(() => vi.useRealTimers());

describe("perfil MANAGED", () => {
  it("normaliza nombre y email opcional sin pedir credenciales", () => {
    expect(managedMemberProfileSchema.parse({ ...profile, full_name: " Persona gestionada " }))
      .toEqual(profile);
    expect(managedMemberProfileSchema.parse({ ...profile, email: " PERSONA@Example.test " }).email)
      .toBe("persona@example.test");
  });
  it("exige fecha válida y rechaza campos de identidad o privilegios", () => {
    for (const extra of [{ birthdate: null }, { birthdate: "2026-02-30" }, { email: "no-email" },
      { full_name: "A" }, { auth_user_id: "injected" }, { account_status: "ACTIVE" }, { role: "ADMIN" }]) {
      expect(managedMemberProfileSchema.safeParse({ ...profile, ...extra }).success).toBe(false);
    }
  });
  it("evalúa el pasado por día de Chile aun cuando UTC ya cambió", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-22T01:00:00Z"));
    expect(managedMemberProfileSchema.safeParse({ ...profile, birthdate: "2026-09-21" }).success).toBe(false);
    expect(managedMemberProfileSchema.safeParse({ ...profile, birthdate: "2026-09-20" }).success).toBe(true);
  });
  it("exige apoderado y declaración ADMIN solo a menores", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-22T01:00:00Z"));
    const guardian = { full_name: "Apoderado", email: "tutor@example.test", relationship: "Tutor", authorized: true };
    const minor = { ...profile, birthdate: "2008-09-22" };
    expect(managedMemberSchema.safeParse(minor).success).toBe(false);
    expect(managedMemberSchema.safeParse({ ...minor, guardian }).success).toBe(true);
    expect(managedMemberSchema.safeParse({ ...minor, guardian: { ...guardian, authorized: false } }).success).toBe(false);
    expect(managedMemberSchema.safeParse({ ...minor, email: guardian.email, guardian }).success).toBe(false);
    expect(managedMemberSchema.safeParse({ ...minor, birthdate: "2008-09-21" }).success).toBe(true);
    expect(managedMemberSchema.safeParse({ ...profile, guardian }).success).toBe(false);
  });
});
