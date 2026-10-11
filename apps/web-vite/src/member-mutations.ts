import { ApiClientError } from "@asisteam/api-client";
import {
  activationReviewSchema, coachAssignmentSchema, guardianshipSchema,
  managedActivationSchema, managedConsentSchema, managedMemberSchema,
  managedMemberUpdateSchema, memberStatusSchema, membershipReviewSchema,
  sendInvitationRequestSchema, MEMBER_MANAGEMENT_ERRORS, MANAGED_MEMBER_ERROR_MESSAGES,
  MEMBERSHIP_REVIEW_ERROR_MESSAGES, GUARDIANSHIP_ERROR_MESSAGES, SEND_INVITATION_ERROR_MESSAGES,
  type ManagedMemberResult, type SentInvitation,
} from "@asisteam/core/browser";
import { browserApi } from "./api";

type Failure = { error: { code: string; message: string; details: Record<string, string[] | undefined> } };
export type MemberResult = { success: true; birthdatePending?: boolean; consentPending?: boolean } | Failure;
export type CreateManagedMemberResult = { member: ManagedMemberResult; guardianInvitation?: "sent" | "retry_required" } | Failure;
export type CreateGuardianshipResult = { guardianshipId: string; invitation: "sent" | "retry_required" } | Failure;
export type SendInvitationResult = { invitation: SentInvitation } | Failure;
const uncertain = "No pudimos confirmar el resultado. Actualiza la lista y comprueba el estado antes de volver a enviarlo. No repitas el alta ni el vínculo.";
function failure(error: unknown, messages: Record<string,string>, invalid?: string): Failure {
  const code = invalid ?? (error instanceof ApiClientError ? error.error.code : "transport_failed");
  return { error: { code, message: invalid ? messages[code] ?? "Revisa los campos indicados." : error instanceof ApiClientError && ![502,503,504].includes(error.status) ? messages[code] ?? error.message : uncertain, details: {} } };
}
// Each write is sent once. SQL/Native services own roles, invariants, limits and
// durable idempotency. A confirmed first step is retained if email is uncertain.
export async function sendInvitation(input: unknown): Promise<SendInvitationResult> {
  const parsed = sendInvitationRequestSchema.safeParse(input);
  if (!parsed.success) return failure(null, SEND_INVITATION_ERROR_MESSAGES, "invalid_invitation");
  try { return await browserApi().sendInvitation({body:parsed.data}); }
  catch(error) { return failure(error,SEND_INVITATION_ERROR_MESSAGES); }
}
export async function createManagedMember(groupId:string,input:unknown):Promise<CreateManagedMemberResult> {
  const parsed=managedMemberSchema.safeParse(input);
  if(!parsed.success)return failure(null,MANAGED_MEMBER_ERROR_MESSAGES,"invalid_managed_member");
  try {
    const member=await browserApi().createManagedMember({params:{groupId},body:parsed.data});
    if(!parsed.data.guardian)return {member};
    const sent=await sendInvitation({action:"send",group_id:groupId,email:parsed.data.guardian.email,role:"GUARDIAN"});
    return {member,guardianInvitation:"error" in sent?"retry_required":"sent"};
  } catch(error){return failure(error,MANAGED_MEMBER_ERROR_MESSAGES);}
}
export async function createGuardianship(groupId:string,input:unknown):Promise<CreateGuardianshipResult> {
  const parsed=guardianshipSchema.safeParse(input);
  if(!parsed.success)return failure(null,GUARDIANSHIP_ERROR_MESSAGES,"invalid_guardianship");
  try {
    const result=await browserApi().createGuardianship({params:{groupId},body:parsed.data});
    const sent=await sendInvitation({action:"send",group_id:groupId,email:parsed.data.email,role:"GUARDIAN"});
    return {guardianshipId:result.guardianship_id,invitation:"error" in sent?"retry_required":"sent"};
  }catch(error){return failure(error,GUARDIANSHIP_ERROR_MESSAGES);}
}
export async function changeMemberStatus(input:unknown):Promise<MemberResult>{
  const parsed=memberStatusSchema.safeParse(input);if(!parsed.success)return failure(null,MEMBER_MANAGEMENT_ERRORS,"invalid_member_request");
  const {group_id:groupId,membership_id:membershipId,action}=parsed.data;
  try{await browserApi()[action==="deactivate"?"deactivateMembership":"reactivateMembership"]({params:{groupId,membershipId}});return {success:true};}catch(error){return failure(error,MEMBER_MANAGEMENT_ERRORS);}
}
export async function assignMemberCoach(input:unknown):Promise<MemberResult>{
  const parsed=coachAssignmentSchema.safeParse(input);if(!parsed.success)return failure(null,MEMBER_MANAGEMENT_ERRORS,"invalid_member_request");
  try{await browserApi().assignMemberCoach({params:{groupId:parsed.data.group_id,membershipId:parsed.data.membership_id}});return {success:true};}catch(error){return failure(error,MEMBER_MANAGEMENT_ERRORS);}
}
export async function updateManagedMember(input:unknown):Promise<MemberResult>{
  const parsed=managedMemberUpdateSchema.safeParse(input);if(!parsed.success)return failure(null,MEMBER_MANAGEMENT_ERRORS,"invalid_managed_member");
  try{const result=await browserApi().updateManagedMember({params:{groupId:parsed.data.group_id,membershipId:parsed.data.membership_id},body:parsed.data.profile});return {success:true,birthdatePending:result.status==="BIRTHDATE_PENDING"};}catch(error){return failure(error,MEMBER_MANAGEMENT_ERRORS);}
}
export async function requestManagedActivation(input:unknown):Promise<MemberResult>{
  const parsed=managedActivationSchema.safeParse(input);if(!parsed.success)return failure(null,MEMBER_MANAGEMENT_ERRORS,"invalid_activation_request");
  try{const result=await browserApi().requestManagedActivation({params:{groupId:parsed.data.group_id,membershipId:parsed.data.membership_id}});
    if(result.status==="CONSENT_PENDING")return {success:true,consentPending:true};
    const sent=await sendInvitation({action:"activate",...parsed.data});return "error" in sent?sent:{success:true};
  }catch(error){return failure(error,MEMBER_MANAGEMENT_ERRORS);}
}
export async function reviewMembership(input:unknown):Promise<MemberResult>{
  const parsed=membershipReviewSchema.safeParse(input);if(!parsed.success)return failure(null,MEMBERSHIP_REVIEW_ERROR_MESSAGES,"invalid_membership_review");
  try{await browserApi()[parsed.data.decision==="approve"?"approveMembership":"rejectMembership"]({params:{groupId:parsed.data.group_id,membershipId:parsed.data.membership_id}});return {success:true};}catch(error){return failure(error,MEMBERSHIP_REVIEW_ERROR_MESSAGES);}
}
export async function consentManagedMember(input:unknown):Promise<{success:true;membershipStatus:"ACTIVE"|"PENDING"}|Failure>{
  const parsed=managedConsentSchema.safeParse(input);if(!parsed.success)return failure(null,MANAGED_MEMBER_ERROR_MESSAGES,"consent_required");
  try{const result=await browserApi().consentMembershipData({params:{membershipId:parsed.data.membership_id},body:{accepted:parsed.data.accepted}});return {success:true,membershipStatus:result.status};}catch(error){return failure(error,MANAGED_MEMBER_ERROR_MESSAGES);}
}
export async function reviewManagedActivation(input:unknown):Promise<{success:true}|(Failure & {approvalRecorded?:true})>{
  const parsed=activationReviewSchema.safeParse(input);if(!parsed.success)return failure(null,MEMBER_MANAGEMENT_ERRORS,"invalid_activation_request");
  let approvalRecorded=false;
  try {
    const identity=await browserApi().reviewManagedActivation({params:{requestId:parsed.data.request_id},body:{accepted:parsed.data.accepted}});
    approvalRecorded=parsed.data.accepted;
    if(!approvalRecorded)return {success:true};
    const sent=await sendInvitation({action:"activate",...identity});
    if("error" in sent)return {...sent,approvalRecorded:true,error:{...sent.error,message:`La autorización quedó registrada. ${sent.error.message} Revisa Invitaciones antes de reenviar.`}};
    return {success:true};
  }catch(error){return {...failure(error,MEMBER_MANAGEMENT_ERRORS),...(approvalRecorded?{approvalRecorded:true as const}:{})};}
}
