import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNativeClient, nativeIntegrationConfig, nativeSql, nativeInvitationRequest, type NativePersistenceClient } from "../../../../../test/native-persistence.mjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { attendanceHistorySchema, groupAttendanceReportSchema, groupStatsSchema } from "@asisteam/core";

const suite = describe.skipIf(process.env.RUN_REPORT_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue32-${run}-${name}@example.test`;
const clients: Record<string, NativePersistenceClient> = {};
const authIds: string[] = [];
let service: NativePersistenceClient;
let groupId: string;
let membershipId: string;
let teammateMembershipId: string;
const sql = nativeSql;
suite("reportes con Auth y SQL/RLS real", () => {
  beforeAll(async () => {
    const config = await nativeIntegrationConfig();
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_ORIGIN).hostname)) throw new Error("Solo se admite PostgreSQL/Nest local");
      service = createNativeClient(config.API_ORIGIN, config.OPERATOR_TOKEN);
    for (const name of ["owner", "athlete", "teammate", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const created = await service.fixtureAccount({ email: email(name), password,  profile: { account_terms: { accepted: true, version: "2026-09-21" }, full_name: name === "teammate" ? "Tercero sintético" : "Persona sintética", birthdate: "1990-01-01" } });
      if (created.error) throw new Error("No se pudo preparar cuenta sintética");
      authIds.push(created.data.user.id);
      const client = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      clients[name] = client;
    }
    const group = await clients.owner!.operation("create_group", { p_name: "Reportes integración", p_sport: "Tenis" });
    expect(group.error).toBeNull(); groupId = group.data;
    // Estos contratos anteriores a billing ejercitan clubes legacy (límite 500).
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');`);
    membershipId = sql(`insert into public.memberships(user_id,group_id,role,status,joined_at) select id,'${groupId}','ATHLETE','ACTIVE','2026-01-01' from public.users where email='${email("athlete")}' returning id;`).split("\n")[0]!;
    teammateMembershipId = sql(`insert into public.memberships(user_id,group_id,role,status,joined_at) select id,'${groupId}','ATHLETE','ACTIVE','2026-01-01' from public.users where email='${email("teammate")}' returning id;`).split("\n")[0]!;
    sql(`update public.groups set created_at='2026-01-01' where id='${groupId}';
      insert into public.activities(group_id,activity_type_id,title,starts_at,ends_at,created_by)
      select '${groupId}','b2c3d4e5-0003-4b3c-8d4e-333333333333','Actividad sintética '||n,
      timestamptz '2026-03-01T12:00Z'+n*interval '1 day',timestamptz '2026-03-01T13:00Z'+n*interval '1 day',u.id
      from generate_series(1,8) n cross join public.users u where u.email='${email("owner")}';`);
    const activities = await clients.owner!.sqlTable("v_group_activities").select("id").eq("group_id", groupId).order("starts_at");
    expect(activities.error).toBeNull();
    for (const [index, activity] of activities.data!.entries()) {
      expect((await clients.owner!.operation("record_attendance_bulk", { p_activity_id: activity.id, p_records: [
        { membership_id: membershipId, status: index < 5 ? "PRESENT" : index === 5 ? "LATE" : index === 6 ? "ABSENT" : "EXCUSED" },
        { membership_id: teammateMembershipId, status: "ABSENT", note: "Nota privada de tercero" },
      ] })).error).toBeNull();
    }
  }, 30000);
  // The runner disposes its entire uniquely owned synthetic database; no
  // delete/trigger-bypass cleanup is exposed to product credentials.
  it("RPC serializa conteos y porcentajes como números y refleja correcciones", async () => {
    const args = { p_group_id: groupId, p_period: "month", p_from: "2026-03-01", p_activity_type_ids: ["b2c3d4e5-0003-4b3c-8d4e-333333333333"] };
    const response = await clients.owner!.operation("get_group_attendance_report", args);
    expect(response.error).toBeNull();
    const report = groupAttendanceReportSchema.parse(response.data);
    expect(report.by_athlete[0]).toMatchObject({ membership_id: membershipId, convened: 8, present: 5, late: 1, absent: 1, excused: 1, attendance_pct: 85.7, late_rate: 16.7 });
    for (const privateField of ["email", "phone", "birthdate", "note"]) expect(response.data.by_athlete[0]).not.toHaveProperty(privateField);
    const record = await clients.owner!.sqlTable("v_attendance_admin").select("id").eq("membership_id", membershipId).eq("status", "ABSENT").single();
    expect(record.error).toBeNull();
    expect((await clients.owner!.operation("update_attendance_record", { p_record_id: record.data!.id, p_changes: { status: "EXCUSED" } })).error).toBeNull();
    expect((await clients.owner!.operation("get_group_attendance_report", args)).data.by_athlete[0].attendance_pct).toBe(100);
  });
  it("HTTP aplica 403/404 y vista no expone datos a no-ADMIN", async () => {
    expect((await clients.athlete!.operation("get_group_attendance_report", { p_group_id: groupId })).status).toBe(403);
    expect((await clients.outsider!.operation("get_group_attendance_report", { p_group_id: groupId })).status).toBe(404);
    expect((await clients.athlete!.sqlTable("v_group_attendance_report").select("group_id").eq("group_id", groupId)).data).toEqual([]);
    expect((await clients.owner!.operation("get_group_attendance_report", { p_group_id: groupId, p_period: "custom" })).status).toBe(400);
  });
  it("toggle habilita y revoca agregados con el mismo JWT, sin revelar campos privados", async () => {
    const athlete = clients.athlete!;
    const originalToken = (await athlete.auth.getSession()).data.session!.access_token;
    expect((await athlete.operation("get_group_stats", { p_group_id: groupId })).status).toBe(403);
    const ownBefore = await athlete.operation("get_my_attendance_history", { p_group_id: groupId, p_period: "season" });
    expect(ownBefore.error).toBeNull();
    const own = attendanceHistorySchema.parse(ownBefore.data);
    expect(own).toMatchObject({ membership_id: membershipId, totals: { convened: 8, present: 5, late: 1 } });
    expect(JSON.stringify(own)).not.toContain("Nota privada de tercero");
    expect((await athlete.operation("update_group_settings", { p_group_id: groupId, p_changes: { athletes_can_view_group_stats: true } })).status).toBe(403);
    expect((await clients.outsider!.operation("update_group_settings", { p_group_id: groupId, p_changes: { athletes_can_view_group_stats: true } })).status).toBe(404);
    expect((await clients.owner!.operation("update_group_settings", { p_group_id: groupId, p_changes: { athletes_can_view_group_stats: "true" } })).status).toBe(400);
    const update = await clients.owner!.operation("update_group_settings", { p_group_id: groupId, p_changes: { athletes_can_view_group_stats: true } });
    expect(update.error).toBeNull();
    expect(update.data).toEqual({ athletes_can_view_group_stats: true, guardians_can_view_group_stats: false });
    const response = await athlete.operation("get_group_stats", { p_group_id: groupId });
    expect(response.error).toBeNull();
    const report = groupStatsSchema.parse(response.data);
    expect(report.members[0]).toMatchObject({ membership_id: membershipId, convened: 8 });
    expect(report.members[1]).toMatchObject({ membership_id: teammateMembershipId, full_name: "Tercero sintético", absent: 8, attendance_pct: 0 });
    expect(report.totals).toMatchObject({ athletes: 2, convened: 16 });
    expect(JSON.stringify(response.data)).not.toContain("Nota privada de tercero");
    expect(JSON.stringify(response.data)).not.toContain(email("teammate"));
    expect(Object.keys(response.data.members[0]).sort()).toEqual(["membership_id", "full_name", "avatar_url", "convened", "present", "late", "absent", "excused", "attendance_pct", "late_rate"].sort());
    expect(Object.keys(response.data.members[1]).sort()).toEqual(Object.keys(response.data.members[0]).sort());
    const secondPage = await athlete.operation("get_group_stats", { p_group_id: groupId, p_page: 2, p_page_size: 1 });
    expect(secondPage.error).toBeNull();
    expect(secondPage.data.members).toHaveLength(1);
    expect(secondPage.data.members[0].membership_id).toBe(teammateMembershipId);
    expect(secondPage.data.totals).toEqual(report.totals);
    const direct = await athlete.sqlTable("v_group_stats_members").select("*").eq("group_id", groupId);
    expect(direct.error).toBeNull(); expect(direct.data).toHaveLength(2);
    expect(Object.keys(direct.data![0]!).sort()).toEqual([...Object.keys(response.data.members[0]), "group_id"].sort());
    expect((await athlete.operation("get_group_attendance_report", { p_group_id: groupId })).status).toBe(403);
    expect((await clients.outsider!.operation("get_group_stats", { p_group_id: groupId })).status).toBe(404);
    expect((await clients.owner!.operation("update_group_settings", { p_group_id: groupId, p_changes: { athletes_can_view_group_stats: false } })).error).toBeNull();
    expect((await athlete.operation("get_group_stats", { p_group_id: groupId })).status).toBe(403);
    expect((await athlete.sqlTable("v_group_stats_members").select("full_name").eq("group_id", groupId)).data).toEqual([]);
    const ownAfter = await athlete.operation("get_my_attendance_history", { p_group_id: groupId, p_period: "season" });
    expect(ownAfter.error).toBeNull();
    expect(ownAfter.data).toEqual(ownBefore.data);
    expect((await athlete.auth.getSession()).data.session!.access_token).toBe(originalToken);
  });
  it("COACH opera por HTTP sin notas ni administración y pierde permisos con el mismo JWT", async () => {
    const coach = clients.athlete!;
    const owner = clients.owner!;
    const token = (await coach.auth.getSession()).data.session!.access_token;
    const assigned = await owner.operation("assign_member_coach", { p_group_id: groupId, p_membership_id: membershipId });
    expect(assigned.error).toBeNull();
    expect((await owner.operation("assign_member_coach", { p_group_id: groupId, p_membership_id: membershipId })).data).toBe(assigned.data);
    expect((await coach.sqlTable("v_my_groups").select("roles").eq("id", groupId).single()).data!.roles).toEqual(["ATHLETE", "COACH"]);
    const record = await coach.sqlTable("v_attendance_operator").select("id, activity_id, membership_id, status, note")
      .eq("group_id", groupId).eq("membership_id", teammateMembershipId).limit(1).single();
    expect(record.error).toBeNull(); expect(record.data!.note).toBeNull();
    const corrected = await coach.operation("update_attendance_record", { p_record_id: record.data!.id, p_changes: { status: "LATE" } });
    expect(corrected.error).toBeNull();
    expect(corrected.data.records[0]).toMatchObject({ status: "LATE", note: null });
    expect((await owner.sqlTable("v_attendance_admin").select("note").eq("id", record.data!.id).single()).data!.note).toBe("Nota privada de tercero");
    expect((await coach.operation("update_attendance_record", { p_record_id: record.data!.id, p_changes: { note: null } })).status).toBe(403);
    expect((await coach.operation("clear_attendance_record", { p_activity_id: record.data!.activity_id, p_membership_id: teammateMembershipId })).status).toBe(403);
    const report = await coach.operation("get_group_attendance_report", { p_group_id: groupId, p_period: "season" });
    expect(report.error).toBeNull();
    expect(groupAttendanceReportSchema.parse(report.data).by_athlete.find(row => row.membership_id === teammateMembershipId)).toMatchObject({ late: 1, absent: 7, attendance_pct: 12.5 });
    expect(JSON.stringify(report.data)).not.toContain("Nota privada de tercero");
    expect((await coach.sqlTable("v_group_attendance_report").select("membership_id").eq("group_id", groupId)).data).toEqual([]);
    expect((await coach.sqlTable("v_attendance_admin").select("id").eq("group_id", groupId)).data).toEqual([]);
    expect((await coach.operation("list_group_members", { p_group_id: groupId })).status).toBe(403);
    expect((await coach.operation("update_group_settings", { p_group_id: groupId, p_changes: { athletes_can_view_group_stats: true } })).status).toBe(403);
    expect((await coach.operation("assign_member_coach", { p_group_id: groupId, p_membership_id: teammateMembershipId })).status).toBe(403);
    expect((await owner.operation("deactivate_membership", { p_group_id: groupId, p_membership_id: assigned.data })).error).toBeNull();
    expect((await coach.operation("get_group_attendance_report", { p_group_id: groupId })).status).toBe(403);
    expect((await coach.operation("update_attendance_record", { p_record_id: record.data!.id, p_changes: { status: "PRESENT" } })).status).toBe(403);
    expect((await coach.sqlTable("v_attendance_operator").select("id").eq("group_id", groupId)).data).toEqual([]);
    expect((await coach.auth.getSession()).data.session!.access_token).toBe(token);
  });

});
