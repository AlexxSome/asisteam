import "server-only";
import { ApiClientError, type ApiClient } from "@asisteam/api-client";
import { moduleTransport } from "@/lib/api/config";
import { createServerApiClient } from "@/lib/api/server";
/** INVITATIONS selects the sole executor, including MANAGED credential requests. */
export async function invitationOperation<L,N>(legacy:()=>PromiseLike<{data:L|null;error:{code:string;message:string}|null}>,nest:(api:ApiClient)=>Promise<N|null>){
  if(moduleTransport("invitations")==="supabase")return legacy();
  try{return {data:await nest(createServerApiClient()),error:null};}
  catch(error){if(!(error instanceof ApiClientError))throw error;return {data:null,error:{code:`PT${error.status}`,message:error.error.code}};}
}
