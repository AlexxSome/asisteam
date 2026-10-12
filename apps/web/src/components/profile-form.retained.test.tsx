import React from "react";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileForm } from "./profile-form";
import { navigateWithUnsavedChanges } from "../navigation";

const mock = vi.hoisted(() => ({ save: vi.fn(), upload: vi.fn(), refresh: vi.fn() }));
vi.mock("../navigation", () => ({RouterLink: ({href,children,...props}:{href:string;children?:React.ReactNode})=>React.createElement("a",{href,...props},children),  useUnsavedChanges: (dirty:boolean) => (navigate:()=>void,confirmed=false) => {if(!dirty||confirmed||window.confirm("Tienes cambios sin guardar. ¿Quieres salir y descartarlos?"))navigate();}, navigateWithUnsavedChanges: (navigate:()=>void) => {if(window.confirm("Tienes cambios sin guardar. ¿Quieres salir y descartarlos?"))navigate();}, useRouter: () => ({ refresh: mock.refresh }) }));
vi.mock("../mutations", () => ({ saveProfile: mock.save, uploadAvatar: mock.upload }));
const profile = { id: "test-user", full_name: "Ana Prueba", email: "ana@example.test", phone: null, birthdate: "1990-01-01", avatar_url: null };
const photo = () => new File(["synthetic image"], "foto.png", { type: "image/png" });
const selectPhoto = () => fireEvent.change(screen.getByLabelText("Seleccionar foto"), { target: { files: [photo()] } });
const dirty = () => {
  const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
};
const name = () => screen.getByLabelText("Nombre completo") as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/profile");
  mock.save.mockImplementation(async values => ({ ok: true, message: "Perfil guardado", profile: { ...profile, ...values } }));
  mock.upload.mockResolvedValue({ ok: true, message: "Foto guardada" });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(async () => {
  cleanup();
  await new Promise(resolve => setTimeout(resolve, 20));
  vi.restoreAllMocks(); window.history.replaceState(null, "", "/profile");
});

