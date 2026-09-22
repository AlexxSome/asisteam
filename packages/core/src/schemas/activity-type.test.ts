import { describe, expect, it } from "vitest";
import { activityTypeSchema, activityTypeUpdateSchema } from "./activity-type";

describe("tipos de actividad", () => {
  it("normaliza nombres y acepta los límites del contrato SQL", () => {
    expect(activityTypeSchema.parse({ name: "  Amistoso  ", color: "#aB123F" })).toEqual({ name: "Amistoso", color: "#aB123F" });
    for (const name of ["AB", "x".repeat(40)]) expect(activityTypeSchema.safeParse({ name, color: "#123456" }).success).toBe(true);
  });
  it.each(["", " ", "A", "x".repeat(41)])("rechaza nombre inválido %j", (name) => {
    expect(activityTypeSchema.safeParse({ name, color: "#123456" }).success).toBe(false);
  });
  it.each(["red", "#123", "123456", "#GGGGGG", "#1234567", "#123456\n"])("rechaza color inválido %j", (color) => {
    expect(activityTypeSchema.safeParse({ name: "Amistoso", color }).success).toBe(false);
  });
  it("no permite inyectar grupo, identidad ni estado al crear", () => {
    for (const extra of [{ group_id: "otro" }, { id: "otro" }, { is_active: false }]) {
      expect(activityTypeSchema.safeParse({ name: "Amistoso", color: "#123456", ...extra }).success).toBe(false);
    }
    expect(activityTypeUpdateSchema.parse({ name: "Amistoso", color: "#123456", is_active: false }).is_active).toBe(false);
    expect(activityTypeUpdateSchema.safeParse({ name: "Amistoso", color: "#123456", is_active: "false" }).success).toBe(false);
  });
});
