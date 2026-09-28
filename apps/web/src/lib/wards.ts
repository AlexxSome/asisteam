import { notFound, redirect } from "next/navigation";
import type { Database } from "@asisteam/db";
import { createClient } from "@/lib/supabase/server";
import { isGroupId } from "@/lib/group-routing";

type WardRow = Database["public"]["Views"]["v_my_wards"]["Row"];
type WardGroupRow = Database["public"]["Views"]["v_my_ward_groups"]["Row"];
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

export async function getMyWards(page = 1) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await client.from("v_my_wards").select(wardColumns)
    .order("full_name").order("athlete_user_id").range((page - 1) * 50, page * 50);
  if (error) throw loadError();
  return { wards: await withGroups(client, (data ?? []).slice(0, 50)), hasNext: (data?.length ?? 0) > 50 };
}

export async function getWard(athleteUserId: string) {
  if (!isGroupId(athleteUserId)) notFound();
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) notFound();
  const { data, error } = await client.from("v_my_wards").select(wardColumns)
    .eq("athlete_user_id", athleteUserId).maybeSingle();
  if (error) throw loadError();
  if (!data) notFound();
  const ward = (await withGroups(client, [data]))[0];
  if (!ward) notFound();
  return ward;
}
