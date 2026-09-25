import { describe, expect, it } from "vitest";
import { invitationFormSchema, invitationRequestSchema, invitationTokenSchema, sendInvitationRequestSchema, sentInvitationSchema } from "./invitation";
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
  it("emisión normaliza email y admite únicamente los dos roles dirigidos", () => {
    expect(invitationFormSchema.parse({ email: "  Invitado@Example.test  ", role: "ATHLETE" })).toEqual({ email: "invitado@example.test", role: "ATHLETE" });
    expect(invitationFormSchema.safeParse({ email: "guardian@example.test", role: "GUARDIAN" }).success).toBe(true);
    for (const input of [
      { email: "invalid", role: "ATHLETE" }, { email: "valid@example.test", role: "ADMIN" },
      { email: "valid@example.test", role: "COACH" }, { email: "valid@example.test", role: "ATHLETE", invited_user_id: "victim" },
    ]) expect(invitationFormSchema.safeParse(input).success).toBe(false);
  });
  it("el reenvío identifica invitación y grupo, sin poder cambiar destinatario ni rol", () => {
    const request = { action: "resend", group_id: "23000000-0000-4000-8000-000000000201", invitation_id: "23000000-0000-4000-8000-000000000301" };
    expect(sendInvitationRequestSchema.safeParse(request).success).toBe(true);
    for (const extra of [{ email: "other@example.test" }, { role: "ADMIN" }, { auth_user_id: "actor" }, { token: "chosen-token" }]) {
      expect(sendInvitationRequestSchema.safeParse({ ...request, ...extra }).success).toBe(false);
    }
  });
  it("la respuesta de envío descarta datos privados y valida la expiración", () => {
    const invitation = { id: "23000000-0000-4000-8000-000000000301", status: "PENDING", expires_at: "2026-09-29T12:00:00+00:00" };
    expect(sentInvitationSchema.parse({ ...invitation, email: "private@example.test", invited_user_id: "private", token: "private" })).toEqual(invitation);
    expect(sentInvitationSchema.safeParse({ ...invitation, expires_at: "invalid" }).success).toBe(false);
  });
  it("activación solo recibe la membership del grupo y no permite sustituir destinatario", () => {
    const input = { action: "activate", group_id: "35000000-0000-4000-8000-000000000201", membership_id: "35000000-0000-4000-8000-000000000311" };
    expect(sendInvitationRequestSchema.safeParse(input).success).toBe(true);
    for (const extra of [{ email: "other@example.test" }, { role: "ADMIN" }, { user_id: "victim" }]) {
      expect(sendInvitationRequestSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
  });
});
