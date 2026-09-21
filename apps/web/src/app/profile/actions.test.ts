import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const single = vi.fn(); const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select, single }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update, select: vi.fn(() => ({ eq })) }));
  return { single, select, eq, update, from, getUser: vi.fn(), rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), revalidate: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, from: mock.from, rpc: mock.rpc,
  storage: { from: () => ({ upload: mock.upload, remove: mock.remove }) } }) }));
import { reviewBirthdate, saveProfile, setAvatarPermission, uploadAvatar } from "./actions";
const user = "16000000-0000-4000-8000-000000000001";
const values = { full_name: "Ana Pérez", birthdate: "1990-01-01", phone: null };
const profile = { id: user, ...values, email: "ana@example.test", avatar_url: null };
beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: user } } });
  mock.single.mockResolvedValue({ data: profile, error: null });
  mock.rpc.mockResolvedValue({ data: true, error: null });
  mock.upload.mockResolvedValue({ error: null }); mock.remove.mockResolvedValue({ error: null });
});
describe("perfil: Server Actions", () => {
  it("rechaza modificación de campos protegidos antes de escribir", async () => {
    expect((await saveProfile({ ...values, email: "otro@example.test" } as never)).ok).toBe(false);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("exige sesión válida", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await saveProfile(values)).ok).toBe(false);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("guarda solo el perfil del usuario autenticado e invalida bienvenida", async () => {
    expect((await saveProfile(values)).ok).toBe(true);
    expect(mock.eq).toHaveBeenCalledWith("auth_user_id", user);
    expect(mock.update).toHaveBeenCalledWith(values);
    expect(mock.revalidate).toHaveBeenCalledWith("/welcome");
  });
  it("solicita aprobación y conserva birthdate cuando el trigger lo exige", async () => {
    mock.single.mockResolvedValueOnce({ data: null, error: { message: "birthdate_admin_confirmation_required" } });
    const result = await saveProfile(values);
    expect(result.ok).toBe(true);
    expect(mock.rpc).toHaveBeenCalledWith("request_birthdate_change", { p_birthdate: values.birthdate });
    expect(mock.update).toHaveBeenLastCalledWith({ full_name: values.full_name, phone: null });
    expect(result.message).toContain("pendiente");
  });
  it("no anuncia solicitud guardada si la RPC falla", async () => {
    mock.single.mockResolvedValueOnce({ data: null, error: { message: "birthdate_admin_confirmation_required" } });
    mock.rpc.mockResolvedValue({ data: null, error: { message: "failure" } });
    expect((await saveProfile(values)).ok).toBe(false);
    expect(mock.update).toHaveBeenCalledTimes(1);
  });
  it("no expone detalles internos del error de DB", async () => {
    mock.single.mockResolvedValueOnce({ data: null, error: { message: "sensitive database text" } });
    expect((await saveProfile(values)).message).not.toContain("sensitive");
  });
});
describe("avatar", () => {
  function form(type = "image/png", bytes = new Uint8Array([137,80,78,71,13,10,26,10])) {
    const data = new FormData(); data.set("avatar", new File([bytes], "foto.png", { type })); return data;
  }
  it("rechaza contenido que no corresponde al MIME", async () => {
    expect((await uploadAvatar(form("image/png", new TextEncoder().encode("<svg></svg>")))).ok).toBe(false);
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("valida límite antes de subir", async () => {
    expect((await uploadAvatar(form("image/png", new Uint8Array(2097153)))).ok).toBe(false);
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("verifica consentimiento antes del upload", async () => {
    mock.rpc.mockResolvedValue({ data: false, error: null });
    expect((await uploadAvatar(form())).ok).toBe(false);
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("usa ruta privada con propietario y un nombre generado", async () => {
    expect((await uploadAvatar(form())).ok).toBe(true);
    expect(mock.upload.mock.calls[0]?.[0]).toMatch(new RegExp(`^${user}/[a-f0-9-]+\\.png$`));
    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ avatar_url: expect.stringMatching(/^\/profile\/avatar\//) }));
  });
  it("limpia el objeto nuevo si el perfil no se pudo actualizar", async () => {
    mock.single.mockResolvedValueOnce({ data: { avatar_url: null }, error: null }).mockResolvedValueOnce({ data: null, error: { message: "avatar_consent_required" } });
    expect((await uploadAvatar(form())).ok).toBe(false);
    expect(mock.remove).toHaveBeenCalledWith([mock.upload.mock.calls[0]?.[0]]);
  });
});
describe("decisiones", () => {
  it("verifica entradas y sesión al revisar una solicitud", async () => {
    expect((await reviewBirthdate("invalid", user, true)).ok).toBe(false);
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await reviewBirthdate(user, user, true)).ok).toBe(false);
  });
  it("distingue última aprobación de aprobación parcial", async () => {
    mock.rpc.mockResolvedValueOnce({ data: "PENDING", error: null }).mockResolvedValueOnce({ data: "APPLIED", error: null });
    expect((await reviewBirthdate(user, user, true)).message).toContain("Falta");
    expect((await reviewBirthdate(user, user, true)).message).toContain("Se aplicó");
  });
  it("permiso de imagen también se resuelve con sesión/RPC", async () => {
    expect((await setAvatarPermission(user, false)).ok).toBe(true);
    expect(mock.rpc).toHaveBeenCalledWith("set_avatar_permission", { p_guardianship_id: user, p_allow: false });
  });
});
