import type { ReactNode } from "react";

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-border bg-surface p-6 text-small text-muted-foreground">{children}</p>;
}
