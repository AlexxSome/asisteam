import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { attendanceHistorySchema } from "@asisteam/core";

const suite = describe.skipIf(process.env.RUN_HISTORY_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue39-${run}-${name}@example.test`;
const clients: Record<string, SupabaseClient> = {};
const authIds: string[] = [];
let service: SupabaseClient;
let groupId: string;
let membershipId: string;
let secondGroupId: string;
let secondMembershipId: string;
function sql(query: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
suite("historial propio con Auth y PostgREST reales", () => {
  beforeAll(async () => {
    const config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Solo se admite Supabase local");
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
    for (const name of ["owner", "athlete", "other", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const created = await service.auth.admin.createUser({ email: email(name), password, email_confirm: true, user_metadata: { full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (created.error) throw new Error("No se pudo preparar cuenta sintética");
      authIds.push(created.data.user.id);
      const client = createClient(config.API_URL, config.ANON_KEY, options);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      clients[name] = client;
    }
    const group = await clients.owner!.rpc("create_group", { p_name: "Historial integración", p_sport: "Tenis" });
    expect(group.error).toBeNull(); groupId = group.data;
    membershipId = sql(`insert into public.memberships(user_id,group_id,role,status,joined_at) select id,'${groupId}','ATHLETE','ACTIVE','2026-01-01' from public.users where email='${email("athlete")}' returning id;`).split("\n")[0]!;
    sql(`update public.groups set created_at='2026-01-01' where id='${groupId}';
      insert into public.memberships(user_id,group_id,role,status,joined_at) select id,'${groupId}','ATHLETE','ACTIVE','2026-01-01' from public.users where email='${email("other")}';
      insert into public.activities(group_id,activity_type_id,title,starts_at,ends_at,created_by)
      select '${groupId}','b2c3d4e5-0001-4b3c-8d4e-111111111111','Historial '||n,
      timestamptz '2026-03-01T12:00Z'+n*interval '1 day',timestamptz '2026-03-01T13:00Z'+n*interval '1 day',u.id
      from generate_series(1,4)n cross join public.users u where u.email='${email("owner")}';
      insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by)
      select a.id,m.id,case when a.title='Historial 1' then 'LATE' when a.title='Historial 2' then 'ABSENT' when a.title='Historial 3' then 'EXCUSED' else 'PRESENT' end,
      case when m.id='${membershipId}' then 'Nota propia' else 'Nota privada de tercero' end,g.created_by
      from public.activities a join public.groups g on g.id=a.group_id join public.memberships m on m.group_id=g.id and m.role='ATHLETE'
      where a.group_id='${groupId}';`);
    const secondGroup = await clients.other!.rpc("create_group", { p_name: "Segundo grupo de historial", p_sport: "Natación" });
    expect(secondGroup.error).toBeNull(); secondGroupId = secondGroup.data;
    secondMembershipId = sql(`insert into public.memberships(user_id,group_id,role,status,joined_at)
      select id,'${secondGroupId}','ATHLETE','ACTIVE','2026-03-01' from public.users where email='${email("athlete")}' returning id;`).split("\n")[0]!;
    sql(`update public.groups set created_at='2026-01-01' where id='${secondGroupId}';
      insert into public.memberships(user_id,group_id,role,status,joined_at)
      select id,'${secondGroupId}','ATHLETE','ACTIVE','2026-03-01' from public.users where email='${email("owner")}';
      insert into public.activities(group_id,activity_type_id,title,starts_at,ends_at,created_by)
      select '${secondGroupId}','b2c3d4e5-0001-4b3c-8d4e-111111111111','Segundo grupo '||n,
      timestamptz '2026-03-01T12:00Z'+n*interval '1 day',timestamptz '2026-03-01T13:00Z'+n*interval '1 day',u.id
      from generate_series(1,2)n cross join public.users u where u.email='${email("other")}';
      insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by)
      select a.id,m.id,case when m.id='${secondMembershipId}' and a.title='Segundo grupo 2' then 'ABSENT' else 'PRESENT' end,
      case when m.id='${secondMembershipId}' then 'Nota propia segundo grupo' else 'Nota privada segundo grupo' end,g.created_by
      from public.activities a join public.groups g on g.id=a.group_id join public.memberships m on m.group_id=g.id and m.role='ATHLETE'
      where a.group_id='${secondGroupId}';`);
  }, 30000);
  afterAll(async () => {
    if (!service) return;
    const users = `select id from public.users where email like 'issue39-${run}-%@example.test'`;
    const groups = `select id from public.groups where created_by in (${users})`;
    sql(`delete from public.attendance_records where activity_id in (select id from public.activities where group_id in (${groups}));
      delete from public.activities where group_id in (${groups}); delete from public.memberships where group_id in (${groups});
      delete from public.groups where id in (${groups}); delete from public.users where id in (${users});`);
    for (const id of authIds) await service.auth.admin.deleteUser(id);
  });
  it("consulta propia pagina, filtra y serializa notas/métricas sin terceros", async () => {
    const response = await clients.athlete!.rpc("get_my_attendance_history", { p_group_id: groupId, p_period: "month", p_from: "2026-03-01", p_page_size: 2, p_page: 2 });
    expect(response.error).toBeNull();
    const history = attendanceHistorySchema.parse(response.data);
    expect(history.membership_id).toBe(membershipId); expect(history.records).toHaveLength(2);
    expect(history.records.map((record) => record.title)).toEqual(["Historial 2", "Historial 1"]);
    expect(history.totals).toMatchObject({ convened: 4, attendance_pct: 66.7, present: 1, absent: 1, late: 1, excused: 1 });
    expect(history.records.every((record) => record.note === "Nota propia")).toBe(true);
    const filtered = await clients.athlete!.rpc("get_my_attendance_history", { p_group_id: groupId, p_period: "custom", p_from: "2026-03-04", p_to: "2026-03-04" });
    expect(filtered.error).toBeNull();
    expect(attendanceHistorySchema.parse(filtered.data).totals).toMatchObject({ convened: 1, excused: 1, attendance_pct: null });
    const direct = await clients.athlete!.from("v_athlete_attendance_history").select("membership_id, note").eq("group_id", groupId);
    expect(direct.error).toBeNull(); expect(direct.data).toHaveLength(4);
    expect(direct.data!.every((row) => row.membership_id === membershipId && row.note === "Nota propia")).toBe(true);
  });
  it("HU-DEP-06: la misma sesión ATHLETE alterna grupos sin mezclar membresías, notas ni porcentajes", async () => {
    const groups = await clients.athlete!.from("v_my_groups").select("id, roles").order("id");
    expect(groups.error).toBeNull();
    expect(groups.data).toHaveLength(2);
    expect(groups.data).toEqual(expect.arrayContaining([
      { id: groupId, roles: ["ATHLETE"] }, { id: secondGroupId, roles: ["ATHLETE"] },
    ]));
    const expected = [
      { group: groupId, membership: membershipId, convened: 4, pct: 66.7, excused: 1, note: "Nota propia" },
      { group: secondGroupId, membership: secondMembershipId, convened: 2, pct: 50, excused: 0, note: "Nota propia segundo grupo" },
    ];
    expect(membershipId).not.toBe(secondMembershipId);
    for (const context of [expected[0]!, expected[1]!, expected[0]!]) {
      const response = await clients.athlete!.rpc("get_my_attendance_history", { p_group_id: context.group, p_period: "season" });
      expect(response.error).toBeNull();
      const history = attendanceHistorySchema.parse(response.data);
      expect(history.group_id).toBe(context.group);
      expect(history.membership_id).toBe(context.membership);
      expect(history.totals).toMatchObject({ convened: context.convened, attendance_pct: context.pct, excused: context.excused });
      expect(history.records).toHaveLength(context.convened);
      expect(history.records.every((record) => record.note === context.note)).toBe(true);
      const rows = await clients.athlete!.from("v_athlete_attendance_history").select("membership_id, note").eq("group_id", context.group);
      expect(rows.error).toBeNull(); expect(rows.data).toHaveLength(context.convened);
      expect(rows.data!.every((row) => row.membership_id === context.membership && row.note === context.note)).toBe(true);
    }
  });
  it("HU-DEP-06: ADMIN en A y ATHLETE en B conserva permisos independientes por HTTP", async () => {
    const actor = clients.owner!;
    for (const id of [groupId, secondGroupId, groupId]) {
      const detail = await actor.from("v_group_detail").select("id, roles, invite_code").eq("id", id).single();
      expect(detail.error).toBeNull();
      expect(detail.data?.roles).toEqual(id === groupId ? ["ADMIN"] : ["ATHLETE"]);
      if (id === groupId) expect(detail.data?.invite_code).toMatch(/^[A-Za-z0-9]{8}$/);
      else expect(detail.data?.invite_code).toBeNull();
    }
    expect((await actor.rpc("rotate_invite_code", { p_group_id: groupId })).error).toBeNull();
    expect((await actor.rpc("rotate_invite_code", { p_group_id: secondGroupId })).status).toBe(403);
    expect((await actor.from("groups").update({ name: "Cambio sin permiso" }).eq("id", secondGroupId).select("id")).status).toBe(403);
    const history = await actor.rpc("get_my_attendance_history", { p_group_id: secondGroupId, p_period: "season" });
    expect(history.error).toBeNull();
    const own = attendanceHistorySchema.parse(history.data);
    expect(own.membership_id).not.toBe(secondMembershipId);
    expect(own.totals).toMatchObject({ convened: 2, attendance_pct: 100 });
    expect(own.records.every((record) => record.note === "Nota privada segundo grupo")).toBe(true);
    expect((await actor.rpc("get_my_attendance_history", { p_group_id: groupId, p_period: "season" })).status).toBe(404);
  });
  it("HTTP aplica aislamiento y valida filtros; correcciones se reflejan en la misma sesión", async () => {
    const args = { p_group_id: groupId, p_period: "month", p_from: "2026-03-01" };
    expect((await clients.outsider!.rpc("get_my_attendance_history", args)).status).toBe(404);
    expect((await clients.owner!.rpc("get_my_attendance_history", args)).status).toBe(404);
    expect((await clients.athlete!.rpc("get_my_attendance_history", { ...args, p_period: "custom" })).status).toBe(400);
    const row = await clients.owner!.from("v_attendance_admin").select("id").eq("membership_id", membershipId).eq("status", "ABSENT").single();
    expect(row.error).toBeNull();
    expect((await clients.owner!.rpc("update_attendance_record", { p_record_id: row.data!.id, p_changes: { status: "PRESENT", note: "Corregida" } })).error).toBeNull();
    const result = await clients.athlete!.rpc("get_my_attendance_history", args);
    expect(result.error).toBeNull(); const history = attendanceHistorySchema.parse(result.data);
    expect(history.totals.attendance_pct).toBe(100);
    expect(history.records.find((record) => record.id === row.data!.id)?.note).toBe("Corregida");
    sql(`update public.memberships set status='INACTIVE' where id='${membershipId}';`);
    expect((await clients.athlete!.rpc("get_my_attendance_history", args)).status).toBe(404);
    expect((await clients.athlete!.from("v_athlete_attendance_history").select("note").eq("group_id", groupId)).data).toEqual([]);
    const stillActive = await clients.athlete!.rpc("get_my_attendance_history", { ...args, p_group_id: secondGroupId });
    expect(stillActive.error).toBeNull();
    expect(attendanceHistorySchema.parse(stillActive.data)).toMatchObject({ group_id: secondGroupId, membership_id: secondMembershipId, totals: { convened: 2, attendance_pct: 50 } });
    expect((await clients.athlete!.from("v_my_groups").select("id, roles")).data).toEqual([{ id: secondGroupId, roles: ["ATHLETE"] }]);
  });
});
