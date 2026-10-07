// Generado desde OpenAPI y core. Ejecuta pnpm api:generate; no editar.
import type { operations } from "./openapi.js";
import { ApiTransport } from "./transport.js";
export class ApiClient extends ApiTransport {
  getSession(): Promise<operations["getSession"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getSession", {});
  }
  health(): Promise<operations["health"]["responses"][200]["content"]["application/json"]> {
    return this.execute("health", {});
  }
  ready(): Promise<operations["ready"]["responses"][200]["content"]["application/json"]> {
    return this.execute("ready", {});
  }
  listMyGroups(input?: { query?: operations["listMyGroups"]["parameters"]["query"] }): Promise<operations["listMyGroups"]["responses"][200]["content"]["application/json"]> {
    return this.execute("listMyGroups", input ?? {});
  }
  getGroup(input: { params: operations["getGroup"]["parameters"]["path"] }): Promise<operations["getGroup"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getGroup", input ?? {});
  }
  createGroup(input: { body: operations["createGroup"]["requestBody"]["content"]["application/json"] }): Promise<operations["createGroup"]["responses"][201]["content"]["application/json"]> {
    return this.execute("createGroup", input ?? {});
  }
  getOwnProfile(): Promise<operations["getOwnProfile"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getOwnProfile", {});
  }
  updateOwnProfile(input: { body: operations["updateOwnProfile"]["requestBody"]["content"]["application/json"] }): Promise<operations["updateOwnProfile"]["responses"][200]["content"]["application/json"]> {
    return this.execute("updateOwnProfile", input ?? {});
  }
}
