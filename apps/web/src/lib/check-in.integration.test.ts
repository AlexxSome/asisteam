import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const suite = describe.skipIf(process.env.RUN_CHECKIN_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue58-${run}-${name}@example.test`;
const clients: Record<string, SupabaseClient> = {};
const authIds: string[] = [];
let service: SupabaseClient;
let groupId: string;
let athleteMembership: string;
const sql = (query: string) => execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
  input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
}).trim();
async function activity() {
  const starts = new Date();
  const result = await clients.owner!.rpc("create_activity", { p_group_id: groupId,
    p_activity_type_id: "b2c3d4e5-0001-4b3c-8d4e-111111111111", p_title: "Actividad QR de integración",
    p_starts_at: starts.toISOString(), p_ends_at: new Date(starts.getTime() + 3_600_000).toISOString() });
  expect(result.error).toBeNull();
  return result.data as string;
}
async function qr(activityId: string) {
  const result = await clients.owner!.rpc("issue_activity_checkin_qr", { p_activity_id: activityId });
  expect(result.error).toBeNull();
  // Evita que una suite iniciada al final de un minuto atraviese el vencimiento
  // mientras prepara las peticiones; las pruebas de expiración no esperan al reloj.
  if (Date.parse(result.data.expires_at) - Date.parse(result.data.server_time) < 2000) {
    await new Promise(resolve => setTimeout(resolve, 2100));
    return qr(activityId);
  }
  return result.data.token as string;
}

suite("autoasistencia QR mediante Auth/PostgREST reales", () => {
  beforeAll(async () => {
    const config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Solo se admite Supabase local");
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
    clients.anon = createClient(config.API_URL, config.ANON_KEY, options);
    for (const name of ["owner", "athlete", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const created = await service.auth.admin.createUser({ email: email(name), password, email_confirm: true,
        user_metadata: { full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (created.error) throw new Error("No se pudo crear usuario sintético");
      authIds.push(created.data.user.id);
      const client = createClient(config.API_URL, config.ANON_KEY, options);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      clients[name] = client;
    }
    const group = await clients.owner!.rpc("create_group", { p_name: "Club QR integración", p_sport: "Tenis" });
    expect(group.error).toBeNull(); groupId = group.data;
    athleteMembership = randomUUID();
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');
      insert into public.memberships(id,user_id,group_id,role,status,joined_at)
      select '${athleteMembership}',id,'${groupId}','ATHLETE','ACTIVE',now()-interval '1 day'
      from public.users where email='${email("athlete")}';`);
  }, 30_000);
  afterAll(async () => {
    if (!service) return;
    const users = `select id from public.users where email like 'issue58-${run}-%@example.test'`;
    const groups = `select id from public.groups where created_by in (${users})`;
    sql(`delete from public.attendance_records where activity_id in (select id from public.activities where group_id in (${groups}));
      delete from public.activities where group_id in (${groups});
      delete from public.memberships where group_id in (${groups});
      delete from app_private.billing_legacy_groups where group_id in (${groups});
      delete from public.groups where id in (${groups});
      delete from public.users where id in (${users});`);
    for (const id of authIds) await service.auth.admin.deleteUser(id);
  });
  it("concurrencia de escaneos crea una sola fila, actor JWT y respuesta sin PII", async () => {
    const id = await activity(); const token = await qr(id);
    const results = await Promise.all(Array.from({ length: 8 }, () => clients.athlete!.rpc("self_checkin", { p_activity_id: id, p_token: token })));
    expect(results.every(result => result.error === null)).toBe(true);
    expect(results.filter(result => result.data.created)).toHaveLength(1);
    for (const result of results) {
      expect(result.data.status).toBe("PRESENT");
      expect(Object.keys(result.data).sort()).toEqual(["activity_id", "group_id", "activity_title", "status", "recorded_at", "created"].sort());
    }
    expect(sql(`select count(*) from public.attendance_records where activity_id='${id}'`)).toBe("1");
    expect(sql(`select recorded_by=(select id from public.users where email='${email("athlete")}') from public.attendance_records where activity_id='${id}'`)).toBe("t");
  });
  it("una toma manual concurrente conserva el resultado del ADMIN", async () => {
    const id = await activity(); const token = await qr(id);
    const results = await Promise.all([
      clients.athlete!.rpc("self_checkin", { p_activity_id: id, p_token: token }),
      clients.owner!.rpc("record_attendance_bulk", { p_activity_id: id, p_records: [{ membership_id: athleteMembership, status: "EXCUSED", note: "Conservar evidencia sintética" }] }),
    ]);
    expect(results.map(result => result.error)).toEqual([null, null]);
    expect(sql(`select status||':'||note from public.attendance_records where activity_id='${id}'`)).toBe("EXCUSED:Conservar evidencia sintética");
    const before = sql(`select row_to_json(r) from public.attendance_records r where activity_id='${id}'`);
    expect((await clients.athlete!.rpc("self_checkin", { p_activity_id: id, p_token: token })).data.created).toBe(false);
    expect(sql(`select row_to_json(r) from public.attendance_records r where activity_id='${id}'`)).toBe(before);
  });
  it("aplica permisos HTTP, no acepta identidad ajena y mantiene protegidas las tablas", async () => {
    const id = await activity(); const token = await qr(id);
    const args = { p_activity_id: id, p_token: token };
    expect((await clients.outsider!.rpc("self_checkin", args)).status).toBe(404);
    expect((await clients.owner!.rpc("self_checkin", args)).status).toBe(404);
    expect((await clients.anon!.rpc("self_checkin", args)).status).toBe(401);
    expect((await clients.athlete!.rpc("issue_activity_checkin_qr", { p_activity_id: id })).status).toBe(403);
    expect((await clients.athlete!.rpc("self_checkin", { ...args, p_membership_id: athleteMembership })).status).toBe(404);
    expect((await clients.athlete!.from("attendance_records").insert({ activity_id: id, membership_id: athleteMembership, status: "PRESENT" })).status).toBe(403);
    expect(sql(`select count(*) from public.attendance_records where activity_id='${id}'`)).toBe("0");
  });
  it("rechaza tokens vencidos/futuros y un cambio de horario aunque el token siga vigente", async () => {
    const id = await activity(); const token = await qr(id);
    for (const offset of ["-60 seconds", "60 seconds"]) {
      const stale = sql(`select app_private.qr_checkin_token(activity_id,secret,clock_timestamp()+interval '${offset}') from app_private.qr_checkin_keys where activity_id='${id}'`);
      const result = await clients.athlete!.rpc("self_checkin", { p_activity_id: id, p_token: stale });
      expect(result.status).toBe(422); expect(result.error?.message).toBe("checkin_qr_expired");
    }
    sql(`update public.activities set starts_at=now()-interval '61 minutes',ends_at=now()+interval '1 hour' where id='${id}'`);
    const result = await clients.athlete!.rpc("self_checkin", { p_activity_id: id, p_token: token });
    expect(result.status).toBe(422); expect(result.error?.message).toBe("checkin_window_closed");
  });
  it("la configuración guardada cambia el cálculo de atraso del grupo", async () => {
    const id = await activity();
    const saved = await clients.owner!.rpc("set_qr_checkin_settings", { p_group_id: groupId,
      p_settings: { opens_before_minutes: 0, closes_after_minutes: 30, late_after_minutes: 0 } });
    expect(saved.error).toBeNull();
    const result = await clients.athlete!.rpc("self_checkin", { p_activity_id: id, p_token: await qr(id) });
    expect(result.error).toBeNull(); expect(result.data.status).toBe("LATE");
  });
});
