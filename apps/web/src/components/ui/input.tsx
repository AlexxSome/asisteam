import * as React from "react";

import { cn } from "@/lib/utils";

const controlClassName = "flex min-h-control w-full min-w-0 rounded-md border border-input bg-surface px-3 py-2 text-body placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-error disabled:cursor-not-allowed disabled:opacity-50";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        controlClassName,
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(controlClassName, "min-h-24 resize-y", className)} />;
}

export { Input, Textarea };
