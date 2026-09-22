import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// RUN_ACTIVITY_TYPE_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run activity-types.integration.test.ts
const suite = describe.skipIf(process.env.RUN_ACTIVITY_TYPE_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue29-${run}-${name}@example.test`;
const clients: Record<string, SupabaseClient> = {};
const authIds: string[] = [];
let service: SupabaseClient;
let groupId: string;
let typeId: string;
function sql(query: string): string {
  return execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}
suite("tipos de actividad con Auth/PostgREST real", () => {
  beforeAll(async () => {
    const config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Solo se admite Supabase local");
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
    for (const name of ["owner", "athlete", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const created = await service.auth.admin.createUser({ email: email(name), password, email_confirm: true, user_metadata: { full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (created.error) throw new Error("No se pudo preparar cuenta sintética");
      authIds.push(created.data.user.id);
      const client = createClient(config.API_URL, config.ANON_KEY, options);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      clients[name] = client;
    }
    const group = await clients.owner!.rpc("create_group", { p_name: "Tipos integración", p_sport: "Tenis" });
    expect(group.error).toBeNull(); groupId = group.data;
    sql(`insert into public.memberships(user_id,group_id,role,status) select id,'${groupId}','ATHLETE','ACTIVE' from public.users where email='${email("athlete")}';`);
  }, 30_000);
  afterAll(async () => {
    if (!service) return;
    const users = `select id from public.users where email like 'issue29-${run}-%@example.test'`;
    const groups = `select id from public.groups where created_by in (${users})`;
    sql(`delete from public.attendance_records where activity_id in (select id from public.activities where group_id in (${groups}));
      delete from public.activities where group_id in (${groups});
      delete from public.activity_types where group_id in (${groups});
      delete from public.memberships where group_id in (${groups});
      delete from public.groups where id in (${groups});
      delete from public.users where id in (${users});`);
    for (const id of authIds) await service.auth.admin.deleteUser(id);
  });
  it("crea tipo y actividad; desactivarlo conserva historial y asistencia y bloquea usos nuevos", async () => {
    const owner = clients.owner!;
    const created = await owner.from("activity_types").insert({ group_id: groupId, name: "  Amistoso  ", color: "#123ABC" }).select("id").single();
    expect(created.error).toBeNull(); typeId = created.data!.id;
    expect((await owner.from("v_activity_types").select("name, color").eq("id", typeId).eq("is_active", true).single()).data)
      .toEqual({ name: "Amistoso", color: "#123ABC" });
    const args = { p_group_id: groupId, p_activity_type_id: typeId, p_title: "Partido histórico", p_starts_at: "2026-07-07T22:30:00Z", p_ends_at: "2026-07-07T23:30:00Z" };
    const activity = await owner.rpc("create_activity", args);
    expect(activity.error).toBeNull();
    const membershipId = sql(`select id from public.memberships where group_id='${groupId}' and role='ATHLETE';`);
    expect((await owner.rpc("record_attendance_bulk", { p_activity_id: activity.data, p_records: [{ membership_id: membershipId, status: "PRESENT" }] })).error).toBeNull();
    const edit = await owner.from("activity_types").update({ name: "Amistoso editado", color: "#ABCDEF", is_active: false }).eq("id", typeId).eq("group_id", groupId).select("id").single();
    expect(edit.error).toBeNull();
    expect((await owner.from("v_activity_types").select("id").eq("id", typeId).eq("is_active", true)).data).toEqual([]);
    expect((await clients.athlete!.from("v_group_activities").select("activity_type_id, activity_type_name, activity_type_color").eq("id", activity.data).single()).data)
      .toEqual({ activity_type_id: typeId, activity_type_name: "Amistoso editado", activity_type_color: "#ABCDEF" });
    expect((await clients.athlete!.from("v_attendance_own").select("status").eq("activity_id", activity.data)).data).toEqual([{ status: "PRESENT" }]);
    expect((await owner.rpc("create_activity", args)).error?.message).toBe("invalid_activity_type");
    expect((await owner.rpc("update_activity", { ...args, p_activity_id: activity.data, p_title: "Histórico actualizado" })).error).toBeNull();
  });
  it("PostgREST aplica unicidad/validación y no permite editar sistema, mover identidad ni borrar", async () => {
    const owner = clients.owner!;
    expect((await owner.from("activity_types").insert({ group_id: groupId, name: " AMISTOSO EDITADO ", color: "#123ABC" })).status).toBe(409);
    expect((await owner.from("activity_types").insert({ group_id: groupId, name: "Color inválido", color: "red" })).error?.code).toBe("23514");
    expect((await owner.from("activity_types").update({ is_active: false }).is("group_id", null).select("id")).data).toEqual([]);
    expect((await owner.from("activity_types").update({ group_id: null }).eq("id", typeId)).status).toBe(403);
    expect((await owner.from("activity_types").delete().eq("id", typeId)).status).toBe(403);
    expect((await owner.from("v_activity_types").select("id").is("group_id", null).eq("is_active", true)).data).toHaveLength(4);
  });
  it("ATHLETE y ajeno no pueden crear ni editar; ajeno no enumera tipos privados", async () => {
    for (const name of ["athlete", "outsider"]) {
      const client = clients[name]!;
      expect((await client.from("activity_types").insert({ group_id: groupId, name: "Ataque", color: "#123ABC" })).status).toBe(403);
      expect((await client.from("activity_types").update({ name: "Ataque", is_active: true }).eq("id", typeId).select("id")).data).toEqual([]);
    }
    expect((await clients.outsider!.from("activity_types").select("id").eq("group_id", groupId)).data).toEqual([]);
    expect((await clients.outsider!.from("v_activity_types").select("id").eq("group_id", groupId)).data).toEqual([]);
  });
});
