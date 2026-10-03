import { ActionLink } from "./button";
import { unavailableResource } from "@/lib/resource-state";

export function UnavailableState() {
  return <section className="mx-auto max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-6 [overflow-wrap:anywhere]">
    <h1 className="text-h1">{unavailableResource.title}</h1>
    <p className="text-muted-foreground">{unavailableResource.description}</p>
    <ActionLink href="/groups" variant="primary">Volver a mis grupos</ActionLink>
  </section>;
}
