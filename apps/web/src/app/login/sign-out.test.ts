import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ signOut: vi.fn(), createClient: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect, RedirectType: { replace: "replace" } }));
import { signOutUser } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mock.createClient.mockResolvedValue({ auth: { signOut: mock.signOut } });
  mock.signOut.mockResolvedValue({ error: null });
  mock.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
});

describe("cierre de sesión en este dispositivo", () => {
  it("usa el cliente SSR con escritura obligatoria, revoca solo la sesión local y descarta páginas privadas", async () => {
    await expect(signOutUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mock.createClient).toHaveBeenCalledWith({ requireCookieWrites: true });
    expect(mock.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(mock.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mock.redirect).toHaveBeenCalledWith("/login", "replace");
    expect(mock.signOut.mock.invocationCallOrder[0]).toBeLessThan(mock.revalidatePath.mock.invocationCallOrder[0]!);
    expect(mock.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(mock.redirect.mock.invocationCallOrder[0]!);
  });

  it("devuelve error recuperable sin redirigir ni exponer detalles y permite reintentar", async () => {
    mock.signOut.mockResolvedValueOnce({ error: { message: "secret token" } });
    expect(await signOutUser()).toEqual({ error: "No pudimos cerrar tu sesión. Vuelve a intentarlo." });
    expect(mock.redirect).not.toHaveBeenCalled();
    expect(mock.revalidatePath).not.toHaveBeenCalled();
    await expect(signOutUser()).rejects.toThrow("NEXT_REDIRECT");
  });

  it.each(["red", "cookies"])("no anuncia éxito si falla %s", async source => {
    (source === "red" ? mock.signOut : mock.createClient).mockRejectedValueOnce(new Error("secret credential"));
    expect(await signOutUser()).toEqual({ error: "No pudimos cerrar tu sesión. Vuelve a intentarlo." });
    expect(mock.redirect).not.toHaveBeenCalled();
    expect(mock.revalidatePath).not.toHaveBeenCalled();
  });
});
