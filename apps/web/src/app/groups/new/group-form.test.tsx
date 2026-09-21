// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mock = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), rotate: vi.fn(), push: vi.fn(), refresh: vi.fn(), join: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mock.push, refresh: mock.refresh }) }));
vi.mock("./actions", () => ({ createGroup: mock.create }));
vi.mock("../[groupId]/actions", () => ({ joinAsAthlete: mock.join, updateGroup: mock.update, rotateInviteCode: mock.rotate }));
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

describe("configuración de grupo", () => {
  const groupId = "20000000-0000-4000-8000-000000000201";
  const initialValues = { name: "Equipo Uno", sport: "Tenis", description: "", logo_url: "" };
  it("edita datos, refresca el grupo y no intenta crear otro", async () => {
    mock.update.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<GroupForm groupId={groupId} initialValues={initialValues} inviteCode="CODE0001" />);
    await user.clear(screen.getByLabelText("Nombre del grupo"));
    await user.type(screen.getByLabelText("Nombre del grupo"), "Club Ñuñoa");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mock.update).toHaveBeenCalledWith(groupId, {
      name: "Club Ñuñoa", sport: "Tenis", description: "", logo_url: "",
    }));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Cambios guardados.");
    expect(mock.refresh).toHaveBeenCalledOnce();
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("muestra el nuevo código sin esperar la recarga y no altera los datos editados", async () => {
    mock.rotate.mockResolvedValue({ code: "CODE0002" });
    const user = userEvent.setup();
    render(<GroupForm groupId={groupId} initialValues={initialValues} inviteCode="CODE0001" />);
    await user.click(screen.getByRole("button", { name: "Regenerar código" }));
    await waitFor(() => expect(mock.rotate).toHaveBeenCalledWith(groupId));
    expect(screen.getByLabelText("Código de invitación").textContent).toBe("CODE0002");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Enlace para unirse" }).value)
      .toBe(`${window.location.origin}/join?code=CODE0002`);
    expect(mock.refresh).toHaveBeenCalledOnce();
  });
  it("comparte un enlace que contiene el código vigente", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<GroupForm groupId={groupId} initialValues={initialValues} inviteCode="CODE0001" />);
    await user.click(screen.getByRole("button", { name: "Copiar enlace" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join?code=CODE0001`);
    expect(screen.getByText("Enlace copiado.")).toBeTruthy();
  });
  it("conserva el código vigente si falla la rotación", async () => {
    mock.rotate.mockResolvedValue({ error: { code: "invite_code_rotate_failed", message: "No pudimos regenerar el código.", details: {} } });
    const user = userEvent.setup();
    render(<GroupForm groupId={groupId} initialValues={initialValues} inviteCode="CODE0001" />);
    await user.click(screen.getByRole("button", { name: "Regenerar código" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No pudimos regenerar el código.");
    expect(screen.getByLabelText("Código de invitación").textContent).toBe("CODE0001");
    expect(mock.refresh).not.toHaveBeenCalled();
  });
});
