import { ApiClientError } from "@asisteam/api-client";
import { avatarContentType, avatarFileSchema, groupFormSchema, GROUP_ERROR_MESSAGES, profileSchema, httpSchemas, type OwnProfile, type ProfileInput } from "@asisteam/core/browser";
import { browserApi, actionMessage } from "./api";
// Session and SQL authorize each operation; there is no local mutation queue.
function groupError(error:unknown,fallback="transport_failed") { const code=error instanceof ApiClientError && error.status<500?error.error.code:fallback;return {error:{code,message:GROUP_ERROR_MESSAGES[code]??actionMessage(error),details:{} as Record<string,string[]|undefined>}}; }
export async function createGroup(input:unknown) {
 const parsed=groupFormSchema.safeParse(input); if(!parsed.success)return {error:{code:"invalid_group",message:"Revisa los campos indicados.",details:parsed.error.flatten().fieldErrors}};
 try{return {groupId:httpSchemas.GroupCreated.parse(await browserApi().createGroup({body:parsed.data})).group_id};}catch(error){return groupError(error,"group_create_failed");}
}
export async function updateGroup(groupId:string,input:unknown){
 if(!httpSchemas.GroupParams.safeParse({groupId}).success)return groupError(new Error("invalid"),"group_not_found");
 const parsed=groupFormSchema.safeParse(input);if(!parsed.success)return groupError(new Error("invalid"),"invalid_group");
 try{return httpSchemas.Success.parse(await browserApi().updateGroup({params:{groupId},body:parsed.data}));}catch(error){return groupError(error,"group_update_failed");}
}
export async function rotateInviteCode(groupId:string){
 if(!httpSchemas.GroupParams.safeParse({groupId}).success)return groupError(new Error("invalid"),"group_not_found");
 try{return httpSchemas.InviteCode.parse(await browserApi().rotateInviteCode({params:{groupId}}));}catch(error){return groupError(error,"invite_code_unavailable");}
}
export async function updateGroupSettings(groupId:string,body:unknown){
 if(!httpSchemas.GroupParams.safeParse({groupId}).success)return groupError(new Error("invalid"),"group_not_found");
 const parsed=httpSchemas.GroupSettingsChange.safeParse(body);if(!parsed.success)return groupError(new Error("invalid"),"invalid_group_settings");
 try{return httpSchemas.GroupSettings.parse(await browserApi().updateGroupSettings({params:{groupId},body:parsed.data}));}catch(error){return groupError(error,"group_settings_update_failed");}
}
export async function joinAsAthlete(groupId:string){
 if(!httpSchemas.GroupParams.safeParse({groupId}).success)return groupError(new Error("invalid"),"group_not_found");
 try{return httpSchemas.Success.parse(await browserApi().joinAsAthlete({params:{groupId}}));}catch(error){return groupError(error,"membership_create_failed");}
}
export type ProfileResult = {ok:true;message:string;profile?:OwnProfile}|{ok:false;message:string};
const profileError=(error:unknown):ProfileResult=>({ok:false,message:actionMessage(error)});
export async function saveProfile(input:ProfileInput):Promise<ProfileResult>{
 const parsed=profileSchema.safeParse(input);if(!parsed.success)return {ok:false,message:parsed.error.issues[0]?.message??"Revisa los datos del perfil."};
 try{const result=await browserApi().updateOwnProfile({body:parsed.data});return {ok:true,profile:result.profile,message:result.birthdate_change_pending?"Nombre y teléfono guardados. La nueva fecha queda pendiente de un ADMIN de cada grupo; conservamos tu fecha actual hasta la última confirmación.":"Tu perfil se actualizó en todos tus grupos."};}catch(error){return profileError(error);}
}
export async function uploadAvatar(form:FormData):Promise<ProfileResult>{
 const file=form.get("avatar");if(!(file instanceof File))return {ok:false,message:"Selecciona una imagen."};
 const parsed=avatarFileSchema.safeParse({type:file.type,size:file.size});if(!parsed.success)return {ok:false,message:parsed.error.issues[0]?.message??"Imagen inválida."};
 const bytes=new Uint8Array(await file.arrayBuffer()),type=avatarContentType(bytes);
 if(type!==file.type || !type)return {ok:false,message:"El contenido no corresponde a una imagen JPEG, PNG o WebP válida."};
 let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
 try{await browserApi().uploadAvatar({body:{type,content_base64:btoa(binary)}});return {ok:true,message:"Tu foto de perfil se actualizó."};}catch(error){return profileError(error);}
}
export async function setAvatarPermission(guardianshipId:string,allow:boolean):Promise<ProfileResult>{try{await browserApi().setAvatarPermission({params:{guardianshipId},body:{allow}});return {ok:true,message:allow?"Autorización de imagen registrada.":"Permiso de imagen retirado. Si no existe otra autorización vigente, su foto dejará de estar disponible."};}catch(error){return profileError(error);}}
export async function reviewBirthdate(requestId:string,groupId:string,approve:boolean):Promise<ProfileResult>{if(!httpSchemas.ReviewParams.safeParse({requestId}).success||!httpSchemas.ReviewBirthdate.safeParse({group_id:groupId,approve}).success)return {ok:false,message:"Revisa los datos de la solicitud."};try{const data=await browserApi().reviewBirthdate({params:{requestId},body:{group_id:groupId,approve}});return {ok:true,message:data.status==="APPLIED"?"Todos los grupos confirmaron. Se aplicó la fecha y se desactivaron los vínculos de apoderados.":data.status==="REJECTED"?"Solicitud rechazada. La fecha original se conserva.":"Confirmación guardada. Falta la aprobación de otros grupos."};}catch(error){return profileError(error);}}
