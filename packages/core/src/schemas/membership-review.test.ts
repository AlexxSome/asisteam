import { describe, expect, it } from "vitest";
import { membershipApprovalBlock, membershipReviewSchema, type PendingMembership } from "./membership-review";

const member: PendingMembership = {
  membership_id: "26000000-0000-4000-8000-000000000311", full_name: "Deportista",
  is_minor: true, guardian_linked: true, guardian_ready: true, requires_managed_consent: false,
};

describe("revisión de incorporaciones", () => {
  it("acepta solo identidad y decisiones del contrato", () => {
    const input = { group_id: "26000000-0000-4000-8000-000000000201", membership_id: member.membership_id, decision: "approve" };
    expect(membershipReviewSchema.safeParse(input).success).toBe(true);
    expect(membershipReviewSchema.safeParse({ ...input, decision: "reject" }).success).toBe(true);
    for (const invalid of [{ ...input, decision: "ACTIVE" }, { ...input, group_id: "bad" },
      { ...input, membership_id: "" }, { ...input, guardian_ready: true }]) {
      expect(membershipReviewSchema.safeParse(invalid).success).toBe(false);
    }
  });
  it("exige vínculo, consentimiento y ratificación MANAGED según los datos del servidor", () => {
    expect(membershipApprovalBlock({ ...member, guardian_linked: false })).toBe("Requiere apoderado vinculado");
    expect(membershipApprovalBlock({ ...member, guardian_ready: false })).toContain("consentimiento vigente");
    expect(membershipApprovalBlock({ ...member, requires_managed_consent: true })).toContain("ratificar");
    expect(membershipApprovalBlock(member)).toBeNull();
  });
  it("un pendiente que ya es adulto no requiere apoderado", () => {
    expect(membershipApprovalBlock({ ...member, is_minor: false, guardian_linked: false, guardian_ready: false, requires_managed_consent: true })).toBeNull();
  });
});
