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
  updateGroup(input: { params: operations["updateGroup"]["parameters"]["path"]; body: operations["updateGroup"]["requestBody"]["content"]["application/json"] }): Promise<operations["updateGroup"]["responses"][200]["content"]["application/json"]> {
    return this.execute("updateGroup", input ?? {});
  }
  updateGroupSettings(input: { params: operations["updateGroupSettings"]["parameters"]["path"]; body: operations["updateGroupSettings"]["requestBody"]["content"]["application/json"] }): Promise<operations["updateGroupSettings"]["responses"][200]["content"]["application/json"]> {
    return this.execute("updateGroupSettings", input ?? {});
  }
  rotateInviteCode(input: { params: operations["rotateInviteCode"]["parameters"]["path"] }): Promise<operations["rotateInviteCode"]["responses"][201]["content"]["application/json"]> {
    return this.execute("rotateInviteCode", input ?? {});
  }
  joinAsAthlete(input: { params: operations["joinAsAthlete"]["parameters"]["path"] }): Promise<operations["joinAsAthlete"]["responses"][201]["content"]["application/json"]> {
    return this.execute("joinAsAthlete", input ?? {});
  }
  joinByCode(input: { body: operations["joinByCode"]["requestBody"]["content"]["application/json"] }): Promise<operations["joinByCode"]["responses"][201]["content"]["application/json"]> {
    return this.execute("joinByCode", input ?? {});
  }
  getProfileContext(): Promise<operations["getProfileContext"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getProfileContext", {});
  }
  listBirthdateReviews(): Promise<operations["listBirthdateReviews"]["responses"][200]["content"]["application/json"]> {
    return this.execute("listBirthdateReviews", {});
  }
  reviewBirthdate(input: { params: operations["reviewBirthdate"]["parameters"]["path"]; body: operations["reviewBirthdate"]["requestBody"]["content"]["application/json"] }): Promise<operations["reviewBirthdate"]["responses"][201]["content"]["application/json"]> {
    return this.execute("reviewBirthdate", input ?? {});
  }
  setAvatarPermission(input: { params: operations["setAvatarPermission"]["parameters"]["path"]; body: operations["setAvatarPermission"]["requestBody"]["content"]["application/json"] }): Promise<operations["setAvatarPermission"]["responses"][200]["content"]["application/json"]> {
    return this.execute("setAvatarPermission", input ?? {});
  }
  getOwnProfile(): Promise<operations["getOwnProfile"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getOwnProfile", {});
  }
  updateOwnProfile(input: { body: operations["updateOwnProfile"]["requestBody"]["content"]["application/json"] }): Promise<operations["updateOwnProfile"]["responses"][200]["content"]["application/json"]> {
    return this.execute("updateOwnProfile", input ?? {});
  }
}
