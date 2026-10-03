// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionLink, Button } from "./button";
import { Field } from "./field";
import { Input, Textarea } from "./input";
import { Pagination } from "./pagination";

afterEach(cleanup);

it("loading conserva el nombre y bloquea la activación hasta terminar", async () => {
  const click = vi.fn();
  const { rerender } = render(<Button loading onClick={click}>Guardar cambios</Button>);
  const button = screen.getByRole("button", { name: "Guardar cambios" });
  expect(button.getAttribute("aria-busy")).toBe("true");
  await userEvent.click(button);
  expect(click).not.toHaveBeenCalled();
  rerender(<Button onClick={click}>Guardar cambios</Button>);
  await userEvent.click(button);
  expect(click).toHaveBeenCalledTimes(1);
});

it("Field conecta etiqueta, ayuda y error sin perder descripciones existentes", () => {
  const { rerender } = render(<>
    <p id="external">Usa tu correo habitual.</p>
    <Field id="email" label="Email" help="Recibirás instrucciones." error="Email inválido">
      <Input aria-describedby="external" />
    </Field>
  </>);
  const input = screen.getByRole("textbox", { name: "Email" });
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(input.getAttribute("aria-describedby")).toBe("external email-help email-error");
  for (const id of input.getAttribute("aria-describedby")!.split(" ")) expect(document.getElementById(id)?.textContent).toBeTruthy();
  rerender(<Field id="note" label="Nota" help="Hasta 500 caracteres"><Textarea /></Field>);
  const note = screen.getByRole("textbox", { name: "Nota" });
  expect(note.getAttribute("aria-describedby")).toBe("note-help");
  expect(note.getAttribute("aria-invalid")).toBeNull();
});

it("ActionLink navega con semántica de enlace", () => {
  render(<ActionLink href="/login">Iniciar sesión</ActionLink>);
  expect(screen.getByRole("link", { name: "Iniciar sesión" }).getAttribute("href")).toBe("/login");
  expect(screen.queryByRole("button")).toBeNull();
});

it("Pagination ejecuta cambios locales y usa enlaces en navegación de servidor", async () => {
  const change = vi.fn();
  const { rerender } = render(<Pagination label="Deportistas" page={1} totalPages={2} onPageChange={change} />);
  expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  expect(change).toHaveBeenCalledExactlyOnceWith(2);
  rerender(<Pagination label="Cobros" page={2} totalPages={3} previousHref="?page=1" nextHref="?page=3" />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("?page=3");
});
