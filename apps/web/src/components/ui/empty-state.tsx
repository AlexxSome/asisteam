import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="min-w-0 space-y-3 rounded-lg border border-border bg-surface p-6 [overflow-wrap:anywhere]">
    {title && <h2 className="text-h3 text-foreground">{title}</h2>}
    <div className="text-small text-muted-foreground">{children}</div>
    {action && <div className="flex flex-wrap gap-3">{action}</div>}
  </section>;
}
