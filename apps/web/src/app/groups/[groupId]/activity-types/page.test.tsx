import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mock = vi.hoisted(() => ({ group: vi.fn(), types: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/activities", () => ({ getActivityTypes: mock.types }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("403"); } }));
vi.mock("./activity-type-form", () => ({ ActivityTypeForm: ({ activityType }: { activityType?: { name: string } }) => <form aria-label={activityType?.name ?? "Crear"} /> }));
import Page from "./page";
const groupId = "29000000-0000-4000-8000-000000000201";
beforeEach(() => { vi.resetAllMocks(); mock.group.mockResolvedValue({ id: groupId, roles: ["ADMIN"] }); });
it("incluye personalizados inactivos, traduce sistemas y solo permite editar propios", async () => {
  mock.types.mockResolvedValue([
    { id: "system", name: "TRAINING", group_id: null, is_active: true },
    { id: "custom", name: "Amistoso", group_id: groupId, is_active: false },
  ]);
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ groupId }) }));
  expect(mock.types).toHaveBeenCalledWith(groupId, true);
  expect(html).toContain("Entrenamiento"); expect(html).toContain("Desactivado");
  expect(html).toContain('aria-label="Amistoso"');
  expect(html).not.toContain('aria-label="TRAINING"');
});
it.each(["ATHLETE", "GUARDIAN"])("deniega gestión a %s antes de leer tipos", async (role) => {
  mock.group.mockResolvedValue({ id: groupId, roles: [role] });
  await expect(Page({ params: Promise.resolve({ groupId }) })).rejects.toThrow("403");
  expect(mock.types).not.toHaveBeenCalled();
});
