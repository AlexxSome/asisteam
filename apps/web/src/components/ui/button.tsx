import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { NavigationProgress } from "./navigation-progress";

const buttonVariants = cva(
  "inline-flex min-w-11 max-w-full items-center justify-center gap-2 whitespace-normal rounded-md text-center text-label transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "border border-input bg-surface text-secondary-foreground hover:bg-secondary",
        tertiary: "text-primary underline underline-offset-4 hover:bg-secondary",
        destructive: "bg-destructive text-primary-foreground hover:opacity-90",
        // Keep existing consumers compatible during the gradual migration.
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline: "border border-input bg-surface text-secondary-foreground hover:bg-secondary",
      },
      size: {
        default: "min-h-control px-4 py-2",
        lg: "min-h-control px-8 py-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

function Button({ className, variant, size, disabled, loading = false, children, ...props }: ButtonProps) {
  return (
    <button {...props} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}>
      {loading && <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 motion-safe:animate-spin" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.3" />
        <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" />
      </svg>}
      {children}
    </button>
  );
}

function ActionLink({ className, variant = "tertiary", size, children, ...props }:
  React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link {...props} className={cn(buttonVariants({ variant, size, className }))}>{children}<NavigationProgress /></Link>;
}

export { ActionLink, Button, buttonVariants };
