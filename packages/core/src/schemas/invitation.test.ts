import { describe, expect, it } from "vitest";
import { invitationRequestSchema, invitationTokenSchema } from "./invitation";
describe("invitaciones", () => {
  it("solo admite tokens URL-safe con tamaño acotado", () => {
    expect(invitationTokenSchema.safeParse("a".repeat(32)).success).toBe(true);
    for (const value of ["short", "../".repeat(20), "a".repeat(257), "a".repeat(30) + "\n"]) {
      expect(invitationTokenSchema.safeParse(value).success).toBe(false);
    }
  });
  it("el cliente no puede elegir rol, grupo ni destinatario", () => {
    expect(invitationRequestSchema.safeParse({ action: "accept", token: "a".repeat(32), role: "ADMIN" }).success).toBe(false);
    expect(invitationRequestSchema.safeParse({ action: "accept", token: "a".repeat(32), user_id: "victim" }).success).toBe(false);
  });
});
