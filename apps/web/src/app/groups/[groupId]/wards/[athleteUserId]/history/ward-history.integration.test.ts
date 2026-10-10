import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNativeClient, nativeIntegrationConfig, nativeSql, nativeInvitationRequest, type NativePersistenceClient } from "../../../../../../../test/native-persistence.mjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { attendanceHistorySchema, groupStatsSchema } from "@asisteam/core";

const suite = describe.skipIf(process.env.RUN_WARD_HISTORY_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue47-${run}-${name}@example.test`;
const clients: Record<string, NativePersistenceClient> = {};
const authIds: string[] = [];
const athleteUserId = randomUUID();
const otherAthleteId = randomUUID();
const membershipId = randomUUID();
const guardianshipId = randomUUID();
let service: NativePersistenceClient;
let groupId: string;
const sql = nativeSql;
suite("historial del pupilo con Auth y SQL/RLS reales", () => {
  beforeAll(async () => {
    const config = await nativeIntegrationConfig();
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_ORIGIN).hostname)) throw new Error("Solo se admite PostgreSQL/Nest local");
      service = createNativeClient(config.API_ORIGIN, config.OPERATOR_TOKEN);
    for (const name of ["owner", "guardian", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const created = await service.fixtureAccount({ email: email(name), password,  profile: { account_terms: { accepted: true, version: "2026-09-21" }, full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (created.error) throw new Error("No se pudo preparar cuenta sintética");
      authIds.push(created.data.user.id);
      const client = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      clients[name] = client;
    }
    const group = await clients.owner!.operation("create_group", { p_name: "Historial pupilo integración", p_sport: "Tenis" });
    expect(group.error).toBeNull(); groupId = group.data;
    // Estos contratos anteriores a billing ejercitan clubes legacy (límite 500).
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');`);
    sql(`update public.groups set created_at='2026-01-01' where id='${groupId}';
      insert into public.users(id,full_name,birthdate,account_status) values
        ('${athleteUserId}','Pupilo sintético',(app_private.chile_today()-interval '14 years')::date,'MANAGED'),
        ('${otherAthleteId}','Tercero sintético','1990-01-01','MANAGED');
      insert into public.memberships(id,user_id,group_id,role,status,joined_at) values
        ('${membershipId}','${athleteUserId}','${groupId}','ATHLETE','PENDING','2026-01-01');
      insert into public.memberships(user_id,group_id,role,status,joined_at) values
        ('${otherAthleteId}','${groupId}','ATHLETE','ACTIVE','2026-01-01');
      insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship)
        select '${guardianshipId}',id,'${athleteUserId}','Tutor' from public.users where email='${email("guardian")}';
      insert into public.guardianships(guardian_user_id,athlete_user_id,relationship)
        select id,'${athleteUserId}','Tutor' from public.users where email='${email("owner")}';
      insert into public.consents(guardianship_id,consent_type,terms_version)
        select id,'DATA_PROCESSING_MINOR','test' from public.guardianships where athlete_user_id='${athleteUserId}';
      update public.memberships set status='ACTIVE',joined_at='2026-01-01' where id='${membershipId}';
      insert into public.activities(group_id,activity_type_id,title,starts_at,ends_at,created_by)
        select '${groupId}','b2c3d4e5-0001-4b3c-8d4e-111111111111','Pupilo '||n,
        timestamptz '2026-03-01T12:00Z'+n*interval '1 day',timestamptz '2026-03-01T13:00Z'+n*interval '1 day',created_by
        from public.groups cross join generate_series(1,4)n where id='${groupId}';
      insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by)
        select a.id,m.id,case when a.title='Pupilo 1' then 'LATE' when a.title='Pupilo 2' then 'ABSENT' when a.title='Pupilo 3' then 'EXCUSED' else 'PRESENT' end,
        case when m.id='${membershipId}' then 'Nota del pupilo' else 'Nota privada de tercero' end,g.created_by
        from public.activities a join public.groups g on g.id=a.group_id
        join public.memberships m on m.group_id=g.id and m.role='ATHLETE' where g.id='${groupId}';`);
  }, 30000);
  // The runner disposes its entire uniquely owned synthetic database; no
  // delete/trigger-bypass cleanup is exposed to product credentials.
  it("JWT del apoderado devuelve solo pupilo, métricas completas y página solicitada", async () => {
    const response = await clients.guardian!.operation("get_ward_attendance_history", { p_group_id: groupId, p_athlete_user_id: athleteUserId, p_period: "month", p_from: "2026-03-01", p_page: 2, p_page_size: 2 });
    expect(response.error).toBeNull();
    const history = attendanceHistorySchema.parse(response.data);
    expect(history.membership_id).toBe(membershipId);
    expect(history.records.map((record) => record.title)).toEqual(["Pupilo 2", "Pupilo 1"]);
    expect(history.records.every((record) => record.note === "Nota del pupilo")).toBe(true);
    expect(history.totals).toMatchObject({ convened: 4, present: 1, late: 1, absent: 1, excused: 1, attendance_pct: 66.7 });
    const filtered = await clients.guardian!.operation("get_ward_attendance_history", { p_group_id: groupId, p_athlete_user_id: athleteUserId, p_period: "custom", p_from: "2026-03-04", p_to: "2026-03-04" });
    expect(filtered.error).toBeNull();
    expect(attendanceHistorySchema.parse(filtered.data).totals).toMatchObject({ convened: 1, excused: 1, attendance_pct: null });
  });
  it("rechaza identidades ajenas y mantiene la proyección directa cerrada a terceros", async () => {
    for (const client of [clients.guardian!, clients.outsider!]) {
      const response = await client.operation("get_ward_attendance_history", { p_group_id: groupId, p_athlete_user_id: otherAthleteId });
      expect(response.status).toBe(404);
    }
    const outsider = await clients.outsider!.operation("get_ward_attendance_history", { p_group_id: groupId, p_athlete_user_id: athleteUserId });
    expect(outsider.status).toBe(404);
    const view = await clients.guardian!.sqlTable("v_ward_attendance_history").select("athlete_user_id,note").eq("group_id", groupId);
    expect(view.error).toBeNull(); expect(view.data).toHaveLength(4);
    expect(view.data!.every((row) => row.athlete_user_id === athleteUserId && row.note === "Nota del pupilo")).toBe(true);
    expect((await clients.guardian!.sqlTable("v_ward_attendance_history").select("phone")).error).not.toBeNull();
  });
  it("HU-APO-05 evalúa ambos toggles independientemente y revoca agregados sin ocultar al pupilo", async () => {
    const guardian = clients.guardian!;
    const token = (await guardian.auth.getSession()).data.session!.access_token;
    const ownArgs = { p_group_id: groupId, p_athlete_user_id: athleteUserId, p_period: "season" };
    const own = await guardian.operation("get_ward_attendance_history", ownArgs);
    expect(own.error).toBeNull();
    expect(own.data.totals.attendance_pct).toBe(66.7);
    for (const athletes of [false, true]) {
      for (const guardians of [false, true]) {
        const settings = await clients.owner!.operation("update_group_settings", {
          p_group_id: groupId, p_changes: { athletes_can_view_group_stats: athletes, guardians_can_view_group_stats: guardians },
        });
        expect(settings.error).toBeNull();
        const response = await guardian.operation("get_group_stats", { p_group_id: groupId });
        const direct = await guardian.sqlTable("v_group_stats_members").select("*").eq("group_id", groupId);
        expect(direct.error).toBeNull();
        if (guardians) {
          expect(response.error).toBeNull();
          const report = groupStatsSchema.parse(response.data);
          expect(report.members.map((member) => [member.full_name, member.attendance_pct])).toEqual([["Pupilo sintético", 66.7], ["Tercero sintético", 66.7]]);
          expect(report.totals).toMatchObject({ athletes: 2, convened: 8 });
          const columns = ["membership_id", "full_name", "avatar_url", "convened", "present", "late", "absent", "excused", "attendance_pct", "late_rate"];
          for (const member of response.data.members) expect(Object.keys(member).sort()).toEqual([...columns].sort());
          expect(direct.data).toHaveLength(2);
          for (const member of direct.data!) expect(Object.keys(member).sort()).toEqual([...columns, "group_id"].sort());
          expect(JSON.stringify(response.data)).not.toContain("Nota privada de tercero");
          expect(JSON.stringify(response.data)).not.toContain(email("owner"));
        } else {
          expect(response.status).toBe(403);
          expect(response.data).toBeNull();
          expect(direct.data).toEqual([]);
        }
        const stillOwn = await guardian.operation("get_ward_attendance_history", ownArgs);
        expect(stillOwn.error).toBeNull();
        expect(stillOwn.data).toEqual(own.data);
      }
    }
    expect((await guardian.operation("get_group_attendance_report", { p_group_id: groupId })).status).toBe(403);
    expect((await guardian.operation("get_ward_attendance_history", { ...ownArgs, p_athlete_user_id: otherAthleteId })).status).toBe(404);
    expect((await clients.outsider!.operation("get_group_stats", { p_group_id: groupId })).status).toBe(404);
    expect((await guardian.sqlTable("v_my_ward_groups").select("athlete_user_id").eq("group_id", groupId).eq("membership_status", "ACTIVE")).data).toEqual([{ athlete_user_id: athleteUserId }]);
    expect((await clients.owner!.operation("update_group_settings", { p_group_id: groupId, p_changes: { guardians_can_view_group_stats: false } })).error).toBeNull();
    expect((await guardian.operation("get_group_stats", { p_group_id: groupId })).status).toBe(403);
    expect((await guardian.operation("get_ward_attendance_history", ownArgs)).data).toEqual(own.data);
    expect((await guardian.auth.getSession()).data.session!.access_token).toBe(token);
  });

  it("revoca el vínculo y la misma sesión pierde acceso a RPC y vista", async () => {
    sql(`update public.guardianships set status='INACTIVE',deactivated_at=now() where id='${guardianshipId}';`);
    const response = await clients.guardian!.operation("get_ward_attendance_history", { p_group_id: groupId, p_athlete_user_id: athleteUserId });
    expect(response.status).toBe(404);
    const view = await clients.guardian!.sqlTable("v_ward_attendance_history").select("id").eq("group_id", groupId);
    expect(view.error).toBeNull(); expect(view.data).toEqual([]);
  });
});
