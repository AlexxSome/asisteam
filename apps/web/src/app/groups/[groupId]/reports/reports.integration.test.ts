import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { groupAttendanceReportSchema } from "@asisteam/core";

const suite = describe.skipIf(process.env.RUN_REPORT_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue32-${run}-${name}@example.test`;
const clients: Record<string, SupabaseClient> = {};
const authIds: string[] = [];
let service: SupabaseClient;
let groupId: string;
let membershipId: string;
function sql(query: string) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
suite("reportes con Auth y PostgREST real", () => {
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
    const group = await clients.owner!.rpc("create_group", { p_name: "Reportes integración", p_sport: "Tenis" });
    expect(group.error).toBeNull(); groupId = group.data;
    membershipId = sql(`insert into public.memberships(user_id,group_id,role,status,joined_at) select id,'${groupId}','ATHLETE','ACTIVE','2026-01-01' from public.users where email='${email("athlete")}' returning id;`).split("\n")[0]!;
    sql(`update public.groups set created_at='2026-01-01' where id='${groupId}';
      insert into public.activities(group_id,activity_type_id,title,starts_at,ends_at,created_by)
      select '${groupId}','b2c3d4e5-0003-4b3c-8d4e-333333333333','Actividad sintética '||n,
      timestamptz '2026-03-01T12:00Z'+n*interval '1 day',timestamptz '2026-03-01T13:00Z'+n*interval '1 day',u.id
      from generate_series(1,8) n cross join public.users u where u.email='${email("owner")}';`);
    const activities = await clients.owner!.from("v_group_activities").select("id").eq("group_id", groupId).order("starts_at");
    expect(activities.error).toBeNull();
    for (const [index, activity] of activities.data!.entries()) {
      expect((await clients.owner!.rpc("record_attendance_bulk", { p_activity_id: activity.id, p_records: [{ membership_id: membershipId, status: index < 5 ? "PRESENT" : index === 5 ? "LATE" : index === 6 ? "ABSENT" : "EXCUSED" }] })).error).toBeNull();
    }
  }, 30000);
  afterAll(async () => {
    if (!service) return;
    const users = `select id from public.users where email like 'issue32-${run}-%@example.test'`;
    const groups = `select id from public.groups where created_by in (${users})`;
    sql(`delete from public.attendance_records where activity_id in (select id from public.activities where group_id in (${groups}));
      delete from public.activities where group_id in (${groups}); delete from public.memberships where group_id in (${groups});
      delete from public.groups where id in (${groups}); delete from public.users where id in (${users});`);
    for (const id of authIds) await service.auth.admin.deleteUser(id);
  });
  it("RPC serializa conteos y porcentajes como números y refleja correcciones", async () => {
    const args = { p_group_id: groupId, p_period: "month", p_from: "2026-03-01", p_activity_type_ids: ["b2c3d4e5-0003-4b3c-8d4e-333333333333"] };
    const response = await clients.owner!.rpc("get_group_attendance_report", args);
    expect(response.error).toBeNull();
    const report = groupAttendanceReportSchema.parse(response.data);
    expect(report.by_athlete[0]).toMatchObject({ membership_id: membershipId, convened: 8, present: 5, late: 1, absent: 1, excused: 1, attendance_pct: 85.7, late_rate: 16.7 });
    for (const privateField of ["email", "phone", "birthdate", "note"]) expect(response.data.by_athlete[0]).not.toHaveProperty(privateField);
    const record = await clients.owner!.from("v_attendance_admin").select("id").eq("membership_id", membershipId).eq("status", "ABSENT").single();
    expect(record.error).toBeNull();
    expect((await clients.owner!.rpc("update_attendance_record", { p_record_id: record.data!.id, p_changes: { status: "EXCUSED" } })).error).toBeNull();
    expect((await clients.owner!.rpc("get_group_attendance_report", args)).data.by_athlete[0].attendance_pct).toBe(100);
  });
  it("HTTP aplica 403/404 y vista no expone datos a no-ADMIN", async () => {
    expect((await clients.athlete!.rpc("get_group_attendance_report", { p_group_id: groupId })).status).toBe(403);
    expect((await clients.outsider!.rpc("get_group_attendance_report", { p_group_id: groupId })).status).toBe(404);
    expect((await clients.athlete!.from("v_group_attendance_report").select("group_id").eq("group_id", groupId)).data).toEqual([]);
    expect((await clients.owner!.rpc("get_group_attendance_report", { p_group_id: groupId, p_period: "custom" })).status).toBe(400);
  });
});
