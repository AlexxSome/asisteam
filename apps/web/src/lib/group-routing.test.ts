// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroupSelector } from "@/app/groups/group-selector";
import { activeGroupCookie, activityReturnLink, activityReturnQuery, isGroupId, switchedGroupPath } from "./group-routing";

const navigation = vi.hoisted(() => ({ pathname: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useRouter: () => ({ push: navigation.push }) }));

const a = "17000000-0000-4000-8000-000000000201";
const b = "17000000-0000-4000-8000-000000000202";
afterEach(cleanup);

describe("regreso desde una actividad", () => {
  it("mantiene el origen de grupo entre detalle y edición con parámetros permitidos", () => {
    const query = { from: "group", period: "past", page: "3" };
    expect(activityReturnLink(a, query).href).toBe(`/groups/${a}/activities?period=past&page=3`);
    expect(activityReturnQuery(query)).toBe("?from=group&period=past&page=3");
    expect(activityReturnQuery({ from: "wards", ward: "../other" })).toBe("");
    expect(activityReturnQuery({ from: "https://example.test" })).toBe("");
  });
  it("conserva agenda, período y página de origen sin trasladarlos al cambiar grupo", () => {
    expect(activityReturnLink(a, { from: "agenda", period: "past", page: "2" }).href).toBe("/groups?period=past&page=2#agenda");
    expect(activityReturnLink(a, { from: "wards", ward: b, period: "past", page: "3" }).href).toBe(`/wards/${b}?period=past&page=3#agenda`);
    expect(switchedGroupPath(`/groups/${a}/activities/resource?from=wards&ward=${b}&period=past&page=3`, b, ["GUARDIAN"])).toBe(`/groups/${b}/activities`);
  });
  it("mantiene deep links y rechaza destinos externos, IDs y filtros inválidos", () => {
    for (const query of [undefined, { from: "https://other.test" }, { from: ["agenda"] }, { from: "wards", ward: "../profile" }]) {
      expect(activityReturnLink(a, query).href).toBe(`/groups/${a}/activities`);
    }
    expect(activityReturnLink(a, { from: "agenda", page: "-1", period: ["past"] }).href).toBe("/groups?period=upcoming#agenda");
  });
});

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
  it("conserva listas y reportes, descartando IDs y filtros del grupo anterior", () => {
    for (const roles of [["ADMIN"], ["ATHLETE"], ["GUARDIAN"], ["COACH"]] as const) {
      expect(switchedGroupPath(`/groups/${a}/activities/private-id/attendance?date=old`, b, [...roles])).toBe(`/groups/${b}/activities`);
      expect(switchedGroupPath(`/groups/${a}/reports?membership_id=private&page=4`, b, [...roles])).toBe(`/groups/${b}/reports`);
      expect(switchedGroupPath(`/groups/${a}/announcements/private-id`, b, [...roles])).toBe(`/groups/${b}/announcements`);
    }
    expect(switchedGroupPath(`/groups/${a}/members/private-id`, b, ["ADMIN"])).toBe(`/groups/${b}/members`);
    expect(switchedGroupPath(`/groups/${a}/wards/private-id/history`, b, ["GUARDIAN"])).toBe(`/groups/${b}/reports`);
    expect(switchedGroupPath(`/groups/${a}/settings?private=id`, b, ["ADMIN"])).toBe(`/groups/${b}/settings`);
  });
  it("nunca arrastra rutas arbitrarias o permisos ajenos", () => {
    for (const path of ["/groups", `/groups/${a}/unknown`, "/groups/new/activities", "https://other.test/groups/id"]) {
      expect(switchedGroupPath(path, b, ["ADMIN"])).toBe(`/groups/${b}`);
    }
    for (const roles of [["ATHLETE"], ["GUARDIAN"], ["COACH"]] as const) {
      for (const section of ["settings", "settings/visibility", "members", "members/pending", "guardians", "invitations/new", "billing", "activity-types"]) {
        expect(switchedGroupPath(`/groups/${a}/${section}`, b, [...roles])).toBe(`/groups/${b}`);
      }
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
