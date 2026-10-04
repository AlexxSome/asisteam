import { describe, expect, it } from "vitest";
import { ACCOUNT_TERMS_VERSION, accountConsentSchema } from "./account-consent";
import { invitationRegistrationSchema, managedClaimSchema, registerSchema } from "./register";

const profile = { full_name: "Persona sintética", email: "person@example.test", password: "Synthetic-password-107", birthdate: "1990-01-01" };
describe("aceptación de condiciones compartida", () => {
  it.each([registerSchema, invitationRegistrationSchema, managedClaimSchema])("email, invitación y claim exigen true y versión vigente", schema => {
    const values = schema === managedClaimSchema ? { email: profile.email, password: profile.password } : profile;
    const accepted = { ...values, terms_accepted: true, terms_version: ACCOUNT_TERMS_VERSION };
    expect(schema.safeParse(accepted).success).toBe(true);
    for (const terms_accepted of [undefined, false, null, "true", 1]) expect(schema.safeParse({ ...accepted, terms_accepted }).success).toBe(false);
    for (const terms_version of [undefined, null, "2020-01-01"]) expect(schema.safeParse({ ...accepted, terms_version }).success).toBe(false);
  });
  it("descarta fecha, canal, identidad y permisos de menores elegidos por cliente", () => {
    expect(accountConsentSchema.parse({ terms_accepted: true, terms_version: ACCOUNT_TERMS_VERSION,
      granted_at: "2000-01-01", user_id: "other", channel: "INVITATION", allows_avatar: true,
    })).toEqual({ terms_accepted: true, terms_version: ACCOUNT_TERMS_VERSION });
  });
});
