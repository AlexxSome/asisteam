import { describe, expect, it } from "vitest";
import { announcementSchema, announcementVersionSchema, announcementPageSchema } from "./announcement";

describe("anuncios", () => {
  it("normaliza bordes y conserva saltos y texto plano", () => {
    expect(announcementSchema.parse({ title: " Cambio de horario ", body: "  Primera línea\nSegunda línea <b>texto</b>  " }))
      .toEqual({ title: "Cambio de horario", body: "Primera línea\nSegunda línea <b>texto</b>" });
  });
  it.each([{ title: "\t\n", body: "Texto" }, { title: "Aviso", body: " " },
    { title: "x".repeat(121), body: "Texto" }, { title: "Aviso", body: "x".repeat(5001) },
    { title: "Aviso", body: "Texto", group_id: "otro" }])("rechaza entradas inválidas", (input) => {
    expect(announcementSchema.safeParse(input).success).toBe(false);
  });
  it("admite límites y valida versión/paginación", () => {
    expect(announcementSchema.safeParse({ title: "x".repeat(120), body: "x".repeat(5000) }).success).toBe(true);
    expect(announcementVersionSchema.safeParse("2026-10-03T12:00:00.123456+00:00").success).toBe(true);
    expect(announcementVersionSchema.safeParse("ayer").success).toBe(false);
    expect(announcementPageSchema.parse("2")).toBe(2);
    for (const page of ["0", "-1", "1.5", "100001", "foo"]) expect(announcementPageSchema.safeParse(page).success).toBe(false);
  });
});
