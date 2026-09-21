import { describe, expect, it } from "vitest";
import { activeGroupCookie, isGroupId, switchedGroupPath } from "./group-routing";

const a = "17000000-0000-4000-8000-000000000201";
const b = "17000000-0000-4000-8000-000000000202";

describe("cambio de grupo", () => {
  it("mantiene la sección equivalente cuando el nuevo rol la admite", () => {
    expect(switchedGroupPath(`/groups/${a}/settings`, b, ["ADMIN", "ATHLETE"])).toBe(`/groups/${b}/settings`);
    expect(switchedGroupPath(`/groups/${a}`, b, ["ATHLETE"])).toBe(`/groups/${b}`);
  });
  it("abandona administración al cambiar a ATHLETE o GUARDIAN", () => {
    expect(switchedGroupPath(`/groups/${a}/settings`, b, ["ATHLETE"])).toBe(`/groups/${b}`);
    expect(switchedGroupPath(`/groups/${a}/settings/visibility`, b, ["GUARDIAN"])).toBe(`/groups/${b}`);
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
});
