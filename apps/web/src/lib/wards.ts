import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { PersistenceSchema } from "@asisteam/db";
import { moduleTransport } from "@/lib/api/config";
import { createServerApiClient } from "@/lib/api/server";
import { ApiClientError } from "@asisteam/api-client";
import { memberOperation } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { isGroupId } from "@/lib/group-routing";
import { getGroup } from "@/lib/groups";

type WardRow = PersistenceSchema["public"]["Views"]["v_my_wards"]["Row"];
type WardGroupRow = PersistenceSchema["public"]["Views"]["v_my_ward_groups"]["Row"];
export type Ward = WardRow & { athlete_user_id: string; full_name: string; groups: WardGroupRow[] };
const wardColumns = "athlete_user_id, full_name, avatar_url, age, days_until_majority";
const loadError = () => new Error("No pudimos cargar tus pupilos. Vuelve a intentarlo.");

export function parseWardsPage(value: string | string[] | undefined) {
  const page = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : 1;
  return Number.isSafeInteger(page) && page > 0 && page <= 1_000_000 ? page : 1;
}

async function withGroups(client: Awaited<ReturnType<typeof createClient>>, rows: WardRow[]): Promise<Ward[]> {
  const wards = rows.flatMap((row) => row.athlete_user_id && row.full_name
    ? [{ ...row, athlete_user_id: row.athlete_user_id, full_name: row.full_name, groups: [] as WardGroupRow[] }] : []);
  if (!wards.length) return [];
  // Una página de pupilos puede superar 100 grupos combinados: no truncar
  // sus pertenencias por el límite de PostgREST.
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.from("v_my_ward_groups")
      .select("athlete_user_id, group_id, name, sport, membership_status")
      .in("athlete_user_id", wards.map((ward) => ward.athlete_user_id))
      .order("athlete_user_id").order("name").order("group_id").range(offset, offset + 99);
    if (error) throw loadError();
    for (const group of data ?? []) {
      wards.find((ward) => ward.athlete_user_id === group.athlete_user_id)?.groups.push(group);
    }
    if ((data?.length ?? 0) < 100) break;
  }
  // Si se revoca el último grupo entre consultas, tampoco mostramos el perfil.
  return wards.filter((ward) => ward.groups.length > 0);
}

export async function getMyWards(page = 1, pageSize = 50) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  if (moduleTransport("members") === "nest") {
    const result = await createServerApiClient().listMyWards({ query: { page } });
    return { wards: result.data, hasNext: result.has_next };
  }
  const { data, error } = await client.from("v_my_wards").select(wardColumns)
    .order("full_name").order("athlete_user_id").range((page - 1) * pageSize, page * pageSize);
  if (error) throw loadError();
  return { wards: await withGroups(client, (data ?? []).slice(0, pageSize)), hasNext: (data?.length ?? 0) > pageSize };
}

export async function getGroupWards(groupId: string, page = 1) {
  if (!isGroupId(groupId)) notFound();
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  if (moduleTransport("members") === "nest") {
    const result = await createServerApiClient().listMyWards({ query: { page, group_id: groupId } });
    return { wards: result.data.map(ward => ({ athlete_user_id: ward.athlete_user_id, full_name: ward.full_name })), hasNext: result.has_next };
  }
  // Filtrar en la vista antes de paginar: otros grupos no desplazan a estos pupilos.
  const { data: memberships, error } = await client.from("v_my_ward_groups")
    .select("athlete_user_id").eq("group_id", groupId).eq("membership_status", "ACTIVE")
    .order("athlete_user_id").range((page - 1) * 50, page * 50);
  if (error) throw loadError();
  const ids = (memberships ?? []).slice(0, 50).flatMap((row) => row.athlete_user_id ? [row.athlete_user_id] : []);
  const hasNext = (memberships?.length ?? 0) > 50;
  if (!ids.length) return { wards: [], hasNext };
  const { data, error: profileError } = await client.from("v_my_wards")
    .select("athlete_user_id, full_name").in("athlete_user_id", ids).order("full_name").order("athlete_user_id");
  if (profileError) throw loadError();
  const wards = (data ?? []).flatMap((row) => row.athlete_user_id && row.full_name
    ? [{ athlete_user_id: row.athlete_user_id, full_name: row.full_name }] : []);
  return { wards, hasNext };
}

export async function getWard(athleteUserId: string) {
  if (!isGroupId(athleteUserId)) notFound();
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) notFound();
  if (moduleTransport("members") === "nest") {
    try { return await createServerApiClient().getWard({ params: { athleteUserId } }); }
    catch (error) { if (error instanceof ApiClientError && error.status === 404) notFound(); throw loadError(); }
  }
  const { data, error } = await client.from("v_my_wards").select(wardColumns)
    .eq("athlete_user_id", athleteUserId).maybeSingle();
  if (error) throw loadError();
  if (!data) notFound();
  const ward = (await withGroups(client, [data]))[0];
  if (!ward) notFound();
  return ward;
}

export const getGuardianOnboarding = cache(async (groupId: string, athleteUserId?: string, page = 1) => {
  const group = await getGroup(groupId);
  if (!group.roles.includes("GUARDIAN")) notFound();
  if (athleteUserId !== undefined && !isGroupId(athleteUserId)) notFound();
  const client = await createClient();
  const { data, error } = await memberOperation(() => client.rpc("list_membership_onboarding", {
    p_group_id: group.id, p_as_guardian: true, p_athlete_user_id: athleteUserId, p_offset: (page - 1) * 50,
  }), async api => (await api.listMembershipOnboarding({ query: { group_id: group.id, as_guardian: true, athlete_user_id: athleteUserId, page } })).data);
  if (error) throw new Error("No pudimos cargar los consentimientos. Vuelve a intentarlo.");
  return data ?? [];
});

export const getGuardianTasks = cache(async (groupId: string, athleteUserId?: string) => {
  const memberships = await getGuardianOnboarding(groupId, athleteUserId);
  let consents = memberships.filter(member => member.can_consent).length;
  // Preserve every actionable pending request, including code enrollments.
  for (let offset = 50; offset < (memberships[0]?.total_count ?? 0); offset += 50) {
    const rows = await getGuardianOnboarding(groupId, athleteUserId, offset / 50 + 1);
    consents += rows.filter(member => member.can_consent).length;
  }
  const client = await createClient();
  const activations = await client.rpc("list_managed_activation_requests", { p_group_id: groupId, p_offset: 0, p_athlete_user_id: athleteUserId }).select("total_count").limit(1);
  if (activations.error) throw new Error("No pudimos cargar los consentimientos. Vuelve a intentarlo.");
  return { consents, activations: activations.data?.[0]?.total_count ?? 0, memberships };
});
