import { describe, expect, it } from "vitest";
import { groupFormSchema } from "./group";

describe("datos para crear un grupo", () => {
  it("normaliza texto y admite omitir los campos opcionales", () => {
    expect(groupFormSchema.parse({ name: "  Club Ñuñoa  ", sport: "  Fútbol  " })).toEqual({ name: "Club Ñuñoa", sport: "Fútbol" });
  });
  it.each([
    { name: "ab", sport: "Fútbol" }, { name: "a".repeat(81), sport: "Fútbol" },
    { name: "Club", sport: " " }, { name: "Club", sport: "x".repeat(51) },
    { name: "Club", sport: "Fútbol", logo_url: "javascript:alert(1)" },
    { name: "Club", sport: "Fútbol", logo_url: "https://" },
    { name: "Club", sport: "Fútbol", logo_url: "https://logo.test/a b" },
  ])("rechaza datos inválidos: %j", (input) => {
    expect(groupFormSchema.safeParse(input).success).toBe(false);
  });
  it.each(["", "https://example.test/logo.png", "http://example.test/logo.png?version=1"])("acepta logo opcional %s", (logo_url) => {
    expect(groupFormSchema.safeParse({ name: "Club", sport: "Fútbol", logo_url }).success).toBe(true);
  });
  it("descarta campos controlados exclusivamente por el servidor", () => {
    expect(groupFormSchema.parse({ name: "Club", sport: "Fútbol", created_by: "other", invite_code: "CUSTOM01", settings: { athletes_can_view_group_stats: true } }))
      .toEqual({ name: "Club", sport: "Fútbol" });
  });
});
