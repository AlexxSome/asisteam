import type { ReactNode } from "react";
import { useContext } from "react";
import { Link } from "react-router";
import { SUPPORT_REQUEST_URLS } from "../lib/support";
import { Page, ShellContentContext } from "../ui";
import { PageHeader } from "./ui/page-header";

/** Presentation only; each route retains its forms, legal steps and destination. */
export function AuthPage({ title, description, children }: {
  title: string; description?: ReactNode; children: ReactNode;
}) {
  const privateRoute = useContext(ShellContentContext);
  return <Page className={`max-w-[672px] [overflow-wrap:anywhere] ${privateRoute ? "px-0 py-0 md:px-0" : ""}`}>
    {!privateRoute && <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <Link to="/login" className="inline-flex min-h-11 items-center text-h2 font-semibold text-primary">Asisteam</Link>
      <a href={SUPPORT_REQUEST_URLS.help} className="inline-flex min-h-11 items-center text-small text-primary underline underline-offset-4">Ayuda y soporte</a>
    </header>}
    <section className="space-y-6 rounded-lg border border-border bg-surface p-4 md:p-6">
      <PageHeader title={title} description={description}/>
      <div className="space-y-4">{children}</div>
    </section>
    <footer className="flex flex-wrap gap-x-5 gap-y-2 text-small">
      <Link to="/legal/2026-09-21" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Condiciones de uso y privacidad</Link>
      {privateRoute && <a href={SUPPORT_REQUEST_URLS.help} className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">Consultar ayuda y soporte</a>}
    </footer>
  </Page>;
}
