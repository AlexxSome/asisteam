// Historical Supabase origin regression; not evidence of current native runtime.
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@legacy/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, rpc: mock.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { issueCheckinQr, loadQrSettings, redeemCheckin, saveQrSettings } from "@legacy/app/check-in/actions";
const groupId = "58000000-0000-4000-8000-000000000201";
const input = { activity_id: "58000000-0000-4000-8000-000000000501", token: "a".repeat(64) };
const settings = { opens_before_minutes: 15, closes_after_minutes: 60, late_after_minutes: 10 };
const receipt = { activity_id: input.activity_id, group_id: groupId, activity_title: "Entrenamiento", status: "LATE", recorded_at: "2026-10-03T12:00:00+00:00", created: true };
beforeEach(() => { vi.resetAllMocks(); mock.getUser.mockResolvedValue({ data: { user: { id: "JWT identity" } } }); });
describe("acciones QR", () => {
  it("envía solo actividad/token; interpreta la asistencia calculada en servidor", async () => {
    mock.rpc.mockResolvedValue({ data: receipt, error: null });
    expect(await redeemCheckin(input)).toEqual({ receipt });
    expect(mock.rpc).toHaveBeenCalledWith("self_checkin", { p_activity_id: input.activity_id, p_token: input.token });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}/activities/${input.activity_id}/attendance`);
  });
  it("rechaza suplantación antes de llamar a la RPC", async () => {
    expect(await redeemCheckin({ ...input, membership_id: groupId })).toHaveProperty("error.code", "checkin_qr_expired");
    expect(await saveQrSettings(groupId, { ...settings, late_after_minutes: 61 })).toHaveProperty("error.code", "invalid_qr_settings");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("no llama RPC sin sesión", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    for (const operation of [redeemCheckin(input), issueCheckinQr(input.activity_id), loadQrSettings(groupId), saveQrSettings(groupId, settings)]) {
      expect(await operation).toHaveProperty("error.code", "authentication_required");
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("no expone errores internos ni confirma respuestas inválidas", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "private secret" } });
    expect(await redeemCheckin(input)).toHaveProperty("error.code", "checkin_failed");
    mock.rpc.mockResolvedValue({ data: null, error: { message: "checkin_window_closed" } });
    expect(await redeemCheckin(input)).toHaveProperty("error.code", "checkin_window_closed");
    mock.rpc.mockResolvedValue({ data: { ...receipt, status: "UNKNOWN" }, error: null });
    expect(await redeemCheckin(input)).toHaveProperty("error.code", "checkin_failed");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("edita y emite por RPC sin confiar en el rol que presenta el cliente", async () => {
    mock.rpc.mockResolvedValue({ data: settings, error: null });
    expect(await saveQrSettings(groupId, settings)).toEqual({ settings });
    expect(mock.rpc).toHaveBeenCalledWith("set_qr_checkin_settings", { p_group_id: groupId, p_settings: settings });
    mock.rpc.mockResolvedValue({ data: null, error: { message: "admin_required" } });
    expect(await issueCheckinQr(input.activity_id)).toHaveProperty("error.code", "admin_required");
    expect(mock.rpc).toHaveBeenLastCalledWith("issue_activity_checkin_qr", { p_activity_id: input.activity_id });
  });
});
