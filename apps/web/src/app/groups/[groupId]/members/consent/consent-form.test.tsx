// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ consent: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => ({ consentManagedMember: mock.consent }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
import { ManagedConsentForm } from "./consent-form";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("requiere checkbox explícito y confirma activación después del servidor", async () => {
  mock.consent.mockResolvedValue({ success: true });
  const user = userEvent.setup();
  render(<ManagedConsentForm membershipId="membership-id" fullName="Pupilo" relationship="Tutor" />);
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button"));
  expect(mock.consent).toHaveBeenCalledWith({ membership_id: "membership-id", accepted: true });
  expect((await screen.findByRole("status")).textContent).toContain("activo en el grupo");
});
