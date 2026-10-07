// Generado desde OpenAPI y core. Ejecuta pnpm api:generate; no editar.
import type { operations } from "./openapi.js";
import { ApiTransport } from "./transport.js";
export class ApiClient extends ApiTransport {
  listGroupMembers(input: { params: operations["listGroupMembers"]["parameters"]["path"]; query?: operations["listGroupMembers"]["parameters"]["query"] }): Promise<operations["listGroupMembers"]["responses"][200]["content"]["application/json"]> {
    return this.execute("listGroupMembers", input ?? {});
  }
  createManagedMember(input: { params: operations["createManagedMember"]["parameters"]["path"]; body: operations["createManagedMember"]["requestBody"]["content"]["application/json"] }): Promise<operations["createManagedMember"]["responses"][201]["content"]["application/json"]> {
    return this.execute("createManagedMember", input ?? {});
  }
  updateManagedMember(input: { params: operations["updateManagedMember"]["parameters"]["path"]; body: operations["updateManagedMember"]["requestBody"]["content"]["application/json"] }): Promise<operations["updateManagedMember"]["responses"][200]["content"]["application/json"]> {
    return this.execute("updateManagedMember", input ?? {});
  }
  approveMembership(input: { params: operations["approveMembership"]["parameters"]["path"] }): Promise<operations["approveMembership"]["responses"][201]["content"]["application/json"]> {
    return this.execute("approveMembership", input ?? {});
  }
  rejectMembership(input: { params: operations["rejectMembership"]["parameters"]["path"] }): Promise<operations["rejectMembership"]["responses"][201]["content"]["application/json"]> {
    return this.execute("rejectMembership", input ?? {});
  }
  deactivateMembership(input: { params: operations["deactivateMembership"]["parameters"]["path"] }): Promise<operations["deactivateMembership"]["responses"][201]["content"]["application/json"]> {
    return this.execute("deactivateMembership", input ?? {});
  }
  reactivateMembership(input: { params: operations["reactivateMembership"]["parameters"]["path"] }): Promise<operations["reactivateMembership"]["responses"][201]["content"]["application/json"]> {
    return this.execute("reactivateMembership", input ?? {});
  }
  assignMemberCoach(input: { params: operations["assignMemberCoach"]["parameters"]["path"] }): Promise<operations["assignMemberCoach"]["responses"][201]["content"]["application/json"]> {
    return this.execute("assignMemberCoach", input ?? {});
  }
  listMembershipOnboarding(input?: { query?: operations["listMembershipOnboarding"]["parameters"]["query"] }): Promise<operations["listMembershipOnboarding"]["responses"][200]["content"]["application/json"]> {
    return this.execute("listMembershipOnboarding", input ?? {});
  }
  consentMembershipData(input: { params: operations["consentMembershipData"]["parameters"]["path"]; body: operations["consentMembershipData"]["requestBody"]["content"]["application/json"] }): Promise<operations["consentMembershipData"]["responses"][201]["content"]["application/json"]> {
    return this.execute("consentMembershipData", input ?? {});
  }
  createGuardianship(input: { params: operations["createGuardianship"]["parameters"]["path"]; body: operations["createGuardianship"]["requestBody"]["content"]["application/json"] }): Promise<operations["createGuardianship"]["responses"][201]["content"]["application/json"]> {
    return this.execute("createGuardianship", input ?? {});
  }
  listGuardianshipAthletes(input: { params: operations["listGuardianshipAthletes"]["parameters"]["path"]; query?: operations["listGuardianshipAthletes"]["parameters"]["query"] }): Promise<operations["listGuardianshipAthletes"]["responses"][200]["content"]["application/json"]> {
    return this.execute("listGuardianshipAthletes", input ?? {});
  }
  getPendingSummary(input: { params: operations["getPendingSummary"]["parameters"]["path"] }): Promise<operations["getPendingSummary"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getPendingSummary", input ?? {});
  }
  getCurrentAccountConsent(): Promise<operations["getCurrentAccountConsent"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getCurrentAccountConsent", {});
  }
  acceptAccountTerms(input: { body: operations["acceptAccountTerms"]["requestBody"]["content"]["application/json"] }): Promise<operations["acceptAccountTerms"]["responses"][201]["content"]["application/json"]> {
    return this.execute("acceptAccountTerms", input ?? {});
  }
  listMyWards(input?: { query?: operations["listMyWards"]["parameters"]["query"] }): Promise<operations["listMyWards"]["responses"][200]["content"]["application/json"]> {
    return this.execute("listMyWards", input ?? {});
  }
  getWard(input: { params: operations["getWard"]["parameters"]["path"] }): Promise<operations["getWard"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getWard", input ?? {});
  }
  sendInvitation(input: { body: operations["sendInvitation"]["requestBody"]["content"]["application/json"] }): Promise<operations["sendInvitation"]["responses"][201]["content"]["application/json"]> {
    return this.execute("sendInvitation", input ?? {});
  }
  previewInvitation(input: { body: operations["previewInvitation"]["requestBody"]["content"]["application/json"] }): Promise<operations["previewInvitation"]["responses"][200]["content"]["application/json"]> {
    return this.execute("previewInvitation", input ?? {});
  }
  acceptInvitation(input: { body: operations["acceptInvitation"]["requestBody"]["content"]["application/json"] }): Promise<operations["acceptInvitation"]["responses"][200]["content"]["application/json"]> {
    return this.execute("acceptInvitation", input ?? {});
  }
  registerInvitation(input: { body: operations["registerInvitation"]["requestBody"]["content"]["application/json"] }): Promise<operations["registerInvitation"]["responses"][200]["content"]["application/json"]> {
    return this.execute("registerInvitation", input ?? {});
  }
  claimInvitation(input: { body: operations["claimInvitation"]["requestBody"]["content"]["application/json"] }): Promise<operations["claimInvitation"]["responses"][200]["content"]["application/json"]> {
    return this.execute("claimInvitation", input ?? {});
  }
  listInvitations(input: { params: operations["listInvitations"]["parameters"]["path"]; query?: operations["listInvitations"]["parameters"]["query"] }): Promise<operations["listInvitations"]["responses"][200]["content"]["application/json"]> {
    return this.execute("listInvitations", input ?? {});
  }
  requestManagedActivation(input: { params: operations["requestManagedActivation"]["parameters"]["path"] }): Promise<operations["requestManagedActivation"]["responses"][201]["content"]["application/json"]> {
    return this.execute("requestManagedActivation", input ?? {});
  }
  reviewManagedActivation(input: { params: operations["reviewManagedActivation"]["parameters"]["path"]; body: operations["reviewManagedActivation"]["requestBody"]["content"]["application/json"] }): Promise<operations["reviewManagedActivation"]["responses"][201]["content"]["application/json"]> {
    return this.execute("reviewManagedActivation", input ?? {});
  }
  listManagedActivations(input: { params: operations["listManagedActivations"]["parameters"]["path"]; query?: operations["listManagedActivations"]["parameters"]["query"] }): Promise<operations["listManagedActivations"]["responses"][200]["content"]["application/json"]> {
    return this.execute("listManagedActivations", input ?? {});
  }
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
