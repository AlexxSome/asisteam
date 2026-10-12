import { beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), operation: vi.fn(), revalidate: vi.fn(), send: vi.fn() }));
vi.mock("./api", () => ({ browserApi:()=>({
  updateManagedMember:(request:unknown)=>mock.operation("updateManagedMember",request),
  deactivateMembership:(request:unknown)=>mock.operation("deactivateMembership",request),
  reactivateMembership:(request:unknown)=>mock.operation("reactivateMembership",request),
  requestManagedActivation:(request:unknown)=>mock.operation("requestManagedActivation",request),sendInvitation:mock.send,
  assignMemberCoach:(request:unknown)=>mock.operation("assignMemberCoach",request),
}) }));
import { assignMemberCoach, changeMemberStatus, requestManagedActivation, updateManagedMember } from "./member-mutations";
const identity = { group_id: "34000000-0000-4000-8000-000000000201", membership_id: "34000000-0000-4000-8000-000000000301" };
const profile = { full_name: "Persona gestionada", birthdate: "1990-01-01", email: "", phone: null };
beforeEach(() => {
  vi.resetAllMocks(); mock.getUser.mockResolvedValue({ data: { user: { id: "verified" } } });
  mock.operation.mockResolvedValue({status:"UPDATED"});
});
it("rechaza privilegios inyectados y ausencia de sesión antes de la RPC", async () => {
  expect(await updateManagedMember({ ...identity, profile: { ...profile, account_status: "ACTIVE" } })).toHaveProperty("error.code", "invalid_managed_member");
  expect(await changeMemberStatus({ ...identity, action: "approve" })).toHaveProperty("error.code", "invalid_member_request");
  mock.operation.mockRejectedValue(new ApiClientError(401,"authentication_required"));
  expect(await updateManagedMember({ ...identity, profile })).toHaveProperty("error.code", "authentication_required");
  expect(await changeMemberStatus({ ...identity, action: "deactivate" })).toHaveProperty("error.code", "authentication_required");
  expect(mock.operation).toHaveBeenCalledTimes(2);
});
it.each([["deactivate", "deactivateMembership"], ["reactivate", "reactivateMembership"]])("%s incluye ambos IDs y actualiza nómina/reportes", async (action, rpc) => {
  expect(await changeMemberStatus({ ...identity, action })).toEqual({ success: true });
  expect(mock.operation).toHaveBeenCalledWith(rpc,{params:{groupId:identity.group_id,membershipId:identity.membership_id}});
});
it("edita solo datos básicos y comunica aprobación de fecha pendiente", async () => {
  mock.operation.mockResolvedValue({status:"BIRTHDATE_PENDING"});
  expect(await updateManagedMember({ ...identity, profile })).toEqual({ success: true, birthdatePending: true });
  expect(mock.operation).toHaveBeenCalledWith("updateManagedMember",{params:{groupId:identity.group_id,membershipId:identity.membership_id},body:{full_name:profile.full_name,birthdate:profile.birthdate,email:"",phone:null}});
});
it.each(["LAST_ADMIN", "membership_status_changed", "minor_requires_guardian_consent", "group_member_limit", "managed_profile_required"])("propaga %s sin éxito ni invalidación", async code => {
  mock.operation.mockRejectedValue(new ApiClientError(422,code));
  expect(await changeMemberStatus({ ...identity, action: "deactivate" })).toHaveProperty("error.code", code);
});
it("oculta errores internos y de red", async () => {
  mock.operation.mockRejectedValue(new ApiClientError(500,"private@example.test"));
  expect(await updateManagedMember({ ...identity, profile })).toHaveProperty("error.code", "unavailable");
  mock.operation.mockRejectedValue(new Error("network"));
  expect(await changeMemberStatus({ ...identity, action: "reactivate" })).toHaveProperty("error.code", "unavailable");
});
it("no envía enlace hasta que la RPC autoriza la activación", async () => {
  mock.operation.mockResolvedValue({status:"CONSENT_PENDING"});
  expect(await requestManagedActivation(identity)).toEqual({ success: true, consentPending: true });
  expect(mock.send).not.toHaveBeenCalled();
  mock.operation.mockResolvedValue({status:"READY"});
  mock.send.mockResolvedValue({ invitation: {} });
  expect(await requestManagedActivation(identity)).toEqual({ success: true });
  expect(mock.send).toHaveBeenCalledWith({body:{ action: "activate", ...identity }});
});
it("no permite reemplazar email/rol y conserva fallos de envío", async () => {
  expect(await requestManagedActivation({ ...identity, email: "other@example.test" })).toHaveProperty("error.code", "invalid_activation_request");
  expect(mock.operation).not.toHaveBeenCalled();
  mock.operation.mockResolvedValue({status:"READY"});
  mock.send.mockResolvedValue({ error: { code: "email_delivery_failed", message: "Puedes reenviar", details: {} } });
  expect(await requestManagedActivation(identity)).toHaveProperty("error.code", "email_delivery_failed");
});

it("asigna COACH vía RPC e invalida vistas; no acepta privilegios del cliente", async () => {
  expect(await assignMemberCoach({ ...identity, role: "ADMIN" })).toHaveProperty("error.code", "invalid_member_request");
  expect(mock.operation).not.toHaveBeenCalled();
  expect(await assignMemberCoach(identity)).toEqual({ success: true });
  expect(mock.operation).toHaveBeenCalledWith("assignMemberCoach",{params:{groupId:identity.group_id,membershipId:identity.membership_id}});
});
it("asignar COACH exige sesión y propaga denegación/capacidad", async () => {
  mock.operation.mockRejectedValue(new ApiClientError(401,"authentication_required"));
  expect(await assignMemberCoach(identity)).toHaveProperty("error.code", "authentication_required");
  expect(mock.operation).toHaveBeenCalledTimes(1);
  mock.getUser.mockResolvedValue({ data: { user: { id: "verified" } } });
  for (const code of ["admin_required", "group_member_limit", "membership_status_changed"]) {
    mock.operation.mockRejectedValue(new ApiClientError(422,code));
    expect(await assignMemberCoach(identity)).toHaveProperty("error.code", code);
  }
});
