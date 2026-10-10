import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNativeClient, nativeIntegrationConfig, nativeSql, nativeInvitationRequest, type NativePersistenceClient } from "../../../../../../test/native-persistence.mjs";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// RUN_WEEKLY_ACTIVITY_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run weekly-activities.integration.test.ts
const suite = describe.skipIf(process.env.RUN_WEEKLY_ACTIVITY_INTEGRATION !== "1");
const run = randomUUID();
const args = ["exec", "-i", process.env.NATIVE_TEST_CONTAINER!, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
const sql = nativeSql;
let owner: NativePersistenceClient;
let outsider: NativePersistenceClient;
let admin: NativePersistenceClient;
const authIds: string[] = [];
const agendaGroupIds: string[] = [];
let groupId: string;
let membershipId: string;
let startsAt: string;
let endsAt: string;
let until: string;
const activityType = "b2c3d4e5-0001-4b3c-8d4e-111111111111";

async function series() {
  const result = await owner.operation("create_activity", { p_group_id: groupId, p_activity_type_id: activityType, p_title: "Serie integración",
    p_starts_at: startsAt, p_ends_at: endsAt, p_recurrence_rule: { freq: "WEEKLY", by_weekday: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"], until } });
  expect(result.error).toBeNull();
  return result.data as string;
}

suite("recurrencia: HTTP y concurrencia en PostgreSQL/Nest local", () => {
  beforeAll(async () => {
    const config = await nativeIntegrationConfig();
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_ORIGIN).hostname)) throw new Error("Solo se admite PostgreSQL/Nest local");
      admin = createNativeClient(config.API_ORIGIN, config.OPERATOR_TOKEN);
    const clients: NativePersistenceClient[] = [];
    for (const name of ["owner", "outsider"]) {
      const email = `weekly-${run}-${name}@example.test`;
      const password = `Synthetic-${randomUUID()}!`;
      const result = await admin.fixtureAccount({ email, password,  profile: { account_terms: { accepted: true, version: "2026-09-21" }, full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (result.error || !result.data.user) throw new Error("No se pudo preparar la cuenta sintética");
      authIds.push(result.data.user.id);
      const client = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
      if ((await client.auth.signInWithPassword({ email, password })).error) throw new Error("No se pudo iniciar sesión sintética");
      clients.push(client);
    }
    [owner, outsider] = clients as [NativePersistenceClient, NativePersistenceClient];
    const created = await owner.operation("create_group", { p_name: "Club recurrencia integración", p_sport: "Tenis" });
    expect(created.error).toBeNull(); groupId = created.data;
    // Estos contratos anteriores a billing ejercitan clubes legacy (límite 500).
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');`);
    const joined = await owner.operation("join_group_as_athlete", { p_group_id: groupId });
    expect(joined.error).toBeNull(); membershipId = joined.data;
    startsAt = sql("select ((app_private.chile_today()+14 + time '18:30') at time zone 'America/Santiago')::text;");
    endsAt = sql("select ((app_private.chile_today()+14 + time '20:00') at time zone 'America/Santiago')::text;");
    until = sql("select (app_private.chile_today()+16)::text;");
  }, 30_000);

  // The runner disposes its entire uniquely owned synthetic database; no
  // delete/trigger-bypass cleanup is exposed to product credentials.

  it("crea tres ocurrencias por JWT, oculta serie a ajeno y conserva hermanas al editar/eliminar raíz", async () => {
    const root = await series();
    const getRows = () => owner.sqlTable("v_group_activities").select("id, title, recurrence_source_id, recurrence_rule").or(`id.eq.${root},recurrence_source_id.eq.${root}`).order("starts_at");
    expect((await getRows()).data).toHaveLength(3);
    expect((await outsider.sqlTable("v_group_activities").select("id").eq("group_id", groupId)).data).toEqual([]);
    expect((await outsider.operation("delete_activity", { p_group_id: groupId, p_activity_id: root })).status).toBe(404);
    const edit = await owner.operation("update_activity", { p_group_id: groupId, p_activity_id: root, p_activity_type_id: activityType, p_title: "Solo raíz", p_starts_at: startsAt, p_ends_at: endsAt, p_scope: "single" });
    expect(edit.error).toBeNull(); expect(edit.data).toBe(1);
    expect((await getRows()).data?.map(row => row.title)).toEqual(["Solo raíz", "Serie integración", "Serie integración"]);
    const deleted = await owner.operation("delete_activity", { p_group_id: groupId, p_activity_id: root });
    expect(deleted.error).toBeNull(); expect(deleted.data).toBe(1);
    const remaining = await owner.sqlTable("v_group_activities").select("id, recurrence_source_id").eq("group_id", groupId).order("starts_at");
    expect(remaining.data).toHaveLength(2);
    expect(remaining.data?.[0]?.recurrence_source_id).toBeNull();
    expect(remaining.data?.[1]?.recurrence_source_id).toBe(remaining.data?.[0]?.id);
  });

  it("edición de serie espera una toma de asistencia concurrente y luego excluye esa ocurrencia", async () => {
    const root = await series();
    const holder = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let stderr = "";
    holder.stdout.on("data", chunk => { output += chunk.toString(); });
    holder.stderr.on("data", chunk => { stderr += chunk.toString(); });
    const closed = new Promise<number | null>(resolve => holder.on("close", resolve));
    holder.stdin.write(`begin; set local role asisteam_api;
      select set_config('request.jwt.claims','{"sub":"${authIds[0]}","auth_provider":"nest"}',true);
      select public.record_attendance_bulk('${root}','[{"membership_id":"${membershipId}","status":"PRESENT"}]');
      select 'attendance_locked';\n`);
    let edit: PromiseLike<{ data: unknown; error: unknown }> | undefined;
    try {
      await expect.poll(() => output, { timeout: 5000 }).toContain("attendance_locked");
      edit = owner.operation("update_activity", { p_group_id: groupId, p_activity_id: root, p_activity_type_id: activityType, p_title: "Serie editada concurrente", p_starts_at: startsAt, p_ends_at: endsAt, p_scope: "series" }).then(result => result);
      await expect.poll(() => sql("select count(*) from pg_stat_activity where wait_event_type='Lock' and query like '%update_activity%' and pid<>pg_backend_pid();"), { timeout: 5000 }).not.toBe("0");
      holder.stdin.end("commit;\n");
      expect(await closed, stderr).toBe(0);
      const result = await edit;
      expect(result.error).toBeNull(); expect(result.data).toBe(2);
      const rows = await owner.sqlTable("v_group_activities").select("id, title").or(`id.eq.${root},recurrence_source_id.eq.${root}`).order("starts_at");
      expect(rows.data?.map(row => row.title)).toEqual(["Serie integración", "Serie editada concurrente", "Serie editada concurrente"]);
      expect(sql(`select count(*) from public.attendance_records where activity_id='${root}';`)).toBe("1");
    } finally {
      if (holder.exitCode === null) { holder.stdin.end("rollback;\n"); await closed; }
      if (edit) await edit;
    }
  }, 20_000);

  it("agenda ATHLETE consolida grupos activos una sola vez y RLS excluye membresías no activas", async () => {
    const activityIds: string[] = [];
    for (const name of ["Agenda A", "Agenda B", "Agenda ajena"]) {
      const created = await owner.operation("create_group", { p_name: `${name} ${run}`, p_sport: "Tenis" });
      expect(created.error).toBeNull();
      const id = created.data as string;
      agendaGroupIds.push(id);
      sql(`insert into app_private.billing_legacy_groups(group_id) values('${id}');`);
      const result = await owner.operation("create_activity", { p_group_id: id, p_activity_type_id: activityType, p_title: name,
        p_starts_at: startsAt, p_ends_at: endsAt, p_location: "Cancha sintética" });
      expect(result.error).toBeNull();
      activityIds.push(result.data as string);
    }
    for (const id of agendaGroupIds.slice(0, 2)) sql(`insert into public.memberships (user_id, group_id, role, status)
      select id, '${id}', 'ATHLETE', 'ACTIVE' from public.users where auth_user_id='${authIds[1]}';`);
    const getAgenda = () => outsider.sqlTable("v_group_activities")
      .select("id, group_id, title, location, starts_at, ends_at, activity_type_name, activity_type_color")
      .in("group_id", agendaGroupIds).gte("starts_at", new Date().toISOString()).order("starts_at").order("id").range(0, 50);
    const result = await getAgenda();
    expect(result.error).toBeNull();
    expect(result.data?.map((row) => row.id).sort()).toEqual(activityIds.slice(0, 2).sort());
    expect(result.data?.every((row) => row.location === "Cancha sintética" && row.activity_type_name === "TRAINING" && row.activity_type_color)).toBe(true);
    sql(`insert into public.memberships (user_id, group_id, role, status)
      select id, '${agendaGroupIds[0]}', 'ADMIN', 'ACTIVE' from public.users where auth_user_id='${authIds[1]}';`);
    expect((await getAgenda()).data).toHaveLength(2);
    for (const status of ["INACTIVE", "PENDING", "INVITED"]) {
      sql(`update public.memberships set status='${status}' where group_id='${agendaGroupIds[1]}'
        and user_id=(select id from public.users where auth_user_id='${authIds[1]}');`);
      const revoked = await getAgenda();
      expect(revoked.error).toBeNull();
      expect(revoked.data?.map((row) => row.id)).toEqual([activityIds[0]]);
    }
  });
});
