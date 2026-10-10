"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { MEMBERSHIP_ROLE_LABELS } from "@asisteam/core";
import type { MyGroup } from "@/lib/groups";
import { GroupSelector } from "@/app/groups/group-selector";
import { AccountMenu } from "@/components/account-menu";
import { Button } from "@/components/ui/button";
import { ShellIcon, type ShellIconName } from "@/components/shell-icon";
import { NavigationProgress } from "@/components/ui/navigation-progress";

type ShellProps = {
  children: React.ReactNode;
  group?: MyGroup;
  groups?: MyGroup[];
  userId?: string;
  wards?: boolean;
  /** UI-03: complete authorized count; absent until its server DTO is available. */
  pendingApprovals?: number;
};
type NavigationItem = { label: string; href: string; active?: boolean; icon?: ShellIconName };

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
export function AppShell({ children, group, groups = [], userId, wards = false, pendingApprovals }: ShellProps) {
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
    { label: "Visibilidad", icon: "settings", href: `${base}/settings/visibility`, active: suffix === "/settings/visibility" },
    { label: "Tipos de actividad", icon: "settings", href: `${base}/activity-types`, active: suffix === "/activity-types" },
    { label: "Invitaciones", href: `${base}/invitations/new`, active: suffix.startsWith("/invitations/") },
  ];
  const approvalCount = isAdmin && Number.isSafeInteger(pendingApprovals) && pendingApprovals! > 0 ? pendingApprovals : undefined;
  // Labels come from the route contract, never from opaque activity/ward IDs.
  const task = group ? suffix.startsWith("/activities")
    ? suffix.endsWith("/attendance") ? "Toma de asistencia" : suffix.endsWith("/qr") ? "Asistencia QR" : suffix === "/activities/new" ? "Crear actividad" : suffix.endsWith("/edit") ? "Editar actividad" : suffix === "/activities" ? "Actividades" : "Detalle de actividad"
    : suffix === "/settings/visibility" ? "Visibilidad" : suffix === "/members/pending" ? "Aprobaciones" : suffix === "/members/consent" ? "Consentimientos de mis pupilos"
    : suffix.startsWith("/members") ? "Integrantes" : suffix.startsWith("/wards/") ? "Asistencia de mi pupilo" : suffix.startsWith("/announcements") ? "Anuncios"
    : suffix === "/reports" ? "Reportes" : suffix === "/me/history" ? "Mi asistencia" : suffix === "/settings" ? "Configuración del grupo"
    : suffix === "/activity-types" ? "Tipos de actividad" : suffix === "/billing" ? "Suscripción" : suffix === "/guardians" ? "Vincular apoderado" : suffix.startsWith("/invitations/") ? "Invitaciones" : "Inicio"
    : pathname?.startsWith("/profile") ? "Mi perfil" : pathname?.startsWith("/wards") ? "Mis pupilos" : pathname === "/me/history" ? "Mi asistencia por grupo" : pathname === "/groups/new" ? "Crear un grupo" : pathname === "/join" ? "Unirme con código" : pathname === "/welcome" ? "Bienvenida" : "Mis grupos";
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

  const link = ({ label, href, active, icon }: NavigationItem) => <Link key={href} href={href} prefetch={false}
    aria-current={active ? "page" : undefined}
    onClick={() => { setHash(href.includes("#") ? `#${href.split("#")[1]}` : ""); closeMenu(); }}
    className={`flex min-h-11 items-center gap-3 rounded-md border-l-4 px-3 py-2 text-small break-words ${active
      ? "border-primary bg-info-subtle font-semibold text-info"
      : "border-transparent text-foreground hover:bg-muted"}`}>
    <ShellIcon name={icon ?? (label.includes("asistencia") ? "check" : label.includes("Anuncios") ? "notice" : label.includes("Reportes") ? "report" : "people")} />
    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{label}</span>
    {label === "Aprobaciones" && approvalCount !== undefined && <span className="rounded-full bg-warning-subtle px-2 text-caption font-semibold text-warning" ><span aria-hidden="true">{approvalCount}</span><span className="sr-only">{approvalCount} pendientes</span></span>}
    <NavigationProgress />
  </Link>;

  const section = (label: string, items: NavigationItem[], active: boolean, icon: ShellIconName) => <details key={`${label}:${active}`} open={active}>
    <summary className={`min-h-11 cursor-pointer content-center rounded-md px-3 py-2 text-small font-medium ${active ? "bg-muted" : "hover:bg-muted"}`}>
      <span className="inline-flex max-w-full items-center gap-3 align-middle"><ShellIcon name={icon} /><span className="min-w-0 [overflow-wrap:anywhere]">{label}</span></span>
    </summary>
    <div className="ml-3 border-l border-border pl-2">{items.map(link)}</div>
  </details>;

  const context = <div className="space-y-4">
    <Link href={guardianOnly ? "/wards" : "/groups"} className="flex min-h-11 items-center text-h2 font-semibold">Asisteam</Link>
    {group && <div className="flex min-w-0 items-start gap-3">
      <GroupLogo src={group.logo_url} name={group.name} />
      <div className="min-w-0"><p className="text-small font-semibold [overflow-wrap:anywhere]">{group.name}</p>
        <p className="text-caption text-muted-foreground">{group.roles.map(role => MEMBERSHIP_ROLE_LABELS[role]).join(" · ")}</p></div>
    </div>}
    {!group && <p className="text-small text-muted-foreground">Tu cuenta y todos tus grupos</p>}
  </div>;
  const navigation = <div className="space-y-5">
    {context}
    {group && userId && <GroupSelector groups={groups} activeId={group.id} userId={userId} guardianOnly={guardianOnly} />}
    {guardianOnly && link({ href: "/wards", label: "Elegir pupilo", active: pathname?.startsWith("/wards") })}
    {group && <nav aria-label="Navegación del grupo" className="space-y-1">
      <p className="px-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Este grupo</p>
      {link({ label: "Inicio", icon: "home", href: base, active: pathname === base })}
      {link({ label: "Actividades", icon: "calendar", href: `${base}/activities`, active: suffix.startsWith("/activities") && !suffix.endsWith("/attendance") })}
      {section("Asistencia y consulta", [
        { label: "Reportes", href: `${base}/reports`, active: suffix === "/reports" },
        ...(group.roles.includes("ATHLETE") ? [{ label: "Mi asistencia", href: `${base}/me/history`, active: suffix === "/me/history" }] : []),
        ...(group.roles.includes("GUARDIAN") ? [
          { label: "Asistencia de mis pupilos", href: `${base}/reports#ward-attendance-heading`, active: suffix.startsWith("/wards/") },
          { label: "Consentimientos de mis pupilos", href: `${base}/members/consent`, active: suffix === "/members/consent" },
        ] : []),
        { label: "Anuncios", href: `${base}/announcements`, active: suffix.startsWith("/announcements") },
        ...(suffix.endsWith("/attendance") ? [{ label: "Toma de asistencia", href: pathname, active: true }] : []),
      ], suffix === "/reports" || suffix.startsWith("/me/") || suffix.startsWith("/wards/") || suffix === "/members/consent" || suffix.startsWith("/announcements") || suffix.endsWith("/attendance"), "check")}
      {isAdmin && section("Integrantes", [
        { label: "Lista de integrantes", href: `${base}/members`, active: suffix === "/members" || suffix === "/members/new" },
        { label: "Invitaciones", href: `${base}/invitations/new`, active: suffix.startsWith("/invitations/") },
        { label: "Vincular apoderado", href: `${base}/guardians`, active: suffix === "/guardians" },
        { label: "Aprobaciones", href: `${base}/members/pending`, active: suffix === "/members/pending" },
      ], (suffix.startsWith("/members") && suffix !== "/members/consent") || suffix.startsWith("/invitations") || suffix === "/guardians", "people")}
      {isAdmin && section("Gestión", [
        { label: "Configuración del grupo", icon: "settings", href: `${base}/settings`, active: suffix === "/settings" },
        { label: "Visibilidad", icon: "settings", href: `${base}/settings/visibility`, active: suffix === "/settings/visibility" },
        { label: "Tipos de actividad", icon: "settings", href: `${base}/activity-types`, active: suffix.startsWith("/activity-types") },
        { label: "Suscripción", icon: "settings", href: `${base}/billing`, active: suffix === "/billing" },
      ], suffix.startsWith("/settings") || suffix.startsWith("/activity-types") || suffix === "/billing", "settings")}
    </nav>}
    <nav aria-label="Espacio personal" className="space-y-1 border-t border-border pt-4">
      <p className="px-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Todos mis grupos</p>
      {pathname === "/welcome" && link({ label: "Bienvenida", href: "/welcome", active: true })}
      {hasWards && !guardianOnly && link({ label: "Mis pupilos", href: "/wards", active: pathname?.startsWith("/wards") })}
      {link({ label: "Mis grupos", href: "/groups", active: pathname === "/groups" && hash !== "#agenda" })}
      {link({ label: "Mi agenda global", icon: "calendar", href: "/groups#agenda", active: pathname === "/groups" && hash === "#agenda" })}
      {!guardianOnly && link({ label: "Mi asistencia por grupo", href: "/me/history", active: pathname === "/me/history" })}
      {link({ label: "Crear un grupo", href: "/groups/new", active: pathname === "/groups/new" })}
      {link({ label: "Unirme con código", href: "/join", active: pathname === "/join" })}
      {link({ label: "Mi perfil", href: "/profile", active: pathname?.startsWith("/profile") && hash !== "#privacy" })}
      {link({ label: "Ayuda y soporte", href: "/profile#privacy", icon: "notice", active: pathname === "/profile" && hash === "#privacy" })}
    </nav>
  </div>;

  return <div className="min-h-screen">
    <a href="#main-content" onClick={() => document.getElementById("main-content")?.focus()}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:text-primary focus:underline">Saltar al contenido</a>
    <div className="grid min-h-screen lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside aria-label="Contexto y navegación" className="hidden min-w-0 border-r border-border bg-surface px-4 py-6 lg:block">{navigation}</aside>
      <div className="min-w-0">
        <header className="border-b border-border bg-surface px-4 py-2 md:px-6 lg:px-8">
          <div className="flex min-h-12 min-w-0 items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <Button ref={trigger} variant="secondary" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls={menuId}
                className="shrink-0 px-3 lg:hidden" onClick={() => { dialog.current?.showModal(); setMenuOpen(true); }}>Menú</Button>
              <div className="min-w-0 py-1">
                <nav aria-label="Ruta de navegación" className="text-small">
                  <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 [overflow-wrap:anywhere]">
                    <li className={group ? "hidden lg:block" : ""}><Link href={guardianOnly ? "/wards" : "/groups"} className="inline-flex min-h-11 items-center underline underline-offset-4">{guardianOnly ? "Mis pupilos" : "Mis grupos"}</Link></li>
                    {group && <li className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="hidden lg:inline">/</span><span className="lg:hidden"><GroupLogo src={group.logo_url} name={group.name} /></span><Link href={base} className="inline-flex min-h-11 min-w-0 items-center underline underline-offset-4">{group.name}</Link></li>}
                    <li className="min-w-0"><span aria-hidden="true">/ </span><span aria-current="page">{task}</span></li>
                  </ol>
                </nav>
              </div>
            </div>
            <AccountMenu compact />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto min-w-0 max-w-7xl space-y-6 p-4 outline-none md:p-6 lg:p-8">
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
      {navigation}
    </dialog>
  </div>;
}
