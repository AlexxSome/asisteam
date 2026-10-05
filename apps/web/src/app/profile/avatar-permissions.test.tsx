// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AvatarPermissions } from "./avatar-permissions";
const mock = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
vi.mock("./actions", () => ({ setAvatarPermission: mock.save }));
const permissions = [
  { guardianship_id: "one", full_name: "Pupilo Uno", allows_avatar: false },
  { guardianship_id: "two", full_name: "Pupilo Dos", allows_avatar: true },
];
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it("no autoriza inicialmente y mantiene pending, éxito y error por pupilo", async () => {
  let finish!: (value: unknown) => void;
  mock.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ ok: false, message: "No se pudo retirar" });
  render(<AvatarPermissions permissions={permissions} />);
  expect(mock.save).not.toHaveBeenCalled();
  const first = screen.getByRole("group", { name: "Permiso de imagen de Pupilo Uno" });
  const second = screen.getByRole("group", { name: "Permiso de imagen de Pupilo Dos" });
  fireEvent.click(within(first).getByRole("button", { name: "Autorizar el uso de su foto de perfil" }));
  expect(first.getAttribute("aria-busy")).toBe("true"); expect(second.getAttribute("aria-busy")).toBe("false");
  fireEvent.click(within(second).getByRole("button", { name: "Retirar mi autorización de imagen" }));
  await within(second).findByText("No se pudo retirar");
  expect(within(first).queryByRole("alert")).toBeNull();
  await act(async () => finish({ ok: true, message: "Permiso registrado" }));
  expect(within(first).getByText("Permiso registrado")).toBeTruthy();
  expect(within(second).queryByText("Permiso registrado")).toBeNull();
  expect(mock.save.mock.calls).toEqual([["one", true], ["two", false]]);
  expect(within(first).getByText("Pupilo Uno: imagen autorizada")).toBeTruthy();
  expect(within(second).getByText("Pupilo Dos: imagen autorizada")).toBeTruthy();
});
it("un fallo de red conserva la decisión anterior y admite reintento", async () => {
  mock.save.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true, message: "Permiso retirado" });
  render(<AvatarPermissions permissions={[permissions[1]!]} />);
  fireEvent.click(screen.getByRole("button", { name: "Retirar mi autorización de imagen" }));
  await screen.findByRole("alert");
  expect(screen.getByText("Pupilo Dos: imagen autorizada")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retirar mi autorización de imagen" }));
  await screen.findByText("Permiso retirado");
  expect(screen.getByText("Pupilo Dos: imagen no autorizada")).toBeTruthy();
});

it("refleja una autorización actualizada por el servidor sin exigir recarga completa", () => {
  const view = render(<AvatarPermissions permissions={[permissions[0]!]} />);
  view.rerender(<AvatarPermissions permissions={[{ ...permissions[0]!, allows_avatar: true }]} />);
  expect(screen.getByRole("button", { name: "Retirar mi autorización de imagen" })).toBeTruthy();
  expect(mock.save).not.toHaveBeenCalled();
});
