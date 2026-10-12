import { httpSchemas } from "@asisteam/core/browser";
import { browserApi } from "./api";
export function queryObject(request:Request):Record<string,string|string[]|undefined>{
 const query=new URL(request.url).searchParams;
 return Object.fromEntries(Array.from(new Set(query.keys()),key=>[key,query.getAll(key).length>1?query.getAll(key):query.get(key)??undefined]));
}
export async function allTypes(request:Request,groupId:string,includeInactive=false){
 const api=browserApi(request.signal),types=[];
 for(let page=1;;page++){const result=await api.listActivityTypes({params:{groupId},query:{page,include_inactive:includeInactive}});types.push(...result.data);if(!result.hasNext)return types;}
}
export async function activityData(request:Request,groupId:string,activityId:string|undefined){
 const parsed=httpSchemas.ActivityParams.safeParse({groupId,activityId});
 if(!parsed.success)throw new Response(null,{status:404});
 return browserApi(request.signal).getActivity({params:parsed.data});
}
