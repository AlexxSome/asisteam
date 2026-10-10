import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNativeClient, nativeIntegrationConfig, nativeSql, nativeInvitationRequest, type NativePersistenceClient } from "../../test/native-persistence.mjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const suite = describe.skipIf(process.env.RUN_CHECKIN_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue58-${run}-${name}@example.test`;
const clients: Record<string, NativePersistenceClient> = {};
const authIds: string[] = [];
let service: NativePersistenceClient;
let groupId: string;
let athleteMembership: string;
const sql = nativeSql;
async function activity() {
  const starts = new Date();
  const result = await clients.owner!.operation("create_activity", { p_group_id: groupId,
    p_activity_type_id: "b2c3d4e5-0001-4b3c-8d4e-111111111111", p_title: "Actividad QR de integración",
    p_starts_at: starts.toISOString(), p_ends_at: new Date(starts.getTime() + 3_600_000).toISOString() });
  expect(result.error).toBeNull();
  return result.data as string;
}
async function qr(activityId: string) {
  const result = await clients.owner!.operation("issue_activity_checkin_qr", { p_activity_id: activityId });
  expect(result.error).toBeNull();
  // Evita que una suite iniciada al final de un minuto atraviese el vencimiento
  // mientras prepara las peticiones; las pruebas de expiración no esperan al reloj.
  if (Date.parse(result.data.expires_at) - Date.parse(result.data.server_time) < 2000) {
    await new Promise(resolve => setTimeout(resolve, 2100));
    return qr(activityId);
  }
  return result.data.token as string;
}

suite("autoasistencia QR mediante Auth/SQL/RLS reales", () => {
  beforeAll(async () => {
    const config = await nativeIntegrationConfig();
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_ORIGIN).hostname)) throw new Error("Solo se admite PostgreSQL/Nest local");
      service = createNativeClient(config.API_ORIGIN, config.OPERATOR_TOKEN);
    clients.anon = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
    for (const name of ["owner", "athlete", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const created = await service.fixtureAccount({ email: email(name), password,
        profile: { account_terms: { accepted: true, version: "2026-09-21" }, full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (created.error) throw new Error("No se pudo crear usuario sintético");
      authIds.push(created.data.user.id);
      const client = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      clients[name] = client;
    }
    const group = await clients.owner!.operation("create_group", { p_name: "Club QR integración", p_sport: "Tenis" });
    expect(group.error).toBeNull(); groupId = group.data;
    athleteMembership = randomUUID();
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');
      insert into public.memberships(id,user_id,group_id,role,status,joined_at)
      select '${athleteMembership}',id,'${groupId}','ATHLETE','ACTIVE',now()-interval '1 day'
      from public.users where email='${email("athlete")}';`);
  }, 30_000);
  // The runner disposes its entire uniquely owned synthetic database; no
  // delete/trigger-bypass cleanup is exposed to product credentials.
  it("concurrencia de escaneos crea una sola fila, actor JWT y respuesta sin PII", async () => {
    const id = await activity(); const token = await qr(id);
    const results = await Promise.all(Array.from({ length: 8 }, () => clients.athlete!.operation("self_checkin", { p_activity_id: id, p_token: token })));
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
      clients.athlete!.operation("self_checkin", { p_activity_id: id, p_token: token }),
      clients.owner!.operation("record_attendance_bulk", { p_activity_id: id, p_records: [{ membership_id: athleteMembership, status: "EXCUSED", note: "Conservar evidencia sintética" }] }),
    ]);
    expect(results.map(result => result.error)).toEqual([null, null]);
    expect(sql(`select status||':'||note from public.attendance_records where activity_id='${id}'`)).toBe("EXCUSED:Conservar evidencia sintética");
    const before = sql(`select row_to_json(r) from public.attendance_records r where activity_id='${id}'`);
    expect((await clients.athlete!.operation("self_checkin", { p_activity_id: id, p_token: token })).data.created).toBe(false);
    expect(sql(`select row_to_json(r) from public.attendance_records r where activity_id='${id}'`)).toBe(before);
  });
  it("aplica permisos HTTP, no acepta identidad ajena y mantiene protegidas las tablas", async () => {
    const id = await activity(); const token = await qr(id);
    const args = { p_activity_id: id, p_token: token };
    expect((await clients.outsider!.operation("self_checkin", args)).status).toBe(404);
    expect((await clients.owner!.operation("self_checkin", args)).status).toBe(404);
    expect((await clients.anon!.operation("self_checkin", args)).status).toBe(401);
    expect((await clients.athlete!.operation("issue_activity_checkin_qr", { p_activity_id: id })).status).toBe(403);
    expect((await clients.athlete!.operation("self_checkin", { ...args, p_membership_id: athleteMembership })).status).toBe(400);
    expect((await clients.athlete!.sqlTable("attendance_records").insert({ activity_id: id, membership_id: athleteMembership, status: "PRESENT" })).status).toBe(403);
    expect(sql(`select count(*) from public.attendance_records where activity_id='${id}'`)).toBe("0");
  });
  it("rechaza tokens vencidos/futuros y un cambio de horario aunque el token siga vigente", async () => {
    const id = await activity(); const token = await qr(id);
    for (const offset of ["-60 seconds", "60 seconds"]) {
      const stale = sql(`select app_private.qr_checkin_token(activity_id,secret,clock_timestamp()+interval '${offset}') from app_private.qr_checkin_keys where activity_id='${id}'`);
      const result = await clients.athlete!.operation("self_checkin", { p_activity_id: id, p_token: stale });
      expect(result.status).toBe(422); expect(result.error?.message).toBe("checkin_qr_expired");
    }
    sql(`update public.activities set starts_at=now()-interval '61 minutes',ends_at=now()+interval '1 hour' where id='${id}'`);
    const result = await clients.athlete!.operation("self_checkin", { p_activity_id: id, p_token: token });
    expect(result.status).toBe(422); expect(result.error?.message).toBe("checkin_window_closed");
  });
  it("la configuración guardada cambia el cálculo de atraso del grupo", async () => {
    const id = await activity();
    const saved = await clients.owner!.operation("set_qr_checkin_settings", { p_group_id: groupId,
      p_settings: { opens_before_minutes: 0, closes_after_minutes: 30, late_after_minutes: 0 } });
    expect(saved.error).toBeNull();
    const result = await clients.athlete!.operation("self_checkin", { p_activity_id: id, p_token: await qr(id) });
    expect(result.error).toBeNull(); expect(result.data.status).toBe("LATE");
  });
});
