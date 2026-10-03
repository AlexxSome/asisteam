import { describe, expect, it } from "vitest";
import { subscriptionRequestSchema, formatClp } from "./subscription";

describe("suscripción de la entidad", () => {
  const input = { action: "checkout", group_id: "10000000-0000-4000-8000-000000000001", plan_code: "ACADEMY", payer_email: "admin@example.test" };
  it("acepta el plan por grupo y el correo del pagador", () => {
    expect(subscriptionRequestSchema.parse({ ...input, payer_email: " admin@example.test " })).toEqual(input);
  });
  it("rechaza importes, capacidad y confirmaciones elegidos por el cliente", () => {
    for (const extra of [{ amount_clp: 1 }, { athlete_limit: 999999 }, { status: "PAID" }, { provider_id: "fake" }]) {
      expect(subscriptionRequestSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
  });
  it("no admite planes arbitrarios ni acciones de pago manual", () => {
    expect(subscriptionRequestSchema.safeParse({ ...input, plan_code: "FREE" }).success).toBe(false);
    expect(subscriptionRequestSchema.safeParse({ action: "mark_paid", group_id: input.group_id }).success).toBe(false);
  });
  it("formatea CLP sin decimales", () => expect(formatClp(15990)).toContain("15.990"));
});
