import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ group: vi.fn(), range: vi.fn(), eq: vi.fn(), or: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mock.from }) }));
import { getActivityTypes } from "./activities";
const groupId = "29000000-0000-4000-8000-000000000201";
beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: () => query, eq: mock.eq, or: mock.or, order: () => query, range: mock.range };
  mock.eq.mockReturnValue(query); mock.or.mockReturnValue(query); mock.from.mockReturnValue(query);
  mock.range.mockResolvedValue({ data: [], error: null });
});
it("selector pide solo activos del grupo y sistema", async () => {
  await getActivityTypes(groupId);
  expect(mock.group).toHaveBeenCalledWith(groupId);
  expect(mock.eq).toHaveBeenCalledWith("is_active", true);
  expect(mock.or).toHaveBeenCalledWith(`group_id.is.null,group_id.eq.${groupId}`);
});
it("gestión incluye inactivos y pagina más allá de cien filas", async () => {
  const page = Array.from({ length: 100 }, (_, n) => ({ id: `type-${n}`, name: `Tipo ${n}`, group_id: groupId, color: "#123ABC", is_active: false }));
  mock.range.mockResolvedValueOnce({ data: page, error: null }).mockResolvedValueOnce({ data: [{ ...page[0], id: "last" }], error: null });
  expect(await getActivityTypes(groupId, true)).toHaveLength(101);
  expect(mock.eq).not.toHaveBeenCalled();
  expect(mock.range.mock.calls).toEqual([[0, 99], [100, 199]]);
});
