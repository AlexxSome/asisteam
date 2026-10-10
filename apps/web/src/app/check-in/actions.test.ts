import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ self: vi.fn(), issue: vi.fn(), load: vi.fn(), save: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ createServerApiClient: () => ({ selfCheckin: mock.self, issueCheckinQr: mock.issue, getQrSettings: mock.load, setQrSettings: mock.save }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { issueCheckinQr, loadQrSettings, redeemCheckin, saveQrSettings } from "@/app/check-in/actions";
const groupId = "58000000-0000-4000-8000-000000000201";
const input = { activity_id: "58000000-0000-4000-8000-000000000501", token: "a".repeat(64) };
const settings = { opens_before_minutes: 15, closes_after_minutes: 60, late_after_minutes: 10 };
const receipt = { activity_id: input.activity_id, group_id: groupId, activity_title: "Entrenamiento", status: "LATE", recorded_at: "2026-10-03T12:00:00+00:00", created: true };
beforeEach(() => { vi.resetAllMocks(); });
describe("acciones QR nativas", () => {
  it("envía solo actividad/token; interpreta la asistencia calculada en servidor", async () => {
    mock.self.mockResolvedValue(receipt);
    expect(await redeemCheckin(input)).toEqual({ receipt });
    expect(mock.self).toHaveBeenCalledWith({ body: input });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}/activities/${input.activity_id}/attendance`);
  });
  it("rechaza suplantación antes de llamar a la API", async () => {
    expect(await redeemCheckin({ ...input, membership_id: groupId })).toHaveProperty("error.code", "checkin_qr_expired");
    expect(await saveQrSettings(groupId, { ...settings, late_after_minutes: 61 })).toHaveProperty("error.code", "invalid_qr_settings");
    expect(mock.self).not.toHaveBeenCalled();expect(mock.save).not.toHaveBeenCalled();
  });
  it("conserva el rechazo de autenticación de las cuatro operaciones", async () => {
    for (const method of [mock.self, mock.issue, mock.load, mock.save]) method.mockRejectedValue(new ApiClientError(401,"authentication_required"));
    for (const operation of [redeemCheckin(input), issueCheckinQr(input.activity_id), loadQrSettings(groupId), saveQrSettings(groupId, settings)]) {
      expect(await operation).toHaveProperty("error.code", "authentication_required");
    }
    for (const method of [mock.self, mock.issue, mock.load, mock.save]) expect(method).toHaveBeenCalledTimes(1);
  });
  it("no expone errores internos ni confirma respuestas inválidas", async () => {
    mock.self.mockRejectedValue(new Error("private secret"));
    expect(await redeemCheckin(input)).toHaveProperty("error.code", "checkin_failed");
    mock.self.mockRejectedValue(new ApiClientError(422,"checkin_window_closed"));
    expect(await redeemCheckin(input)).toHaveProperty("error.code", "checkin_window_closed");
    mock.self.mockResolvedValue({ ...receipt, status: "UNKNOWN" });
    expect(await redeemCheckin(input)).toHaveProperty("error.code", "checkin_failed");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("edita y emite por API sin confiar en el rol que presenta el cliente", async () => {
    mock.save.mockResolvedValue(settings);
    expect(await saveQrSettings(groupId, settings)).toEqual({ settings });
    expect(mock.save).toHaveBeenCalledWith({ params: {groupId}, body: settings });
    mock.issue.mockRejectedValue(new ApiClientError(403,"admin_required"));
    expect(await issueCheckinQr(input.activity_id)).toHaveProperty("error.code", "admin_required");
    expect(mock.issue).toHaveBeenLastCalledWith({ params: {activityId: input.activity_id} });
  });
});
