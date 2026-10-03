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