describe("perfil: operaciones independientes", () => {
  it("guardado y subida tienen pending/feedback propios; conserva foto al guardar datos", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    let finish!: (value: unknown) => void;
    mock.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<ProfileForm profile={profile} avatarAllowed />);
    selectPhoto();
    fireEvent.change(name(), { target: { value: "Ana Editada" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
    expect(screen.getByRole("form", { name: "Datos personales" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("form", { name: "Foto de perfil" }).getAttribute("aria-busy")).toBe("false");
    expect((screen.getByRole("button", { name: "Subir foto" }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => finish({ ok: true, message: "Perfil guardado", profile: { ...profile, full_name: "Ana Editada" } }));
    expect(within(screen.getByRole("form", { name: "Datos personales" })).getByText("Perfil guardado")).toBeTruthy();
    expect(within(screen.getByRole("form", { name: "Foto de perfil" })).queryByText("Perfil guardado")).toBeNull();
    expect(screen.getByAltText("Vista previa de la foto seleccionada")).toBeTruthy();
    expect(mock.upload).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
  it("subir foto conserva el borrador del perfil y no comparte su error", async () => {
    mock.upload.mockResolvedValueOnce({ ok: false, message: "No se pudo subir" });
    render(<ProfileForm profile={profile} avatarAllowed />);
    fireEvent.change(name(), { target: { value: "Mi borrador" } }); selectPhoto();
    fireEvent.click(screen.getByRole("button", { name: "Subir foto" }));
    await screen.findByText("No se pudo subir");
    expect(within(screen.getByRole("form", { name: "Datos personales" })).queryByRole("alert")).toBeNull();
    expect(name().value).toBe("Mi borrador");
    expect(screen.getByAltText("Vista previa de la foto seleccionada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Subir foto" }));
    await screen.findByText("Foto guardada");
    expect(name().value).toBe("Mi borrador");
    // The preview is cleared by the effect reacting to the successful upload.
    await waitFor(() => expect(screen.queryByAltText("Vista previa de la foto seleccionada")).toBeNull());
  });
  it("mantiene valores y protección ante errores de guardado y red", async () => {
    mock.save.mockRejectedValueOnce(new Error("offline"));
    render(<ProfileForm profile={profile} avatarAllowed />);
    fireEvent.change(name(), { target: { value: "Conservar" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
    await screen.findByRole("alert");
    expect(name().value).toBe("Conservar");
    fireEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
    await screen.findByText("Perfil guardado");
  });
  it("usa la fecha devuelta por servidor y no la presenta como aplicada si requiere aprobación", async () => {
    mock.save.mockResolvedValueOnce({ ok: true, profile, message: "Fecha pendiente de aprobación" });
    render(<ProfileForm profile={profile} avatarAllowed />);
    fireEvent.change(screen.getByLabelText("Fecha de nacimiento"), { target: { value: "1991-02-03" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
    await screen.findByText("Fecha pendiente de aprobación");
    expect((screen.getByLabelText("Fecha de nacimiento") as HTMLInputElement).value).toBe(profile.birthdate);
  });
  it("explica email de solo lectura, conecta errores al campo y enfoca el primer error", async () => {
    render(<ProfileForm profile={profile} avatarAllowed />);
    const email = screen.getByLabelText("Email (solo lectura)") as HTMLInputElement;
    expect(email.readOnly).toBe(true); expect(email.disabled).toBe(false);
    expect(email.getAttribute("aria-describedby")).toContain("email-help");
    fireEvent.change(screen.getByLabelText("Teléfono (opcional)"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar perfil" }));
    const phone = screen.getByLabelText("Teléfono (opcional)");
    expect(phone.getAttribute("aria-invalid")).toBe("true");
    expect(phone.getAttribute("aria-describedby")).toBe("phone-help phone-error");
    expect(document.activeElement).toBe(phone); expect(mock.save).not.toHaveBeenCalled();
  });
  it("valida foto antes del upload, libera preview y mantiene bloqueos de menores", () => {
    const view = render(<ProfileForm profile={profile} avatarAllowed />);
    selectPhoto(); expect(URL.createObjectURL).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Seleccionar foto"), { target: { files: [new File(["bad"], "bad.svg", { type: "image/svg+xml" })] } });
    expect(screen.getByRole("alert").textContent).toContain("JPEG, PNG o WebP");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(screen.queryByAltText("Vista previa de la foto seleccionada")).toBeNull();
    expect(mock.upload).not.toHaveBeenCalled();
    view.rerender(<ProfileForm profile={profile} avatarAllowed={false} />);
    expect((screen.getByLabelText("Seleccionar foto") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Subir foto" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Guardar tus datos no otorga esa autorización/)).toBeTruthy();
  });
});

describe("edición del perfil protegida sin almacenar PII", () => {
  it("permite conservar o descartar solo el formulario seleccionado", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ProfileForm profile={profile} avatarAllowed />);
    fireEvent.change(name(), { target: { value: "Editado" } }); selectPhoto();
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios del perfil" }));
    expect(name().value).toBe("Editado");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios del perfil" }));
    expect(name().value).toBe(profile.full_name);
    expect(screen.getByAltText("Vista previa de la foto seleccionada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Descartar foto seleccionada" }));
    expect(screen.queryByAltText("Vista previa de la foto seleccionada")).toBeNull();
  });;
  it("revertir campos elimina la pérdida real y todos los controles permiten teclado", async () => {
    const user = userEvent.setup();
    render(<ProfileForm profile={profile} avatarAllowed />);
    await user.tab(); expect(document.activeElement).toBe(screen.getByLabelText("Email (solo lectura)"));
    await user.tab(); expect(document.activeElement).toBe(name());
    fireEvent.change(name(), { target: { value: "Temporal" } });
    fireEvent.change(name(), { target: { value: profile.full_name } });
  });
});
