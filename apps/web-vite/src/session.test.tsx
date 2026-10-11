import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ACCOUNT_TERMS_2026_09_21 } from "@asisteam/core/browser";
import { legalDocument } from "../scripts/legal-document.mjs";
import { browserApi, requireSession, safeReturn } from "./api";
import { routes } from "./router";
import {
  forbiddenImport,
  publicEnvironment,
} from "../scripts/browser-boundary.mjs";
const id = "a1111111-1111-4111-8111-111111111111";
function mockApi({ accepted = true, authenticated = true, fail = false } = {}) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    if (fail) return new Response("{}", { status: 503 });
    if (path.endsWith("/auth/session"))
      return authenticated
        ? Response.json({ user_id: id, accepted })
        : Response.json(
            {
              error: {
                code: "authentication_required",
                message: "Inicia sesión",
                details: {},
              },
            },
            { status: 401 },
          );
    if (path.endsWith("/me/groups"))
      return Response.json({
        data: [
          {
            id,
            name: "Club sintético",
            sport: "Tenis",
            logo_url: null,
            roles: ["ATHLETE"],
          },
        ],
        pagination: { page: 1, page_size: 50, total: 1 },
      });
    return Response.json(
      { error: { code: "not_found", message: "No disponible", details: {} } },
      { status: 404 },
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
describe("sesión y navegación", () => {
  it("el aviso estático sin JS conserva todo el texto canónico", () => {
    const html = legalDocument(ACCOUNT_TERMS_2026_09_21);
    for (const text of Object.values(ACCOUNT_TERMS_2026_09_21))
      expect(html).toContain(text);
    expect(html).not.toContain("<script");
  });
  it("el loader privado redirige sin sesión y conserva solo destinos permitidos", async () => {
    mockApi({ authenticated: false });
    const response = await requireSession(
      new Request("http://localhost/groups/" + id),
    ).catch((error) => error);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/login?return_to=");
  });
  it("el consentimiento pendiente bloquea lecturas privadas", async () => {
    const fetch = mockApi({ accepted: false });
    const router = createMemoryRouter(routes, { initialEntries: ["/groups"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", {
      name: "Revisa las condiciones de uso y privacidad",
    });
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes("/me/groups")),
    ).toBe(false);
    router.dispose();
  });
  it("muestra DTO autorizado en grupos y elimina el contenido al expirar", async () => {
    mockApi();
    const router = createMemoryRouter(routes, { initialEntries: ["/groups"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("link", { name: "Club sintético" });
    expect(screen.getByText("Roles: Deportista")).toBeTruthy();
    mockApi({ authenticated: false });
    router.revalidate();
    await screen.findByRole("heading", { name: "Iniciar sesión" });
    expect(screen.queryByText("Club sintético")).toBeNull();
    router.dispose();
  });
  it("un fallo de transporte ofrece reintento y nunca aparece como vacío", async () => {
    mockApi({ fail: true });
    const router = createMemoryRouter(routes, { initialEntries: ["/groups"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "No pudimos cargar la página" });
    expect(screen.queryByText("Aún no perteneces a un grupo.")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Volver a cargar" }),
    ).toBeTruthy();
    router.dispose();
  });
  it("descarta destinos externos/query y permite rutas estables", () => {
    for (const target of [
      "https://evil.test",
      "//evil.test",
      "/groups?token=secret",
      "/groups/../../login",
      "/join?code=WEB21502&return_to=https://evil.test",
      "/invitations/invalid",
      "/groups/" + id + "?token=secret",
    ])
      expect(safeReturn(target)).toBe("/groups");
    expect(safeReturn("/groups/" + id)).toBe("/groups/" + id);
    expect(safeReturn("/groups/" + id + "/me/history")).toBe("/groups/" + id + "/me/history");
    expect(safeReturn("/join?code=WEB21502")).toBe("/join?code=WEB21502");
    expect(safeReturn("/invitations/" + "a".repeat(64))).toBe("/invitations/" + "a".repeat(64));
  });
  it("propaga cancelación al transporte cookie y mantiene no-store", async () => {
    const controller = new AbortController();
    let used: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => {
        used = init;
        return new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        );
      }),
    );
    const response = browserApi(controller.signal)
      .getWebSession()
      .catch((error) => error);
    controller.abort();
    await response;
    expect(used?.signal?.aborted).toBe(true);
    expect(used?.credentials).toBe("same-origin");
    expect(used?.cache).toBe("no-store");
  });
  it("prohíbe servidor/DB/Next y variables públicas desconocidas", () => {
    for (const id of [
      "next/link",
      "server-only",
      "node:crypto",
      "pg",
      "@asisteam/db",
      "/project/apps/api/src/config.ts",
    ])
      expect(forbiddenImport(id)).toBe(true);
    expect(() => publicEnvironment({ VITE_AUTH_SECRET: "private" })).toThrow();
    expect(publicEnvironment({ VITE_APP_NAME: "Asisteam" })).toBe("Asisteam");
  });
});
