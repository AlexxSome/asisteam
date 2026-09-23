import { expect, it } from "vitest";
import { groupSettingsChangeSchema, groupSettingsSchema } from "./group";
it("admite cambios parciales booleanos sin aceptar campos administrativos", () => {
  expect(groupSettingsSchema.parse({ athletes_can_view_group_stats: false, guardians_can_view_group_stats: false })).toBeTruthy();
  expect(groupSettingsChangeSchema.parse({ guardians_can_view_group_stats: true })).toEqual({ guardians_can_view_group_stats: true });
  for (const input of [{}, null, [], { athletes_can_view_group_stats: "false" }, { guardians_can_view_group_stats: null }, { settings_updated_by: "attacker" }, { athletes_can_view_group_stats: true, arbitrary: true }]) {
    expect(groupSettingsChangeSchema.safeParse(input).success).toBe(false);
  }
});
