// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const actions = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn(), recovery: vi.fn(), reset: vi.fn() }));
vi.mock("./actions", () => ({ loginUser: actions.login }));
vi.mock("../register/actions", () => ({ registerUser: actions.register }));
vi.mock("../forgot-password/actions", () => ({ requestPasswordRecovery: actions.recovery }));
vi.mock("../reset-password/actions", () => ({ resetPassword: actions.reset }));
vi.mock("@/components/social-login-buttons", () => ({ SocialLoginButtons: () => null }));
import { LoginForm } from "./login-form";
import { RegisterForm } from "../register/register-form";
import { ForgotPasswordForm } from "../forgot-password/forgot-password-form";
import { ResetPasswordForm } from "../reset-password/reset-password-form";

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

const cases = [
  { name: "login", element: <LoginForm />, action: actions.login, label: "Iniciar sesión", fields: { email: "persona@example.test", password: "test-password-123" }, result: { error: "Credenciales incorrectas" } },
  { name: "registro", element: <RegisterForm />, action: actions.register, label: "Crear cuenta", fields: { full_name: "Persona Sintética", email: "persona@example.test", birthdate: "2000-01-01", password: "test-password-123" }, result: { error: "No se pudo completar el registro" } },
  { name: "recuperación", element: <ForgotPasswordForm />, action: actions.recovery, label: "Enviar instrucciones", fields: { email: "persona@example.test" }, result: { message: "Si existe una cuenta, recibirás instrucciones." } },
  { name: "restablecimiento", element: <ResetPasswordForm token="synthetic-token" />, action: actions.reset, label: "Guardar nueva contraseña", fields: { password: "test-password-123", confirmPassword: "test-password-123" }, result: { error: "El enlace expiró" } },
];

it.each(cases)("$name vincula errores al campo y enfoca el primero inválido", async ({ element, label }) => {
  const { container } = render(element);
  await userEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => expect(container.querySelector('[aria-invalid="true"]')).toBeTruthy());
  const invalid = container.querySelectorAll<HTMLInputElement>('[aria-invalid="true"]');
  for (const field of invalid) {
    const ids = field.getAttribute("aria-describedby")!.split(" ");
    expect(ids).toContain(`${field.id}-error`);
    for (const id of ids) expect(document.getElementById(id)?.textContent).toBeTruthy();
  }
  expect(document.activeElement).toBe(invalid[0]);
});

it.each(cases)("$name mantiene etiqueta y rechaza dos submits simultáneos", async ({ element, label, fields, action, result }) => {
  let finish!: (value: unknown) => void;
  action.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { container } = render(element);
  for (const [id, value] of Object.entries(fields)) fireEvent.change(container.querySelector(`#${id}`)!, { target: { value } });
  if (container.querySelector("input[type=checkbox]")) await userEvent.click(screen.getByRole("checkbox"));
  const form = container.querySelector("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  const button = screen.getByRole("button", { name: label });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button.textContent?.trim()).toBe(label);
  fireEvent.submit(form);
  expect(action).toHaveBeenCalledTimes(1);
  await act(async () => finish(result));
  expect(screen.getByText(result.message ?? result.error!)).toBeTruthy();
});

it.each(cases)("$name permite reintentar un fallo de transporte y conserva el formulario", async ({ element, label, fields, action, result }) => {
  action.mockRejectedValueOnce(new Error("detalle privado del transporte")).mockResolvedValueOnce(result);
  const { container } = render(element);
  for (const [id, value] of Object.entries(fields)) fireEvent.change(container.querySelector(`#${id}`)!, { target: { value } });
  if (container.querySelector("input[type=checkbox]")) await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: label }));
  expect((await screen.findByRole("alert")).textContent).toContain("No pudimos conectar");
  expect(container.textContent).not.toContain("detalle privado");
  for (const [id, value] of Object.entries(fields)) expect(container.querySelector<HTMLInputElement>(`#${id}`)!.value).toBe(value);
  expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  expect(screen.getByText(result.message ?? result.error!)).toBeTruthy();
});

it.each([
  { element: <LoginForm />, label: "Contraseña", toggle: "Mostrar contraseña", autocomplete: "current-password" },
  { element: <RegisterForm />, label: "Contraseña", toggle: "Mostrar contraseña", autocomplete: "new-password" },
  { element: <ResetPasswordForm token="synthetic" />, label: "Nueva contraseña", toggle: "Mostrar nueva contraseña", autocomplete: "new-password" },
  { element: <ResetPasswordForm token="synthetic" />, label: "Confirmar nueva contraseña", toggle: "Mostrar confirmación de contraseña", autocomplete: "new-password" },
])("$label admite pegado y alterna visibilidad por teclado sin perder valor", async ({ element, label, toggle, autocomplete }) => {
  const user = userEvent.setup();
  render(element);
  const input = screen.getByLabelText(label, { exact: true }) as HTMLInputElement;
  input.focus();
  await user.paste("clave sintética pegada");
  expect(input.type).toBe("password");
  expect(input.autocomplete).toBe(autocomplete);
  const button = screen.getByRole("button", { name: toggle });
  await user.tab();
  expect(document.activeElement).toBe(button);
  await user.keyboard("{Enter}");
  expect(input.type).toBe("text");
  expect(input.value).toBe("clave sintética pegada");
  expect(button.getAttribute("aria-pressed")).toBe("true");
  expect(button.getAttribute("aria-controls")).toBe(input.id);
  await user.keyboard(" ");
  expect(input.type).toBe("password");
  expect(button.getAttribute("aria-pressed")).toBe("false");
});

it("registro pasa la invitación a la acción sin mezclarla con los datos del perfil", async () => {
  actions.register.mockResolvedValue({ error: "Inténtalo nuevamente" });
  const { container } = render(<RegisterForm inviteCode="ABCD1234" />);
  for (const [id, value] of Object.entries(cases[1]!.fields)) fireEvent.change(container.querySelector(`#${id}`)!, { target: { value } });
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
  expect(actions.register).toHaveBeenCalledWith(expect.objectContaining({ email: "persona@example.test" }), "ABCD1234");
});

it("recuperación pasa el contexto a la acción y orienta el retorno entre dispositivos", async () => {
  actions.recovery.mockResolvedValue({ message: "Si el email existe, enviamos instrucciones" });
  render(<ForgotPasswordForm inviteCode="ABCD1234" />);
  await userEvent.type(screen.getByLabelText("Email"), "persona@example.test");
  await userEvent.click(screen.getByRole("button", { name: "Enviar instrucciones" }));
  expect(actions.recovery).toHaveBeenCalledWith({ email: "persona@example.test" }, "ABCD1234");
  expect(await screen.findByText(/Abre el enlace en este navegador/)).toBeTruthy();
});

it("restablecimiento exitoso elimina token de la URL y conserva invitación al iniciar sesión", async () => {
  window.history.replaceState(null, "", "/reset-password?token=synthetic&invite_code=ABCD1234");
  actions.reset.mockResolvedValue({ success: true });
  const { container } = render(<ResetPasswordForm token="synthetic" inviteCode="ABCD1234" />);
  for (const [id, value] of Object.entries(cases[3]!.fields)) fireEvent.change(container.querySelector(`#${id}`)!, { target: { value } });
  await userEvent.click(screen.getByRole("button", { name: "Guardar nueva contraseña" }));
  expect((await screen.findByRole("link", { name: "Iniciar sesión" })).getAttribute("href")).toBe("/login?invite_code=ABCD1234");
  expect(window.location.search).toBe("?invite_code=ABCD1234");
  expect(screen.queryByLabelText("Nueva contraseña", { exact: true })).toBeNull();
});
