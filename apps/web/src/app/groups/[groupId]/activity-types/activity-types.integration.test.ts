import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNativeClient, nativeIntegrationConfig, nativeSql, nativeInvitationRequest, type NativePersistenceClient } from "../../../../../test/native-persistence.mjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// RUN_ACTIVITY_TYPE_INTEGRATION=1 pnpm --filter @asisteam/web exec vitest run activity-types.integration.test.ts
const suite = describe.skipIf(process.env.RUN_ACTIVITY_TYPE_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", "");
const email = (name: string) => `issue29-${run}-${name}@example.test`;
const clients: Record<string, NativePersistenceClient> = {};
const authIds: string[] = [];
let service: NativePersistenceClient;
let groupId: string;
let typeId: string;
const sql = nativeSql;
suite("tipos de actividad con Auth/SQL/RLS real", () => {
  beforeAll(async () => {
    const config = await nativeIntegrationConfig();
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_ORIGIN).hostname)) throw new Error("Solo se admite PostgreSQL/Nest local");
      service = createNativeClient(config.API_ORIGIN, config.OPERATOR_TOKEN);
    for (const name of ["owner", "athlete", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const created = await service.fixtureAccount({ email: email(name), password,  profile: { account_terms: { accepted: true, version: "2026-09-21" }, full_name: "Persona sintética", birthdate: "1990-01-01" } });
      if (created.error) throw new Error("No se pudo preparar cuenta sintética");
      authIds.push(created.data.user.id);
      const client = createNativeClient(config.API_ORIGIN, config.GUEST_TOKEN);
      if ((await client.auth.signInWithPassword({ email: email(name), password })).error) throw new Error("No se pudo iniciar sesión sintética");
      clients[name] = client;
    }
    const group = await clients.owner!.operation("create_group", { p_name: "Tipos integración", p_sport: "Tenis" });
    expect(group.error).toBeNull(); groupId = group.data;
    // Estos contratos anteriores a billing ejercitan clubes legacy (límite 500).
    sql(`insert into app_private.billing_legacy_groups(group_id) values('${groupId}');`);
    sql(`insert into public.memberships(user_id,group_id,role,status) select id,'${groupId}','ATHLETE','ACTIVE' from public.users where email='${email("athlete")}';`);
  }, 30_000);
  // The runner disposes its entire uniquely owned synthetic database; no
  // delete/trigger-bypass cleanup is exposed to product credentials.
  it("crea tipo y actividad; desactivarlo conserva historial y asistencia y bloquea usos nuevos", async () => {
    const owner = clients.owner!;
    const created = await owner.http(`groups/${groupId}/activity-types`, { name: "  Amistoso  ", color: "#123ABC" });
    expect(created.error).toBeNull(); typeId = created.data!.id;
    expect((await owner.sqlTable("v_activity_types").select("name, color").eq("id", typeId).eq("is_active", true).single()).data)
      .toEqual({ name: "Amistoso", color: "#123ABC" });
    const args = { p_group_id: groupId, p_activity_type_id: typeId, p_title: "Partido histórico", p_starts_at: "2026-07-07T22:30:00Z", p_ends_at: "2026-07-07T23:30:00Z" };
    const activity = await owner.operation("create_activity", args);
    expect(activity.error).toBeNull();
    const membershipId = sql(`select id from public.memberships where group_id='${groupId}' and role='ATHLETE';`);
    expect((await owner.operation("record_attendance_bulk", { p_activity_id: activity.data, p_records: [{ membership_id: membershipId, status: "PRESENT" }] })).error).toBeNull();
    const edit = await owner.http(`groups/${groupId}/activity-types/${typeId}`, { name: "Amistoso editado", color: "#ABCDEF", is_active: false }, "PATCH");
    expect(edit.error).toBeNull();
    expect((await owner.sqlTable("v_activity_types").select("id").eq("id", typeId).eq("is_active", true)).data).toEqual([]);
    expect((await clients.athlete!.sqlTable("v_group_activities").select("activity_type_id, activity_type_name, activity_type_color").eq("id", activity.data).single()).data)
      .toEqual({ activity_type_id: typeId, activity_type_name: "Amistoso editado", activity_type_color: "#ABCDEF" });
    expect((await clients.athlete!.sqlTable("v_attendance_own").select("status").eq("activity_id", activity.data)).data).toEqual([{ status: "PRESENT" }]);
    expect((await owner.operation("create_activity", args)).error?.message).toBe("invalid_activity_type");
    expect((await owner.operation("update_activity", { ...args, p_activity_id: activity.data, p_title: "Histórico actualizado" })).error).toBeNull();
  });
  it("SQL/RLS aplica unicidad/validación y no permite editar sistema, mover identidad ni borrar", async () => {
    const owner = clients.owner!;
    expect((await owner.sqlTable("activity_types").insert({ group_id: groupId, name: " AMISTOSO EDITADO ", color: "#123ABC" })).status).toBe(409);
    expect((await owner.sqlTable("activity_types").insert({ group_id: groupId, name: "Color inválido", color: "red" })).error?.code).toBe("23514");
    expect((await owner.sqlTable("activity_types").update({ is_active: false }).is("group_id", null).select("id")).data).toEqual([]);
    expect((await owner.sqlTable("activity_types").update({ group_id: null }).eq("id", typeId)).status).toBe(403);
    expect((await owner.sqlTable("activity_types").delete().eq("id", typeId)).status).toBe(403);
    expect((await owner.sqlTable("v_activity_types").select("id").is("group_id", null).eq("is_active", true)).data).toHaveLength(4);
  });
  it("ATHLETE y ajeno no pueden crear ni editar; ajeno no enumera tipos privados", async () => {
    for (const name of ["athlete", "outsider"]) {
      const client = clients[name]!;
      expect((await client.sqlTable("activity_types").insert({ group_id: groupId, name: "Ataque", color: "#123ABC" })).status).toBe(403);
      expect((await client.sqlTable("activity_types").update({ name: "Ataque", is_active: true }).eq("id", typeId).select("id")).data).toEqual([]);
    }
    expect((await clients.outsider!.sqlTable("activity_types").select("id").eq("group_id", groupId)).data).toEqual([]);
    expect((await clients.outsider!.sqlTable("v_activity_types").select("id").eq("group_id", groupId)).data).toEqual([]);
  });
});
