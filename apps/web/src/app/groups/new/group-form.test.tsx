// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mock = vi.hoisted(() => ({ create: vi.fn(), push: vi.fn(), refresh: vi.fn(), join: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mock.push, refresh: mock.refresh }) }));
vi.mock("./actions", () => ({ createGroup: mock.create }));
vi.mock("../[groupId]/actions", () => ({ joinAsAthlete: mock.join }));
import { GroupForm } from "./group-form";
import { JoinAsAthlete } from "../[groupId]/join-as-athlete";

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
describe("flujo crear grupo y entrenar", () => {
  it("muestra validación y navega al grupo creado", async () => {
    const user = userEvent.setup();
    mock.create.mockResolvedValue({ groupId: "nuevo-grupo" });
    render(<GroupForm />);
    await user.click(screen.getByRole("button", { name: "Crear grupo" }));
    expect(await screen.findByText("El nombre debe tener al menos 3 caracteres")).toBeTruthy();
    expect(mock.create).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Nombre del grupo"), "Club Ñuñoa");
    await user.type(screen.getByLabelText("Deporte o disciplina"), "Fútbol");
    await user.click(screen.getByRole("button", { name: "Crear grupo" }));
    await waitFor(() => expect(mock.push).toHaveBeenCalledWith("/groups/nuevo-grupo"));
  });
  it("no navega ante fallo y permite reintentar", async () => {
    const user = userEvent.setup();
    mock.create.mockRejectedValue(new Error("network"));
    render(<GroupForm />);
    await user.type(screen.getByLabelText("Nombre del grupo"), "Club Ñuñoa");
    await user.type(screen.getByLabelText("Deporte o disciplina"), "Fútbol");
    await user.click(screen.getByRole("button", { name: "Crear grupo" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Revisa Mis grupos");
    expect(mock.push).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Crear grupo" }).disabled).toBe(false);
  });
  it("guía al perfil si falta fecha de nacimiento y refresca tras incorporarse", async () => {
    const user = userEvent.setup();
    mock.join.mockResolvedValueOnce({ error: { code: "athlete_birthdate_required", message: "Completa tu fecha de nacimiento." } })
      .mockResolvedValueOnce({ success: true });
    render(<JoinAsAthlete groupId="grupo" />);
    await user.click(screen.getByRole("button", { name: "Agregarme como deportista" }));
    expect((await screen.findByRole("link", { name: "Ir a Mi perfil" })).getAttribute("href")).toBe("/profile");
    expect(mock.refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Agregarme como deportista" }));
    await waitFor(() => expect(mock.refresh).toHaveBeenCalledOnce());
  });
});
