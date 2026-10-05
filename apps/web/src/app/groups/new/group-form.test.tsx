// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(await screen.findByRole("status", { name: "" })).toHaveProperty("textContent", "Cambios guardados.");
    expect(mock.refresh).toHaveBeenCalledOnce();
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("muestra el nuevo código sin esperar la recarga y no altera los datos editados", async () => {
    mock.rotate.mockResolvedValue({ code: "CODE0002" });
    const user = userEvent.setup();
    render(<GroupForm groupId={groupId} initialValues={initialValues} inviteCode="CODE0001" />);
    await user.click(screen.getByRole("button", { name: "Regenerar código" }));
    expect(mock.rotate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar regeneración" }));
    await waitFor(() => expect(mock.rotate).toHaveBeenCalledWith(groupId));
    expect(screen.getByRole("status", { name: "Código de invitación" }).textContent).toBe("CODE0002");
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
    expect(mock.rotate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar regeneración" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No pudimos regenerar el código.");
    expect(screen.getByRole("status", { name: "Código de invitación" }).textContent).toBe("CODE0001");
    expect(mock.refresh).not.toHaveBeenCalled();
  });
});


it("advierte el primer pago antes de crear, sin agregar un paso obligatorio", () => {
  render(<GroupForm />);
  expect(screen.getByRole("complementary", { name: "Antes de crear tu grupo" }).textContent).toContain("0 cupos");
  expect(screen.getByText(/No hay plan gratuito ni prueba gratuita/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Crear grupo" })).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();
});
it("ADMIN puede gestionar su plan ante error de cupos y un reintento limpia el enlace", async () => {
  mock.join.mockResolvedValueOnce({ error: { code: "subscription_athlete_limit", message: "Solicita al administrador" } })
    .mockResolvedValueOnce({ error: { code: "athlete_birthdate_required", message: "Completa tu fecha" } });
  render(<JoinAsAthlete groupId="grupo" />);
  await userEvent.click(screen.getByRole("button", { name: "Agregarme como deportista" }));
  expect((await screen.findByRole("link", { name: "Gestionar plan" })).getAttribute("href")).toBe("/groups/grupo/billing");
  expect(screen.getByRole("alert").textContent).not.toContain("Solicita al administrador");
  expect(mock.refresh).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Agregarme como deportista" }));
  await screen.findByRole("link", { name: "Ir a Mi perfil" });
  expect(screen.queryByRole("link", { name: "Gestionar plan" })).toBeNull();
});


it("cancelar con Escape devuelve foco y no invalida el código", async () => {
  const user = userEvent.setup();
  render(<GroupForm groupId="grupo" inviteCode="CODE0001" />);
  const trigger = screen.getByRole("button", { name: "Regenerar código" });
  await user.click(trigger);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.getByRole("group", { name: "¿Reemplazar el código de invitación?" }).textContent).toContain("CODE0001");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("button", { name: "Confirmar regeneración" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(mock.rotate).not.toHaveBeenCalled();
});
it("bloquea doble confirmación y mantiene éxito junto al código", async () => {
  let finish!: (value: unknown) => void;
  mock.rotate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const user = userEvent.setup();
  render(<GroupForm groupId="grupo" inviteCode="CODE0001" />);
  await user.click(screen.getByRole("button", { name: "Regenerar código" }));
  await user.dblClick(screen.getByRole("button", { name: "Confirmar regeneración" }));
  expect(mock.rotate).toHaveBeenCalledOnce();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Confirmar regeneración" }).disabled).toBe(true);
  await act(async () => finish({ code: "CODE0002" }));
  expect(screen.getByRole("status", { name: "" }).closest("section")?.id).toBe("invite");
  expect(screen.getByRole("status", { name: "" }).textContent).toContain("Código regenerado");
});
it("error al copiar es local y ofrece copia manual", async () => {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  render(<GroupForm groupId="grupo" inviteCode="CODE0001" />);
  await user.click(screen.getByRole("button", { name: "Copiar enlace" }));
  expect(screen.getByRole("status", { name: "" }).textContent).toContain("copiarlo manualmente");
  expect(screen.getByRole("status", { name: "" }).closest("section")?.id).toBe("invite");
});
it("preview del logo cae a iniciales si falla y permite cambiar de URL", () => {
  render(<GroupForm initialValues={{ name: "Club local", sport: "Tenis", logo_url: "https://example.test/logo.png" }} />);
  const preview = screen.getByLabelText("Vista previa del logo");
  fireEvent.error(within(preview).getByRole("img", { name: "Logo de Club local" }));
  expect(within(preview).getByRole("img", { name: "Club local: logo no disponible" }).textContent).toBe("CL");
  fireEvent.change(screen.getByLabelText("URL del logo (opcional)"), { target: { value: "https://example.test/new.png" } });
  expect(within(preview).getByRole("img", { name: "Logo de Club local" }).getAttribute("src")).toContain("new.png");
  fireEvent.change(screen.getByLabelText("URL del logo (opcional)"), { target: { value: "javascript:bad" } });
  expect(within(preview).getByRole("img", { name: "Club local: logo no disponible" })).toBeTruthy();
});
