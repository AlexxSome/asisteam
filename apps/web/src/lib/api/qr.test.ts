import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn(), getQrSettings: vi.fn(), setQrSettings: vi.fn(), issueCheckinQr: vi.fn(), selfCheckin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, rpc: mock.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("./server", () => ({ createServerApiClient: () => mock }));
import { loadQrSettings, saveQrSettings, issueCheckinQr, redeemCheckin } from "@/app/check-in/actions";
const groupId = "58000000-0000-4000-8000-000000000201", activityId = "58000000-0000-4000-8000-000000000501";
const settings = { opens_before_minutes: 15, closes_after_minutes: 60, late_after_minutes: 10 };
const input = { activity_id: activityId, token: "a".repeat(64) };
const qr = { ...input, server_time: "2026-10-08T12:00:00Z", expires_at: "2026-10-08T12:01:00Z" };
const receipt = { activity_id: activityId, group_id: groupId, activity_title: "Entrenamiento", status: "PRESENT", recorded_at: qr.server_time, created: true };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("ASISTEAM_TRANSPORT_QR", "nest");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("ASISTEAM_API_SUPABASE_URL", "http://127.0.0.1:54321");
});
afterEach(() => vi.unstubAllEnvs());
it("las cuatro operaciones usan Nest, sin RPC ni autorización de cliente", async () => {
  mock.getQrSettings.mockResolvedValue(settings);mock.setQrSettings.mockResolvedValue(settings);mock.issueCheckinQr.mockResolvedValue(qr);mock.selfCheckin.mockResolvedValue(receipt);
  expect(await loadQrSettings(groupId)).toEqual({ settings }); expect(await saveQrSettings(groupId, settings)).toEqual({ settings });
  expect(await issueCheckinQr(activityId)).toEqual({ qr }); expect(await redeemCheckin(input)).toEqual({ receipt });
  expect(mock.selfCheckin).toHaveBeenCalledWith({ body: input });expect(mock.setQrSettings).toHaveBeenCalledWith({ params: { groupId }, body: settings });
  expect(mock.issueCheckinQr).toHaveBeenCalledWith({ params: { activityId } });expect(mock.rpc).not.toHaveBeenCalled();expect(mock.getUser).not.toHaveBeenCalled();expect(mock.revalidate).toHaveBeenCalledTimes(2);
});
it.each([401, 403, 404, 422])("conserva códigos seguros %s y no confirma/revalida", async status => {
  const code = ({401:"authentication_required",403:"admin_required",404:"checkin_not_available",422:"checkin_qr_expired"})[status]!;
  mock.selfCheckin.mockRejectedValue(new ApiClientError(status, code));expect(await redeemCheckin(input)).toHaveProperty("error.code",code);
  expect(mock.revalidate).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
});
it.each([503,504])("resultado incierto %s no hace fallback ni reenvío automático", async status => {
  mock.selfCheckin.mockRejectedValue(new ApiClientError(status,"request_timeout")); expect(await redeemCheckin(input)).toHaveProperty("error.code","checkin_failed");
  expect(mock.selfCheckin).toHaveBeenCalledTimes(1);expect(mock.rpc).not.toHaveBeenCalled();expect(mock.revalidate).not.toHaveBeenCalled();
});
it("valida suplantación y respuestas antes de confirmar", async () => {
  expect(await redeemCheckin({...input,user_id:groupId})).toHaveProperty("error.code","checkin_qr_expired");
  expect(await saveQrSettings(groupId,{...settings,late_after_minutes:61})).toHaveProperty("error.code","invalid_qr_settings");expect(mock.selfCheckin).not.toHaveBeenCalled();expect(mock.setQrSettings).not.toHaveBeenCalled();
  mock.selfCheckin.mockResolvedValue({...receipt,note:"privada"});expect(await redeemCheckin(input)).toHaveProperty("error.code","checkin_failed");expect(mock.revalidate).not.toHaveBeenCalled();
});
