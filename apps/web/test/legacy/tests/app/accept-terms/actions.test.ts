// Historical Supabase origin regression; not evidence of current native runtime.
import { beforeEach, expect, it, vi } from "vitest";
import { ACCOUNT_TERMS_VERSION } from "@asisteam/core";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@legacy/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, rpc: mock.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { acceptAccountTerms } from "@legacy/app/accept-terms/actions";
const input = { terms_accepted: true, terms_version: ACCOUNT_TERMS_VERSION };
beforeEach(() => {
  vi.resetAllMocks(); mock.getUser.mockResolvedValue({ data: { user: { id: "actor" } } });
  mock.rpc.mockResolvedValue({ data: "consent-id", error: null });
});
it.each([{}, { ...input, terms_accepted: false }, { ...input, terms_version: "old" }])("servidor rechaza %j antes de escribir", async value => {
  expect(await acceptAccountTerms(value)).toHaveProperty("error"); expect(mock.rpc).not.toHaveBeenCalled();
});
it("no permite aceptación sin sesión", async () => {
  mock.getUser.mockResolvedValue({ data: { user: null } });
  expect(await acceptAccountTerms(input)).toHaveProperty("error"); expect(mock.rpc).not.toHaveBeenCalled();
});
it("servidor no pasa usuario, fecha ni canal elegidos por cliente", async () => {
  expect(await acceptAccountTerms({ ...input, user_id: "other", granted_at: "yesterday", channel: "INVITATION" })).toEqual({ success: true });
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("accept_account_terms", { p_accepted: true, p_terms_version: ACCOUNT_TERMS_VERSION });
  expect(mock.revalidate).toHaveBeenCalledWith("/", "layout");
});
it("fallo no se presenta como aceptación completada y permite reintento", async () => {
  mock.rpc.mockResolvedValueOnce({ error: { message: "private" } });
  const result = await acceptAccountTerms(input);
  expect(result).toHaveProperty("error"); expect(JSON.stringify(result)).not.toContain("private");
  expect(mock.revalidate).not.toHaveBeenCalled();
  expect(await acceptAccountTerms(input)).toEqual({ success: true });
});
