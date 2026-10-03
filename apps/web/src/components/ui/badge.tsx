import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return <span {...props} className={cn("inline-flex rounded-md border border-border bg-neutral-subtle px-2 py-1 text-small text-neutral", className)} />;
}
