import { describe, expect, it } from "vitest";
import { activityFormSchema, activityTypeLabel, chileDateTimeToUtc, formatActivityDateTime } from "./activity";

const activity = {
  title: "Entrenamiento adultos", activity_type_id: "b2c3d4e5-0001-4b3c-8d4e-111111111111",
  location: "Cancha 1", description: "", starts_at: "2026-07-07T18:30", ends_at: "2026-07-07T20:00",
};
describe("actividad puntual en hora chilena", () => {
  it("convierte invierno y verano sin depender de la zona del proceso", () => {
    expect(chileDateTimeToUtc(activity.starts_at)).toBe("2026-07-07T22:30:00Z");
    expect(chileDateTimeToUtc("2026-01-07T18:30")).toBe("2026-01-07T21:30:00Z");
    expect(formatActivityDateTime("2026-07-07T22:30:00Z")).toContain("18:30");
  });
  it("acepta término al día siguiente y normaliza textos", () => {
    expect(activityFormSchema.parse({ ...activity, title: "  Partido  ", ends_at: "2026-07-08T00:30" }).title).toBe("Partido");
  });
  it.each(["2026-07-07T18:30", "2026-07-07T17:30"])("rechaza fin igual o anterior: %s", (ends_at) => {
    const parsed = activityFormSchema.safeParse({ ...activity, ends_at });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.flatten().fieldErrors.ends_at).toContain("El término debe ser posterior al inicio");
  });
  it.each(["2026-02-30T18:30", "2026-07-07T25:00", "2026-07-07T18:30Z", "2026-09-06T00:30", "2026-04-04T23:30", ""])("no corrige silenciosamente fechas inválidas/ambiguas: %s", (starts_at) => {
    expect(activityFormSchema.safeParse({ ...activity, starts_at }).success).toBe(false);
  });
  it("valida tipo y límites de texto", () => {
    expect(activityFormSchema.safeParse({ ...activity, activity_type_id: "otro", title: "  ", location: "x".repeat(201) }).success).toBe(false);
  });
  it("permite 24 horas pero rechaza duraciones mayores", () => {
    expect(activityFormSchema.safeParse({ ...activity, ends_at: "2026-07-08T18:30" }).success).toBe(true);
    expect(activityFormSchema.safeParse({ ...activity, ends_at: "2026-07-08T18:31" }).success).toBe(false);
  });
  it("traduce tipos de sistema sin renombrar tipos personalizados", () => {
    expect(activityTypeLabel("TRAINING", true)).toBe("Entrenamiento");
    expect(activityTypeLabel("TRAINING", false)).toBe("TRAINING");
  });
});
