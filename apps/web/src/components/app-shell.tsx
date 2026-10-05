"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { MEMBERSHIP_ROLE_LABELS } from "@asisteam/core";
import type { MyGroup } from "@/lib/groups";
import { GroupSelector } from "@/app/groups/group-selector";
import { AccountMenu } from "@/components/account-menu";
import { Button } from "@/components/ui/button";
import { NavigationProgress } from "@/components/ui/navigation-progress";

type ShellProps = {
  children: React.ReactNode;
  group?: MyGroup;
  groups?: MyGroup[];
  userId?: string;
  wards?: boolean;
};
type NavigationItem = { label: string; href: string; active?: boolean };

export function GroupLogo({ src, name, preview = false }: { src?: string | null; name: string; preview?: boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = src?.trim();
  const available = !!source && /^https?:\/\//i.test(source) && failedSource !== source;
  return <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted ${preview ? "size-16" : "size-8"}`}>
    {available ? <img key={source} src={source} alt={`Logo de ${name || "tu grupo"}`} width={preview ? 64 : 32} height={preview ? 64 : 32}
      referrerPolicy="no-referrer" className="size-full object-contain" onError={() => setFailedSource(source)} />
      : <span role="img" aria-label={`${name || "Tu grupo"}: ${source ? "logo no disponible" : "sin logo"}`} className="text-small font-semibold">
        {name.trim().slice(0, 2).toLocaleUpperCase("es") || "GR"}
      </span>}
  </span>;
}

/** Shared navigation only: access checks remain in the server pages and RLS. */
export function AppShell({ children, group, groups = [], userId, wards = false }: ShellProps) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const titleId = useId();
  const guardianOnly = groups.length > 0 && groups.every(item => item.roles.every(role => role === "GUARDIAN"));
  const hasWards = wards || groups.some(item => item.roles.includes("GUARDIAN")) || group?.roles.includes("GUARDIAN");
  const base = group ? `/groups/${group.id}` : "";
  const suffix = base && pathname?.startsWith(`${base}/`) ? pathname.slice(base.length) : "";
  const isAdmin = group?.roles.includes("ADMIN");
  const managementItems = [
    { label: "Datos y código", href: `${base}/settings`, active: suffix === "/settings" },
    { label: "Visibilidad", href: `${base}/settings/visibility`, active: suffix === "/settings/visibility" },
    { label: "Tipos de actividad", href: `${base}/activity-types`, active: suffix === "/activity-types" },
    { label: "Invitaciones", href: `${base}/invitations/new`, active: suffix.startsWith("/invitations/") },
  ];
  const inManagement = isAdmin && managementItems.some(item => item.active);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);

  function closeMenu() {
    if (dialog.current?.open) dialog.current.close();
    setMenuOpen(false);
  }

  useEffect(() => {
    if (dialog.current?.open) dialog.current.close();
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => {
      if (desktop.matches && dialog.current?.open) {
        dialog.current.close();
        setMenuOpen(false);
        document.getElementById("main-content")?.focus();
      }
    };
    desktop.addEventListener("change", onResize);
    return () => desktop.removeEventListener("change", onResize);
  }, []);

  const link = ({ label, href, active }: NavigationItem) => <Link key={href} href={href} prefetch={false}
    aria-current={active ? "page" : undefined}
    onClick={() => { setHash(href.includes("#") ? `#${href.split("#")[1]}` : ""); closeMenu(); }}
    className={`flex min-h-11 items-center rounded-md border-l-4 px-3 py-2 text-small break-words ${active
      ? "border-primary bg-info-subtle font-semibold text-info"
      : "border-transparent text-foreground hover:bg-muted"}`}>
    <span className="min-w-0 flex-1">{label}</span><NavigationProgress />
  </Link>;

  const section = (label: string, items: NavigationItem[], active: boolean) => <details key={`${label}:${active}`} open={active}>
    <summary className={`min-h-11 cursor-pointer content-center rounded-md px-3 py-2 text-small font-medium ${active ? "bg-muted" : "hover:bg-muted"}`}>
      {label}
    </summary>
    <div className="ml-3 border-l border-border pl-2">{items.map(link)}</div>
  </details>;

  const navigation = <div className="space-y-5">
    {group && userId && <GroupSelector groups={groups} activeId={group.id} userId={userId} guardianOnly={guardianOnly} />}
    {guardianOnly && link({ href: "/wards", label: "Elegir pupilo", active: pathname?.startsWith("/wards") })}
    {group && <nav aria-label="Navegación del grupo" className="space-y-1">
      <p className="px-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Este grupo</p>
      {link({ label: "Inicio", href: base, active: pathname === base })}
      {link({ label: "Actividades", href: `${base}/activities`, active: suffix.startsWith("/activities") && !suffix.endsWith("/attendance") })}
      {section("Asistencia y consulta", [
        { label: "Reportes", href: `${base}/reports`, active: suffix === "/reports" },
        ...(group.roles.includes("ATHLETE") ? [{ label: "Mi asistencia", href: `${base}/me/history`, active: suffix === "/me/history" }] : []),
        ...(group.roles.includes("GUARDIAN") ? [
          { label: "Asistencia de mis pupilos", href: `${base}/reports#ward-attendance-heading`, active: suffix.startsWith("/wards/") },
          { label: "Consentimientos de mis pupilos", href: `${base}/members/consent`, active: suffix === "/members/consent" },
        ] : []),
        { label: "Anuncios", href: `${base}/announcements`, active: suffix.startsWith("/announcements") },
        ...(suffix.endsWith("/attendance") ? [{ label: "Toma de asistencia", href: pathname, active: true }] : []),
      ], suffix === "/reports" || suffix.startsWith("/me/") || suffix.startsWith("/wards/") || suffix === "/members/consent" || suffix.startsWith("/announcements") || suffix.endsWith("/attendance"))}
      {isAdmin && section("Integrantes", [
        { label: "Lista de integrantes", href: `${base}/members`, active: suffix === "/members" || suffix === "/members/new" },
        { label: "Invitaciones", href: `${base}/invitations/new`, active: suffix.startsWith("/invitations/") },
        { label: "Vincular apoderado", href: `${base}/guardians`, active: suffix === "/guardians" },
        { label: "Aprobaciones", href: `${base}/members/pending`, active: suffix === "/members/pending" },
      ], (suffix.startsWith("/members") && suffix !== "/members/consent") || suffix.startsWith("/invitations") || suffix === "/guardians")}
      {isAdmin && section("Gestión", [
        { label: "Configuración del grupo", href: `${base}/settings`, active: suffix.startsWith("/settings") },
        { label: "Tipos de actividad", href: `${base}/activity-types`, active: suffix.startsWith("/activity-types") },
        { label: "Suscripción", href: `${base}/billing`, active: suffix === "/billing" },
      ], suffix.startsWith("/settings") || suffix.startsWith("/activity-types") || suffix === "/billing")}
    </nav>}
    <nav aria-label="Espacio personal" className="space-y-1 border-t border-border pt-4">
      <p className="px-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Todos mis grupos</p>
      {pathname === "/welcome" && link({ label: "Bienvenida", href: "/welcome", active: true })}
      {hasWards && !guardianOnly && link({ label: "Mis pupilos", href: "/wards", active: pathname?.startsWith("/wards") })}
      {link({ label: "Mis grupos", href: "/groups", active: pathname === "/groups" && hash !== "#agenda" })}
      {link({ label: "Mi agenda global", href: "/groups#agenda", active: pathname === "/groups" && hash === "#agenda" })}
      {!guardianOnly && link({ label: "Mi asistencia por grupo", href: "/me/history", active: pathname === "/me/history" })}
      {link({ label: "Crear un grupo", href: "/groups/new", active: pathname === "/groups/new" })}
      {link({ label: "Unirme con código", href: "/join", active: pathname === "/join" })}
      {link({ label: "Mi perfil", href: "/profile", active: pathname?.startsWith("/profile") })}
    </nav>
  </div>;

  return <div className="min-h-screen">
    <a href="#main-content" onClick={() => document.getElementById("main-content")?.focus()}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:text-primary focus:underline">Saltar al contenido</a>
    <header className="border-b border-border bg-surface px-4 py-2 md:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Button ref={trigger} variant="secondary" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls={menuId}
              className="px-3 lg:hidden" onClick={() => { dialog.current?.showModal(); setMenuOpen(true); }}>Menú</Button>
            <Link href={guardianOnly ? "/wards" : "/groups"} className="flex min-h-11 items-center font-semibold">Asisteam</Link>
          </div>
          <AccountMenu compact />
        </div>
        <div className="flex min-w-0 items-center gap-2 pb-1">
          {group?.logo_url && <GroupLogo key={group.logo_url} src={group.logo_url} name={group.name} />}
          <div className="min-w-0">
            <p className="text-small font-semibold [overflow-wrap:anywhere]">{group?.name ?? "Espacio personal"}</p>
            <p className="text-caption text-muted-foreground">{group ? group.roles.map(role => MEMBERSHIP_ROLE_LABELS[role]).join(" · ") : "Tu cuenta y todos tus grupos"}</p>
          </div>
        </div>
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden min-w-0 border-r border-border bg-surface p-4 lg:block">{navigation}</aside>
      <main id="main-content" tabIndex={-1} className="min-w-0 space-y-6 p-4 outline-none md:p-6 lg:p-8">
        {inManagement && <nav aria-label="Gestión del grupo" className="space-y-2 border-b pb-4">
          <p className="text-caption font-semibold text-muted-foreground">Gestión del grupo</p>
          <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{managementItems.map(item => <li key={item.href} className="min-w-0">
            <Link href={item.href} prefetch={false} aria-current={item.active ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-md border px-3 py-2 text-small ${item.active ? "border-primary bg-info-subtle font-semibold text-info" : "hover:bg-muted"}`}>
              {item.label}<NavigationProgress />
            </Link>
          </li>)}</ul>
        </nav>}
        {children}
      </main>
    </div>
    <dialog ref={dialog} id={menuId} aria-labelledby={titleId}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        // Also wrap at the boundary so Tab never leaves for the browser chrome.
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
        )].filter(control => control.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClose={() => { setMenuOpen(false); if (trigger.current?.getClientRects().length) trigger.current.focus(); }}
      className="fixed inset-y-0 left-0 m-0 h-dvh max-h-dvh w-80 max-w-full overflow-y-auto border-0 border-r border-border bg-surface p-4 text-foreground backdrop:bg-foreground/40">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-h2">Navegación</h2>
        <Button variant="secondary" autoFocus onClick={closeMenu}>Cerrar</Button>
      </div>
      {group && <p className="mb-4 text-small font-semibold [overflow-wrap:anywhere]">{group.name}</p>}
      {navigation}
    </dialog>
  </div>;
}
