import { cn } from "../../web/src/lib/utils";
import { RouterLink } from "./navigation";
import { createContext, useContext } from "react";
import type { ComponentProps, ReactNode } from "react";
export { Input, Textarea } from "../../web/src/components/ui/input";
export { Field } from "../../web/src/components/ui/field";
export { Alert } from "../../web/src/components/ui/alert";
export {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from "../../web/src/components/ui/card";
export { LoadingState } from "../../web/src/components/ui/loading-state";
export const ShellContentContext=createContext(false);
// Router-specific button adapter preserves the shared visual contract without Next Link.
export function Button({ busy, loading, variant = "primary", children, className = "", ...props }: ComponentProps<"button"> & { busy?: boolean; loading?: boolean; variant?: "primary"|"default"|"secondary"|"outline"|"tertiary"|"destructive" }) {
 const colors=variant === "secondary" || variant === "outline" ? "border border-input bg-surface text-secondary-foreground hover:bg-secondary" : variant === "tertiary" ? "text-primary underline underline-offset-4 hover:bg-secondary" : variant === "destructive" ? "bg-destructive text-primary-foreground" : "bg-primary text-primary-foreground hover:bg-primary-hover";
 return <button {...props} disabled={props.disabled || busy || loading} aria-busy={busy || loading || undefined} className={cn(`inline-flex min-h-control min-w-11 max-w-full items-center justify-center gap-2 whitespace-normal rounded-md px-4 py-2 text-center text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 ${colors}`, className)}>{children}</button>;
}
export function Page({ children }: { children: ReactNode }) {
  const privateRoute = useContext(ShellContentContext);
  const Container = privateRoute ? "div" : "main";
  return (
    <Container
      id={privateRoute ? undefined : "main"}
      tabIndex={-1}
      className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 md:px-6"
    >
      {children}
    </Container>
  );
}

export function ActionLink({href,variant="tertiary",className="",...props}: Omit<import("./navigation").RouterLinkProps,"href"> & {href:string;variant?:"primary"|"secondary"|"tertiary";className?:string}) {
 const colors=variant === "primary" ? "bg-primary text-primary-foreground hover:bg-primary-hover" : variant === "secondary" ? "border border-input bg-surface text-secondary-foreground hover:bg-secondary" : "text-primary underline underline-offset-4 hover:bg-secondary";
 return <RouterLink href={href} {...props} className={cn(`inline-flex min-h-control min-w-11 max-w-full items-center justify-center gap-2 whitespace-normal rounded-md px-4 py-2 text-center text-label transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${colors}`, className)}/>;
}
