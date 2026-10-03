import { cloneElement, type AriaAttributes, type ReactElement, type ReactNode } from "react";
import { Label } from "./label";

/** One control per field: preserve the caller's help and connect validation errors. */
export function Field({ id, label, help, error, children }: {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: string;
  children: ReactElement<AriaAttributes & { id?: string }>;
}) {
  const describedBy = [children.props["aria-describedby"], help ? `${id}-help` : null, error ? `${id}-error` : null]
    .filter(Boolean).join(" ") || undefined;
  return <div className="min-w-0 space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {cloneElement(children, { id, "aria-invalid": error ? true : children.props["aria-invalid"], "aria-describedby": describedBy })}
    {help && <p id={`${id}-help`} className="text-small text-muted-foreground">{help}</p>}
    {error && <p id={`${id}-error`} className="text-small text-destructive">{error}</p>}
  </div>;
}
