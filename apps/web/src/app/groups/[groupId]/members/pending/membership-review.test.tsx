// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ review: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => ({ reviewMembership: mock.review }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
import { MembershipReview } from "./membership-review";
const groupId = "26000000-0000-4000-8000-000000000201";
const member = { membership_id: "26000000-0000-4000-8000-000000000311", full_name: "Deportista menor", is_minor: true, guardian_linked: true, guardian_ready: true, requires_managed_consent: false };
beforeEach(() => { mock.review.mockResolvedValue({ success: true }); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("bloquea aprobación sin vínculo, explica el motivo y permite rechazar", async () => {
  render(<MembershipReview groupId={groupId} member={{ ...member, guardian_linked: false, guardian_ready: false }} />);
  const approve = screen.getByRole("button", { name: "Aprobar" }) as HTMLButtonElement;
  expect(approve.disabled).toBe(true);
  expect(document.getElementById(approve.getAttribute("aria-describedby")!)?.textContent).toBe("Requiere apoderado vinculado");
  expect(screen.getByRole("link", { name: "Vincular apoderado" }).getAttribute("href")).toBe(`/groups/${groupId}/guardians`);
  await userEvent.click(screen.getByRole("button", { name: "Rechazar" }));
  expect(mock.review).toHaveBeenCalledWith({ group_id: groupId, membership_id: member.membership_id, decision: "reject" });
  expect((await screen.findByRole("status")).textContent).toContain("inactiva");
});

it.each([{ guardian_ready: false }, { requires_managed_consent: true }])("bloquea los requisitos restantes: %j", extra => {
  render(<MembershipReview groupId={groupId} member={{ ...member, ...extra }} />);
  expect((screen.getByRole("button", { name: "Aprobar" }) as HTMLButtonElement).disabled).toBe(true);
});

it("aprueba un adulto pendiente sin apoderado y actualiza la lista", async () => {
  render(<MembershipReview groupId={groupId} member={{ ...member, is_minor: false, guardian_linked: false, guardian_ready: false }} />);
  expect(screen.getByText("Mayor de edad")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Aprobar" }));
  expect((await screen.findByRole("status")).textContent).toContain("ya aparece en asistencia");
  expect(mock.review).toHaveBeenCalledWith({ group_id: groupId, membership_id: member.membership_id, decision: "approve" });
  expect(mock.refresh).toHaveBeenCalled();
});

it("mantiene ambas decisiones bloqueadas mientras espera al servidor", async () => {
  mock.review.mockReturnValue(new Promise(() => {}));
  render(<MembershipReview groupId={groupId} member={member} />);
  await userEvent.click(screen.getByRole("button", { name: "Aprobar" }));
  for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toContain("Guardando");
  expect(mock.refresh).not.toHaveBeenCalled();
});

it("muestra una decisión concurrente como error y permite actualizar sin éxito falso", async () => {
  mock.review.mockResolvedValue({ error: { message: "Esta incorporación ya fue resuelta. Actualiza la lista." } });
  render(<MembershipReview groupId={groupId} member={member} />);
  await userEvent.click(screen.getByRole("button", { name: "Aprobar" }));
  expect((await screen.findByRole("alert")).textContent).toContain("ya fue resuelta");
  expect(screen.queryByRole("status")).toBeNull();
  expect(mock.refresh).not.toHaveBeenCalled();
});
