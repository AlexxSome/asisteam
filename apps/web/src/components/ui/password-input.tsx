"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "./input";
import { Button } from "./button";

/** Forward Field's ARIA attributes and the form ref to the actual input. */
export function PasswordInput({ visibilityLabel = "contraseña", ...props }:
  Omit<ComponentProps<"input">, "type"> & { visibilityLabel?: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="flex min-w-0 items-start gap-2">
    <Input {...props} type={visible ? "text" : "password"} />
    <Button type="button" variant="secondary" className="shrink-0 px-3"
      disabled={props.disabled} aria-controls={props.id} aria-pressed={visible}
      aria-label={`Mostrar ${visibilityLabel}`} onClick={() => setVisible(value => !value)}>
      {visible ? "Ocultar" : "Mostrar"}
    </Button>
  </div>;
}
