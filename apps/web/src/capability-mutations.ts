export { manageSubscription } from "./billing-mutations";
export { publishAnnouncement, updateAnnouncement, deleteAnnouncement, setAnnouncementPush } from "./announcement-mutations";
import { ApiClientError } from "@asisteam/api-client";
import { CHECKIN_ERROR_MESSAGES, checkinInputSchema, qrCheckinSettingsSchema, httpSchemas } from "@asisteam/core/browser";
import { browserApi } from "./api";
function failure(error:unknown) {
 const code=error instanceof ApiClientError && Object.hasOwn(CHECKIN_ERROR_MESSAGES,error.error.code)?error.error.code:"checkin_failed";
 return {error:{code,message:CHECKIN_ERROR_MESSAGES[code]!,details:{}}};
}
export async function issueCheckinQr(activityId:string) {
 if(!httpSchemas.CheckinActivityParams.safeParse({activityId}).success)return failure(new ApiClientError(404,"activity_not_found"));
 try{return {qr:httpSchemas.CheckinQr.parse(await browserApi().issueCheckinQr({params:{activityId}}))};}catch(error){return failure(error);}
}
export async function saveQrSettings(groupId:string,input:unknown) {
 const parsed=qrCheckinSettingsSchema.safeParse(input);
 if(!parsed.success)return failure(new ApiClientError(400,"invalid_qr_settings"));
 try{return {settings:await browserApi().setQrSettings({params:{groupId},body:parsed.data})};}catch(error){return failure(error);}
}
export async function redeemCheckin(input:unknown) {
 const parsed=checkinInputSchema.safeParse(input);
 if(!parsed.success)return failure(new ApiClientError(422,"checkin_qr_expired"));
 try{return {receipt:httpSchemas.CheckinReceipt.parse(await browserApi().selfCheckin({body:parsed.data}))};}catch(error){return failure(error);}
}

export async function loadQrSettings(groupId:string){
 if(!httpSchemas.GroupParams.safeParse({groupId}).success)return failure(new ApiClientError(404,"group_not_found"));
 try{return {settings:httpSchemas.QrSettings.parse(await browserApi().getQrSettings({params:{groupId}}))};}catch(error){return failure(error);}
}
