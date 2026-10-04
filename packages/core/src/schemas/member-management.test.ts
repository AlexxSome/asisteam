import { expect, it } from "vitest";
import { coachAssignmentSchema, managedMemberEditSchema, managedMemberUpdateSchema, memberFilterSchema, memberStatusSchema } from "./member-management";
const identity = { group_id: "34000000-0000-4000-8000-000000000201", membership_id: "34000000-0000-4000-8000-000000000301" };
const profile = { full_name: "Persona gestionada", birthdate: "1990-01-01", email: "", phone: null };
it("edición normaliza campos y rechaza privilegios e identidad inyectados", () => {
  expect(managedMemberEditSchema.parse({ ...profile, full_name: " Persona gestionada ", email: " PERSONA@EXAMPLE.TEST " })).toEqual({ ...profile, email: "persona@example.test" });
  for (const extra of [{ account_status: "ACTIVE" }, { auth_user_id: identity.membership_id }, { role: "ADMIN" }, { birthdate: null }, { phone: "123" }]) {
    expect(managedMemberUpdateSchema.safeParse({ ...identity, profile: { ...profile, ...extra } }).success).toBe(false);
  }
});
it("solo admite las dos transiciones explícitas e IDs válidos", () => {
  expect(memberStatusSchema.parse({ ...identity, action: "deactivate" }).action).toBe("deactivate");
  for (const extra of [{ action: "approve" }, { status: "ACTIVE" }, { membership_id: "invalid" }]) expect(memberStatusSchema.safeParse({ ...identity, action: "reactivate", ...extra }).success).toBe(false);
});
it("filtra roles/estados canónicos y limita paginación", () => {
  expect(memberFilterSchema.parse({ role: "ATHLETE", status: "INACTIVE", page: "2" }).page).toBe(2);
  for (const input of [{ role: "OWNER" }, { status: "DELETED" }, { page: 0 }, { page: 100002 }]) {
    expect(memberFilterSchema.safeParse(input).success).toBe(false);
  }
});

it("COACH es canónico y su asignación rechaza identidad/rol inyectados", () => {
  expect(memberFilterSchema.parse({ role: "COACH" }).role).toBe("COACH");
  expect(coachAssignmentSchema.parse(identity)).toEqual(identity);
  expect(coachAssignmentSchema.safeParse({ ...identity, role: "ADMIN" }).success).toBe(false);
  expect(coachAssignmentSchema.safeParse({ ...identity, membership_id: "invalid" }).success).toBe(false);
});

it("normaliza búsqueda literal por nombre y limita su tamaño", () => {
  expect(memberFilterSchema.parse({ search: "  ANA_%  ", page: "2" })).toEqual({ search: "ANA_%", page: 2 });
  expect(memberFilterSchema.parse({ search: "  " }).search).toBe("");
  expect(memberFilterSchema.safeParse({ search: "a".repeat(121) }).success).toBe(false);
  expect(memberFilterSchema.safeParse({ search: ["Ana", "Juan"] }).success).toBe(false);
});
