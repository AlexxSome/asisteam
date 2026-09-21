import type { MembershipRole } from "@asisteam/core";

export function isGroupId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function activeGroupCookie(userId: string): string {
  return `asisteam-group-${userId}`;
}

// Conserva las secciones disponibles cuando el nuevo rol las admite. Los IDs
// de recursos de otro grupo nunca se trasladan; el resto cae al inicio.
export function switchedGroupPath(pathname: string, groupId: string, roles: MembershipRole[]): string {
  const base = `/groups/${groupId}`;
  const suffix = pathname.replace(/^\/groups\/[^/]+/, "");
  if (roles.includes("ADMIN") && suffix === "/settings") {
    return `${base}${suffix}`;
  }
  return base;
}
