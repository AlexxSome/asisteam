import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { httpSchemas, MEMBERSHIP_ROLES } from '@asisteam/core/runtime';
import type { AuthenticatedTransaction } from './database.js';

export type MembershipRole = typeof MEMBERSHIP_ROLES[number];
/** Called inside the authenticated transaction, never from JWT roles. */
export async function requireMembership(transaction: AuthenticatedTransaction, groupId: string, allowed?: readonly MembershipRole[]) {
  const { rows } = await transaction.query<{ role: MembershipRole }>('select role from public.memberships where group_id = $1 and user_id = $2 and status = \'ACTIVE\' order by role', [groupId, transaction.userId]);
  const roles = rows.map(row => row.role);
  if (!roles.length) throw new NotFoundException();
  if (allowed && !roles.some(role => allowed.includes(role))) throw new ForbiddenException();
  return roles;
}
/** Projection is allowlisted and validated; member and ADMIN are distinct DTOs. */
export function projectGroupDetail(row: Record<string, unknown>, roles: readonly MembershipRole[]) {
  const shared = { id: row.id, name: row.name, sport: row.sport, logo_url: row.logo_url, description: row.description, can_view_group_stats: row.can_view_group_stats, roles: [...roles] };
  return httpSchemas.GroupDetail.parse(roles.includes('ADMIN') ? { ...shared, access: 'admin', invite_code: row.invite_code, settings: row.settings, settings_updated_at: row.settings_updated_at, settings_updated_by_name: row.settings_updated_by_name } : { ...shared, access: 'member' });
}
