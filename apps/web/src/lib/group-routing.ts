import type { MembershipRole } from "@asisteam/core";

export function isGroupId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function activeGroupCookie(userId: string): string {
  return `asisteam-group-${userId}`;
}

export type ActivityReturnParams = { from?: string | string[]; ward?: string | string[]; period?: string | string[]; page?: string | string[] };

export function activityReturnLink(groupId: string, query: ActivityReturnParams = {}) {
  const period = query.period === "past" ? "past" : "upcoming";
  const page = typeof query.page === "string" && /^[1-9]\d{0,5}$/.test(query.page) ? Number(query.page) : 1;
  const filters = `?period=${period}${page > 1 ? `&page=${page}` : ""}#agenda`;
  if (query.from === "agenda") return { href: `/groups${filters}`, label: "Volver a mi agenda global" };
  if (query.from === "wards" && typeof query.ward === "string" && isGroupId(query.ward)) {
    return { href: `/wards/${query.ward}${filters}`, label: "Volver a la agenda de mi pupilo" };
  }
  return { href: `/groups/${groupId}/activities`, label: "Volver a actividades del grupo" };
}

// Secciones equivalentes, sin IDs ni filtros del grupo anterior. La lista
// explícita evita trasladar rutas de administración a otros roles.
export function switchedGroupPath(pathname: string, groupId: string, roles: MembershipRole[]): string {
  const base = `/groups/${groupId}`;
  const path = pathname.split(/[?#]/, 1)[0] ?? "";
  const match = /^\/groups\/([^/]+)(\/.*)?$/.exec(path);
  if (!match || !isGroupId(match[1]!)) return base;
  const suffix = (match[2] ?? "").replace(/\/$/, "");
  if (suffix === "/activities" || suffix.startsWith("/activities/")) return `${base}/activities`;
  if (suffix === "/reports") return `${base}/reports`;
  if (suffix === "/announcements" || suffix.startsWith("/announcements/")) return `${base}/announcements`;
  if (roles.includes("ATHLETE") && suffix === "/me/history") return `${base}/me/history`;
  if (roles.includes("GUARDIAN") && /^\/wards\/[^/]+\/history$/.test(suffix)) return `${base}/reports`;
  if (roles.includes("GUARDIAN") && suffix === "/members/consent") return `${base}/members/consent`;
  if (roles.includes("ADMIN")) {
    if (["/settings", "/settings/visibility", "/billing", "/activity-types", "/guardians", "/invitations/new", "/members/pending"].includes(suffix)) return `${base}${suffix}`;
    if (suffix === "/members" || suffix.startsWith("/members/")) return `${base}/members`;
  }
  return base;
}
