import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ logout: vi.fn(), refresh: vi.fn(), client: vi.fn(), clear: vi.fn(), origin: vi.fn(), cookie: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/api/native-auth", () => ({ nativeAuthClient: mock.client, clearNativeCookies: mock.clear, assertAuthOrigin: mock.origin }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get:mock.cookie }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect, RedirectType: { replace:"replace" } }));
import { signOutUser } from "@/app/login/actions";
beforeEach(() => {
  vi.resetAllMocks();
  mock.cookie.mockImplementation((name:string)=>name==="asisteam-access"?{value:"synthetic-access"}:undefined);
  mock.client.mockResolvedValue({ logoutSession: mock.logout, refreshSession:mock.refresh });
  mock.logout.mockResolvedValue({success:true});mock.clear.mockResolvedValue(undefined);
  mock.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
});
describe("cierre de sesión nativo en este dispositivo", () => {
  it("revoca la familia actual, limpia cookies y descarta páginas privadas antes de redirigir", async () => {
    await expect(signOutUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mock.client).toHaveBeenCalledWith("synthetic-access");
    expect(mock.logout).toHaveBeenCalledExactlyOnceWith();expect(mock.clear).toHaveBeenCalledExactlyOnceWith();
    expect(mock.revalidatePath).toHaveBeenCalledWith("/","layout");
    expect(mock.redirect).toHaveBeenCalledWith("/login","replace");
    expect(mock.logout.mock.invocationCallOrder[0]).toBeLessThan(mock.clear.mock.invocationCallOrder[0]!);
    expect(mock.clear.mock.invocationCallOrder[0]).toBeLessThan(mock.revalidatePath.mock.invocationCallOrder[0]!);
    expect(mock.revalidatePath.mock.invocationCallOrder[0]).toBeLessThan(mock.redirect.mock.invocationCallOrder[0]!);
  });
  it("devuelve error recuperable sin redirigir ni exponer detalles y permite reintentar", async () => {
    mock.logout.mockRejectedValueOnce(new Error("secret token"));
    expect(await signOutUser()).toEqual({error:"No pudimos cerrar tu sesión. Vuelve a intentarlo."});
    expect(mock.redirect).not.toHaveBeenCalled();expect(mock.revalidatePath).not.toHaveBeenCalled();
    await expect(signOutUser()).rejects.toThrow("NEXT_REDIRECT");
  });
  it.each(["red","cookies"])("no anuncia éxito si falla %s",async source=>{
    (source==="red"?mock.logout:mock.clear).mockRejectedValueOnce(new Error("secret credential"));
    expect(await signOutUser()).toEqual({error:"No pudimos cerrar tu sesión. Vuelve a intentarlo."});
    expect(mock.redirect).not.toHaveBeenCalled();expect(mock.revalidatePath).not.toHaveBeenCalled();
  });
  it("limpia el navegador anónimo sin pedir una revocación autenticada",async()=>{
    mock.cookie.mockReturnValue(undefined);
    await expect(signOutUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mock.origin).toHaveBeenCalledExactlyOnceWith();expect(mock.clear).toHaveBeenCalled();
    expect(mock.client).not.toHaveBeenCalled();expect(mock.logout).not.toHaveBeenCalled();
    expect(mock.revalidatePath).toHaveBeenCalledWith("/","layout");
  });
  it("refresca el token vencido para revocar la familia antes de borrar cookies",async()=>{
    mock.cookie.mockImplementation((name:string)=>({value:name==="asisteam-access"?"expired":"synthetic-refresh"}));
    mock.logout.mockRejectedValueOnce(new ApiClientError(401,"authentication_required"));
    mock.refresh.mockResolvedValue({access_token:"renewed"});
    await expect(signOutUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mock.refresh).toHaveBeenCalledWith({body:{refresh_token:"synthetic-refresh"}});
    expect(mock.client).toHaveBeenLastCalledWith("renewed");expect(mock.logout).toHaveBeenCalledTimes(2);
    expect(mock.clear).toHaveBeenCalled();
  });
  it("limpia cookies de una familia ya revocada después del rechazo 401 del refresh",async()=>{
    mock.cookie.mockReturnValue({value:"revoked"});
    mock.logout.mockRejectedValue(new ApiClientError(401,"authentication_required"));
    mock.refresh.mockRejectedValue(new ApiClientError(401,"authentication_required"));
    await expect(signOutUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mock.clear).toHaveBeenCalled();expect(mock.logout).toHaveBeenCalledTimes(1);
  });
});
