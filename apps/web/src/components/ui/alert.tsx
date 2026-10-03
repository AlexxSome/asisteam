import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const tones = {
  error: "border-error bg-error-subtle text-error",
  success: "border-success bg-success-subtle text-success",
  warning: "border-warning bg-warning-subtle text-warning",
  info: "border-info bg-info-subtle text-info",
};

export function Alert({ tone = "error", role = tone === "error" ? "alert" : "status", className, ...props }:
  ComponentProps<"div"> & { tone?: keyof typeof tones }) {
  return <div {...props} role={role} className={cn("break-words rounded-md border p-3 text-small", tones[tone], className)} />;
}
