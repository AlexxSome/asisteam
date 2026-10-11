import type { ComponentProps, ReactNode } from "react";
export { Input } from "../../web/src/components/ui/input";
export { Field } from "../../web/src/components/ui/field";
export { Alert } from "../../web/src/components/ui/alert";
export {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from "../../web/src/components/ui/card";
export { LoadingState } from "../../web/src/components/ui/loading-state";
// Router-specific button adapter preserves the shared visual contract without Next Link.
export function Button({
  busy,
  children,
  ...props
}: ComponentProps<"button"> & { busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className="inline-flex min-h-control min-w-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-label text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
    >
      {children}
    </button>
  );
}
export function Page({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 md:px-6"
    >
      {children}
    </main>
  );
}
