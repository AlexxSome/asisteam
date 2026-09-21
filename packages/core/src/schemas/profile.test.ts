import { afterEach, describe, expect, it, vi } from "vitest";
import { avatarContentType, avatarFileSchema, chileToday, isMinor, profileSchema } from "./profile";

afterEach(() => vi.useRealTimers());
const profile = { full_name: "Ana Pérez", phone: null, birthdate: "2000-01-01" };
describe("perfil", () => {
  it("permite limpiar campos opcionales y normaliza el nombre", () => {
    expect(profileSchema.parse({ ...profile, full_name: "  Ana Pérez  ", birthdate: null })).toEqual({ ...profile, birthdate: null });
  });
  it.each(["12345678", "+012345678", "+569123", "<script>"])("rechaza teléfono %s", (phone) => {
    expect(profileSchema.safeParse({ ...profile, phone }).success).toBe(false);
  });
  it("rechaza email y otros campos fuera del contrato", () => {
    expect(profileSchema.safeParse({ ...profile, email: "otro@example.cl" }).success).toBe(false);
  });
  it("valida calendario, antigüedad y fecha local chilena", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-01T02:00:00Z"));
    expect(chileToday()).toBe("2026-05-31");
    for (const birthdate of ["2025-02-29", "2026-05-31", "2026-06-01", "1800-01-01"]) {
      expect(profileSchema.safeParse({ ...profile, birthdate }).success).toBe(false);
    }
    expect(profileSchema.safeParse({ ...profile, birthdate: "2024-02-29", phone: "+56912345678" }).success).toBe(true);
  });
  it("cambia mayoría exactamente en el cumpleaños, incluidos años bisiestos", () => {
    expect(isMinor("2008-09-21", "2026-09-20")).toBe(true);
    expect(isMinor("2008-09-21", "2026-09-21")).toBe(false);
    expect(isMinor("2008-02-29", "2026-02-28")).toBe(true);
    expect(isMinor("2008-02-29", "2026-03-01")).toBe(false);
  });
});
describe("avatar", () => {
  it("limita tamaño y formatos", () => {
    expect(avatarFileSchema.safeParse({ type: "image/png", size: 2097152 }).success).toBe(true);
    for (const file of [{ type: "image/svg+xml", size: 30 }, { type: "image/png", size: 2097153 }, { type: "image/jpeg", size: 0 }]) {
      expect(avatarFileSchema.safeParse(file).success).toBe(false);
    }
  });
  it("no confía en extensión o MIME del archivo", () => {
    expect(avatarContentType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(avatarContentType(new Uint8Array([255, 216, 255, 0]))).toBe("image/jpeg");
    expect(avatarContentType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("image/png");
    expect(avatarContentType(new TextEncoder().encode("RIFF0000WEBP"))).toBe("image/webp");
  });
});
