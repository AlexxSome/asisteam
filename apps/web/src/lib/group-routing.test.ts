// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroupSelector } from "@/app/groups/group-selector";
import { activeGroupCookie, isGroupId, switchedGroupPath } from "./group-routing";

const navigation = vi.hoisted(() => ({ pathname: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useRouter: () => ({ push: navigation.push }) }));

const a = "17000000-0000-4000-8000-000000000201";
const b = "17000000-0000-4000-8000-000000000202";
afterEach(cleanup);

describe("cambio de grupo", () => {
  it("mantiene la sección equivalente cuando el nuevo rol la admite", () => {
    expect(switchedGroupPath(`/groups/${a}/settings`, b, ["ADMIN", "ATHLETE"])).toBe(`/groups/${b}/settings`);
    expect(switchedGroupPath(`/groups/${a}`, b, ["ATHLETE"])).toBe(`/groups/${b}`);
  });
  it("abandona administración al cambiar a ATHLETE o GUARDIAN", () => {
    expect(switchedGroupPath(`/groups/${a}/settings`, b, ["ATHLETE"])).toBe(`/groups/${b}`);
    expect(switchedGroupPath(`/groups/${a}/settings/visibility`, b, ["GUARDIAN"])).toBe(`/groups/${b}`);
  });
  it("conserva historial propio solo cuando el nuevo grupo tiene rol ATHLETE", () => {
    expect(switchedGroupPath(`/groups/${a}/me/history`, b, ["ATHLETE", "ADMIN"])).toBe(`/groups/${b}/me/history`);
    expect(switchedGroupPath(`/groups/${a}/me/history`, b, ["GUARDIAN"])).toBe(`/groups/${b}`);
    expect(switchedGroupPath(`/groups/${a}/me/history`, b, ["ADMIN"])).toBe(`/groups/${b}`);
  });
  it("nunca arrastra IDs de recursos, querystrings o rutas arbitrarias", () => {
    for (const path of [`/groups/${a}/activities/private-id`, `/groups/${a}/members/private-id`, "/groups", `/groups/${a}/settings?private=id`]) {
      expect(switchedGroupPath(path, b, ["ADMIN"])).toBe(`/groups/${b}`);
    }
  });
  it("separa la preferencia entre cuentas del mismo navegador", () => {
    expect(activeGroupCookie(a)).not.toBe(activeGroupCookie(b));
  });
  it("rechaza segmentos que no son identificadores válidos", () => {
    expect(isGroupId(a)).toBe(true);
    for (const id of ["new", "invalid", `${a}/settings`, "../profile", ""]) expect(isGroupId(id)).toBe(false);
  });
  it("el selector navega A → B → A y guarda el grupo confirmado sin arrastrar capacidades", async () => {
    const user = userEvent.setup();
    const groups = [
      { id: a, name: "Equipo A", sport: null, logo_url: null, roles: ["ADMIN", "ATHLETE"] as const },
      { id: b, name: "Equipo B", sport: null, logo_url: null, roles: ["ATHLETE"] as const },
    ].map((group) => ({ ...group, roles: [...group.roles] }));
    const props = { groups, userId: "multi-group-user", guardianOnly: false };
    navigation.pathname = `/groups/${a}/me/history`;
    navigation.push.mockClear();
    const view = render(createElement(GroupSelector, { ...props, activeId: a }));
    expect(screen.getByRole("option", { name: "Equipo A — Administrador + Deportista" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Equipo B — Deportista" })).toBeTruthy();

    await user.selectOptions(screen.getByRole("combobox", { name: "Grupo activo" }), b);
    expect(navigation.push).toHaveBeenLastCalledWith(`/groups/${b}/me/history`);
    expect(document.cookie).toContain(`${activeGroupCookie(props.userId)}=${a}`);
    navigation.pathname = `/groups/${b}/me/history`;
    view.rerender(createElement(GroupSelector, { ...props, activeId: b }));
    expect(document.cookie).toContain(`${activeGroupCookie(props.userId)}=${b}`);

    await user.selectOptions(screen.getByRole("combobox", { name: "Grupo activo" }), a);
    expect(navigation.push).toHaveBeenLastCalledWith(`/groups/${a}/me/history`);
    navigation.pathname = `/groups/${a}/settings`;
    view.rerender(createElement(GroupSelector, { ...props, activeId: a }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Grupo activo" }), b);
    expect(navigation.push).toHaveBeenLastCalledWith(`/groups/${b}`);
  });
});
