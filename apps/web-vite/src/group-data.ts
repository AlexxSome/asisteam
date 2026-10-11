import { httpSchemas } from "@asisteam/core/browser";
import { browserApi, requireSession, sessionError } from "./api";
export type MyGroup = Awaited<ReturnType<ReturnType<typeof browserApi>["listMyGroups"]>>["data"][number];
export async function groupData(request:Request, groupId:string|undefined, admin=false) {
 await requireSession(request);
 const parsed=httpSchemas.GroupParams.safeParse({groupId});
 if(!parsed.success) throw new Response(null,{status:404});
 try {
  const group=await browserApi(request.signal).getGroup({params:parsed.data});
  if(admin && group.access!=="admin") throw new Response(null,{status:403});
  return group;
 } catch(error) { return sessionError(error,request); }
}
