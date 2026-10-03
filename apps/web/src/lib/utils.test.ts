import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("roles tipográficos en componentes compartidos", () => {
  it.each(["display", "h1", "h2", "h3", "body", "small", "caption", "label"])(
    "conserva el tamaño %s al combinarlo con un color",
    (role) => {
      expect(cn(`text-${role}`, "text-primary-foreground")).toBe(`text-${role} text-primary-foreground`);
      expect(cn("text-neutral", `text-${role}`)).toBe(`text-neutral text-${role}`);
    },
  );
  it("permite reemplazar tamaño o color sin eliminar el otro", () => {
    expect(cn("text-h2 text-foreground", "text-h1 text-info")).toBe("text-h1 text-info");
    expect(cn("text-label text-primary-foreground", "text-lg")).toBe("text-primary-foreground text-lg");
  });
});
