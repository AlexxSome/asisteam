// Generado desde OpenAPI y core. Ejecuta pnpm api:generate; no editar.
import type { operations } from "./openapi.js";
import { ApiTransport } from "./transport.js";
export class ApiClient extends ApiTransport {
  getSocialProviders(): Promise<operations["getSocialProviders"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getSocialProviders", {});
  }
  startSocialLogin(input: { body: operations["startSocialLogin"]["requestBody"]["content"]["application/json"] }): Promise<operations["startSocialLogin"]["responses"][200]["content"]["application/json"]> {
    return this.execute("startSocialLogin", input ?? {});
  }
  startSocialLink(input: { body: operations["startSocialLink"]["requestBody"]["content"]["application/json"] }): Promise<operations["startSocialLink"]["responses"][200]["content"]["application/json"]> {
    return this.execute("startSocialLink", input ?? {});
  }
  completeSocialLogin(input: { body: operations["completeSocialLogin"]["requestBody"]["content"]["application/json"] }): Promise<operations["completeSocialLogin"]["responses"][200]["content"]["application/json"]> {
    return this.execute("completeSocialLogin", input ?? {});
  }
  loginPassword(input: { body: operations["loginPassword"]["requestBody"]["content"]["application/json"] }): Promise<operations["loginPassword"]["responses"][200]["content"]["application/json"]> {
    return this.execute("loginPassword", input ?? {});
  }
  registerPassword(input: { body: operations["registerPassword"]["requestBody"]["content"]["application/json"] }): Promise<operations["registerPassword"]["responses"][200]["content"]["application/json"]> {
    return this.execute("registerPassword", input ?? {});
  }
  requestRecovery(input: { body: operations["requestRecovery"]["requestBody"]["content"]["application/json"] }): Promise<operations["requestRecovery"]["responses"][200]["content"]["application/json"]> {
    return this.execute("requestRecovery", input ?? {});
  }
  resetPassword(input: { body: operations["resetPassword"]["requestBody"]["content"]["application/json"] }): Promise<operations["resetPassword"]["responses"][200]["content"]["application/json"]> {
    return this.execute("resetPassword", input ?? {});
  }
  refreshSession(input: { body: operations["refreshSession"]["requestBody"]["content"]["application/json"] }): Promise<operations["refreshSession"]["responses"][200]["content"]["application/json"]> {
    return this.execute("refreshSession", input ?? {});
  }
  logoutSession(): Promise<operations["logoutSession"]["responses"][200]["content"]["application/json"]> {
    return this.execute("logoutSession", {});
  }
  changePassword(input: { body: operations["changePassword"]["requestBody"]["content"]["application/json"] }): Promise<operations["changePassword"]["responses"][200]["content"]["application/json"]> {
    return this.execute("changePassword", input ?? {});
  }
  getQrSettings(input: { params: operations["getQrSettings"]["parameters"]["path"] }): Promise<operations["getQrSettings"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getQrSettings", input ?? {});
  }
  setQrSettings(input: { params: operations["setQrSettings"]["parameters"]["path"]; body: operations["setQrSettings"]["requestBody"]["content"]["application/json"] }): Promise<operations["setQrSettings"]["responses"][200]["content"]["application/json"]> {
    return this.execute("setQrSettings", input ?? {});
  }
  issueCheckinQr(input: { params: operations["issueCheckinQr"]["parameters"]["path"] }): Promise<operations["issueCheckinQr"]["responses"][200]["content"]["application/json"]> {
    return this.execute("issueCheckinQr", input ?? {});
  }
  selfCheckin(input: { body: operations["selfCheckin"]["requestBody"]["content"]["application/json"] }): Promise<operations["selfCheckin"]["responses"][200]["content"]["application/json"]> {
    return this.execute("selfCheckin", input ?? {});
  }
  getAnnouncements(input: { params: operations["getAnnouncements"]["parameters"]["path"]; query?: operations["getAnnouncements"]["parameters"]["query"] }): Promise<operations["getAnnouncements"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getAnnouncements", input ?? {});
  }
  publishAnnouncement(input: { params: operations["publishAnnouncement"]["parameters"]["path"]; body: operations["publishAnnouncement"]["requestBody"]["content"]["application/json"] }): Promise<operations["publishAnnouncement"]["responses"][200]["content"]["application/json"]> {
    return this.execute("publishAnnouncement", input ?? {});
  }
  updateAnnouncement(input: { params: operations["updateAnnouncement"]["parameters"]["path"]; body: operations["updateAnnouncement"]["requestBody"]["content"]["application/json"] }): Promise<operations["updateAnnouncement"]["responses"][200]["content"]["application/json"]> {
    return this.execute("updateAnnouncement", input ?? {});
  }
  deleteAnnouncement(input: { params: operations["deleteAnnouncement"]["parameters"]["path"]; body: operations["deleteAnnouncement"]["requestBody"]["content"]["application/json"] }): Promise<operations["deleteAnnouncement"]["responses"][200]["content"]["application/json"]> {
    return this.execute("deleteAnnouncement", input ?? {});
  }
  getAnnouncementPush(): Promise<operations["getAnnouncementPush"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getAnnouncementPush", {});
  }
  setAnnouncementPush(input: { body: operations["setAnnouncementPush"]["requestBody"]["content"]["application/json"] }): Promise<operations["setAnnouncementPush"]["responses"][200]["content"]["application/json"]> {
    return this.execute("setAnnouncementPush", input ?? {});
  }
  registerAnnouncementToken(input: { body: operations["registerAnnouncementToken"]["requestBody"]["content"]["application/json"] }): Promise<operations["registerAnnouncementToken"]["responses"][200]["content"]["application/json"]> {
    return this.execute("registerAnnouncementToken", input ?? {});
  }
  unregisterAnnouncementToken(input: { body: operations["unregisterAnnouncementToken"]["requestBody"]["content"]["application/json"] }): Promise<operations["unregisterAnnouncementToken"]["responses"][200]["content"]["application/json"]> {
    return this.execute("unregisterAnnouncementToken", input ?? {});
  }
  getGroupBilling(input: { params: operations["getGroupBilling"]["parameters"]["path"]; query?: operations["getGroupBilling"]["parameters"]["query"] }): Promise<operations["getGroupBilling"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getGroupBilling", input ?? {});
  }
  manageSubscription(input: { body: operations["manageSubscription"]["requestBody"]["content"]["application/json"] }): Promise<operations["manageSubscription"]["responses"][200]["content"]["application/json"]> {
    return this.execute("manageSubscription", input ?? {});
  }
  listGroupActivities(input: { params: operations["listGroupActivities"]["parameters"]["path"]; query?: operations["listGroupActivities"]["parameters"]["query"] }): Promise<operations["listGroupActivities"]["responses"][200]["content"]["application/json"]> {
    return this.execute("listGroupActivities", input ?? {});
  }
  listActivities(input?: { query?: operations["listActivities"]["parameters"]["query"] }): Promise<operations["listActivities"]["responses"][200]["content"]["application/json"]> {
    return this.execute("listActivities", input ?? {});
  }
  getHomeActivities(input?: { query?: operations["getHomeActivities"]["parameters"]["query"] }): Promise<operations["getHomeActivities"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getHomeActivities", input ?? {});
  }
  getActivity(input: { params: operations["getActivity"]["parameters"]["path"] }): Promise<operations["getActivity"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getActivity", input ?? {});
  }
  createActivity(input: { params: operations["createActivity"]["parameters"]["path"]; body: operations["createActivity"]["requestBody"]["content"]["application/json"] }): Promise<operations["createActivity"]["responses"][201]["content"]["application/json"]> {
    return this.execute("createActivity", input ?? {});
  }
  updateActivity(input: { params: operations["updateActivity"]["parameters"]["path"]; body: operations["updateActivity"]["requestBody"]["content"]["application/json"] }): Promise<operations["updateActivity"]["responses"][200]["content"]["application/json"]> {
    return this.execute("updateActivity", input ?? {});
  }
  deleteActivity(input: { params: operations["deleteActivity"]["parameters"]["path"]; body: operations["deleteActivity"]["requestBody"]["content"]["application/json"] }): Promise<operations["deleteActivity"]["responses"][200]["content"]["application/json"]> {
    return this.execute("deleteActivity", input ?? {});
  }
  listActivityTypes(input: { params: operations["listActivityTypes"]["parameters"]["path"]; query?: operations["listActivityTypes"]["parameters"]["query"] }): Promise<operations["listActivityTypes"]["responses"][200]["content"]["application/json"]> {
    return this.execute("listActivityTypes", input ?? {});
  }
  createActivityType(input: { params: operations["createActivityType"]["parameters"]["path"]; body: operations["createActivityType"]["requestBody"]["content"]["application/json"] }): Promise<operations["createActivityType"]["responses"][201]["content"]["application/json"]> {
    return this.execute("createActivityType", input ?? {});
  }
  updateActivityType(input: { params: operations["updateActivityType"]["parameters"]["path"]; body: operations["updateActivityType"]["requestBody"]["content"]["application/json"] }): Promise<operations["updateActivityType"]["responses"][200]["content"]["application/json"]> {
    return this.execute("updateActivityType", input ?? {});
  }
  getAttendanceRoster(input: { params: operations["getAttendanceRoster"]["parameters"]["path"]; query?: operations["getAttendanceRoster"]["parameters"]["query"] }): Promise<operations["getAttendanceRoster"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getAttendanceRoster", input ?? {});
  }
  saveAttendance(input: { params: operations["saveAttendance"]["parameters"]["path"]; body: operations["saveAttendance"]["requestBody"]["content"]["application/json"] }): Promise<operations["saveAttendance"]["responses"][200]["content"]["application/json"]> {
    return this.execute("saveAttendance", input ?? {});
  }
  updateAttendance(input: { params: operations["updateAttendance"]["parameters"]["path"]; body: operations["updateAttendance"]["requestBody"]["content"]["application/json"] }): Promise<operations["updateAttendance"]["responses"][200]["content"]["application/json"]> {
    return this.execute("updateAttendance", input ?? {});
  }
  clearAttendance(input: { params: operations["clearAttendance"]["parameters"]["path"] }): Promise<operations["clearAttendance"]["responses"][200]["content"]["application/json"]> {
    return this.execute("clearAttendance", input ?? {});
  }
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
  uploadAvatar(input: { body: operations["uploadAvatar"]["requestBody"]["content"]["application/json"] }): Promise<operations["uploadAvatar"]["responses"][201]["content"]["application/json"]> {
    return this.execute("uploadAvatar", input ?? {});
  }
  getAvatar(input: { params: operations["getAvatar"]["parameters"]["path"] }): Promise<operations["getAvatar"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getAvatar", input ?? {});
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
  getMyAttendanceHistory(input: { params: operations["getMyAttendanceHistory"]["parameters"]["path"]; query?: operations["getMyAttendanceHistory"]["parameters"]["query"] }): Promise<operations["getMyAttendanceHistory"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getMyAttendanceHistory", input ?? {});
  }
  getWardAttendanceHistory(input: { params: operations["getWardAttendanceHistory"]["parameters"]["path"]; query?: operations["getWardAttendanceHistory"]["parameters"]["query"] }): Promise<operations["getWardAttendanceHistory"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getWardAttendanceHistory", input ?? {});
  }
  getGroupAttendanceReport(input: { params: operations["getGroupAttendanceReport"]["parameters"]["path"]; query?: operations["getGroupAttendanceReport"]["parameters"]["query"] }): Promise<operations["getGroupAttendanceReport"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getGroupAttendanceReport", input ?? {});
  }
  getGroupStats(input: { params: operations["getGroupStats"]["parameters"]["path"]; query?: operations["getGroupStats"]["parameters"]["query"] }): Promise<operations["getGroupStats"]["responses"][200]["content"]["application/json"]> {
    return this.execute("getGroupStats", input ?? {});
  }
}
