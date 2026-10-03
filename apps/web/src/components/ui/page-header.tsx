import type { ReactNode } from "react";

export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return <header className="min-w-0 space-y-2">
    <h1 className="break-words text-h1">{title}</h1>
    {description && <p className="text-body text-muted-foreground">{description}</p>}
    {children}
  </header>;
}
