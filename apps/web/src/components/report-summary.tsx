import type { ReactNode } from "react";
import { reportPercentage } from "@asisteam/core/browser";
import { reportAttendanceClass } from "../attendance-presentation";

/** Presentation only: values and scope come from each authorized report DTO. */
export function ReportSummary({ label, items, children }: {
  label: string;
  items: { label: string; value: number | null; percentage?: boolean; attendance?: boolean; description: string }[];
  children?: ReactNode;
}) {
  return <section aria-label={label} className="min-w-0 space-y-4">
    <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map(item => <div key={item.label} className="min-w-0 space-y-2 rounded-lg border border-border bg-surface p-4">
        <dt className="text-small text-muted-foreground">{item.label}</dt>
        <dd className={`break-words text-display tabular-nums ${item.attendance ? reportAttendanceClass(item.value) : ""}`}>
          {item.percentage ? reportPercentage(item.value) : item.value}
        </dd>
        <dd className="text-small text-muted-foreground">{item.description}</dd>
      </div>)}
    </dl>
    {children}
  </section>;
}
