// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ update: vi.fn(), refresh: vi.fn() }));
vi.mock("../../actions", () => ({ updateGroupSettings: mock.update }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
import { VisibilityForm } from "./visibility-form";
const initialSettings = { athletes_can_view_group_stats: false, guardians_can_view_group_stats: false };
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it("ambos switches apagados; guarda uno sin enviar ni activar el otro", async () => {
  const user = userEvent.setup();
  mock.update.mockResolvedValue({ settings: { ...initialSettings, athletes_can_view_group_stats: true } });
  render(<VisibilityForm groupId="grupo" initialSettings={initialSettings} />);
  const [athlete, guardian] = screen.getAllByRole<HTMLInputElement>("switch");
  expect(athlete!.checked).toBe(false); expect(guardian!.checked).toBe(false);
  await user.click(athlete!);
  await waitFor(() => expect(mock.update).toHaveBeenCalledWith("grupo", { athletes_can_view_group_stats: true }));
  expect(athlete!.checked).toBe(true); expect(guardian!.checked).toBe(false);
  expect(screen.getByRole("status").textContent).toContain("Visibilidad guardada");
  expect(screen.getByText(/nunca se muestran datos de contacto/)).toBeTruthy();
  expect(mock.refresh).toHaveBeenCalledOnce();
});
it("fallo conserva valor confirmado y permite reintento; no confirma éxito", async () => {
  const user = userEvent.setup();
  mock.update.mockResolvedValueOnce({ error: { message: "No tienes permiso." } }).mockRejectedValueOnce(new Error("network"));
  render(<VisibilityForm groupId="grupo" initialSettings={{ ...initialSettings, guardians_can_view_group_stats: true }} />);
  const guardian = screen.getAllByRole<HTMLInputElement>("switch")[1]!;
  await user.click(guardian);
  expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso.");
  expect(guardian.checked).toBe(true);
  expect(mock.refresh).not.toHaveBeenCalled();
  await user.click(guardian);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("No pudimos confirmar"));
  expect(guardian.checked).toBe(true); expect(guardian.disabled).toBe(false);
});
it("bloquea cambios simultáneos mientras confirma el servidor", async () => {
  const user = userEvent.setup();
  let complete!: (value: unknown) => void;
  mock.update.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  render(<VisibilityForm groupId="grupo" initialSettings={initialSettings} />);
  await user.click(screen.getAllByRole("switch")[0]!);
  expect(screen.getAllByRole<HTMLInputElement>("switch").every((input) => input.disabled)).toBe(true);
  complete({ settings: { athletes_can_view_group_stats: true, guardians_can_view_group_stats: true } });
  await waitFor(() => expect(screen.getAllByRole<HTMLInputElement>("switch").every((input) => input.checked && !input.disabled)).toBe(true));
});
