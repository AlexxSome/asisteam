import { ApiClientError } from "@asisteam/api-client";
import { httpSchemas,attendancePeriodFilterSchema,reportFilterSchema,canManageAttendance,type AttendancePeriodFilter,type ReportFilter } from "@asisteam/core/browser";
import { browserApi,sessionError } from "./api";
import { groupData } from "./group-data";
import { allTypes,queryObject } from "./activity-data";
export function parseFilters(request:Request,personal=false){
 const query=queryObject(request),ids=query.activity_type_id;
 const input={period:query.period,from:query.period==="season"?undefined:query.from||undefined,to:query.period==="custom"?query.to||undefined:undefined,activity_type_ids:ids?Array.isArray(ids)?ids:[ids]:[],page:query.page??1,...(personal?{}:{include_inactive:query.include_inactive==="true",sort:query.sort})};
 // Reject repeated scalar fields rather than letting coercion silently accept them.
 if(["period","from","to","page","sort","include_inactive"].some(key=>Array.isArray(query[key])))return (personal?attendancePeriodFilterSchema:reportFilterSchema).safeParse({period:"invalid"});
 return (personal?attendancePeriodFilterSchema:reportFilterSchema).safeParse(input);
}
export function historyPageHref(groupId:string,filter:AttendancePeriodFilter,page=1,athleteUserId?:string){
 const query=new URLSearchParams({period:filter.period,page:String(page)});
 if(filter.period!=="season"&&filter.from)query.set("from",filter.from);if(filter.period==="custom"&&filter.to)query.set("to",filter.to);
 for(const id of filter.activity_type_ids)query.append("activity_type_id",id);
 return `/groups/${groupId}/${athleteUserId?`wards/${athleteUserId}`:"me"}/history?${query}`;
}
export function reportPageHref(groupId:string,filter:ReportFilter,page:number){
 const query=new URLSearchParams(historyPageHref(groupId,filter,page).split("?")[1]);query.set("sort",filter.sort);if(filter.include_inactive)query.set("include_inactive","true");return `/groups/${groupId}/reports?${query}`;
}
const invalid="Revisa los filtros: usa fechas válidas, un rango ordenado y tipos de actividad del grupo.";
function historyQuery(filter:AttendancePeriodFilter){return {...filter,activity_type_ids:filter.activity_type_ids.join(","),page_size:50};}
async function filterResult<T>(load:()=>Promise<T>){try{return {value:await load(),error:null};}catch(error){if(error instanceof ApiClientError&&error.status===400)return {value:null,error:invalid};throw error;}}
export async function historyData(request:Request,groupId:string|undefined,athleteUserId?:string){
 const group=await groupData(request,groupId),ward=athleteUserId!==undefined;
 if(!(group.roles.includes(ward?"GUARDIAN":"ATHLETE")))throw new Response(null,{status:404});
 if(ward&&!httpSchemas.WardHistoryParams.safeParse({groupId:group.id,athleteUserId}).success)throw new Response(null,{status:404});
 const parsed=parseFilters(request,true),filter=parsed.success?parsed.data:attendancePeriodFilterSchema.parse({});
 try{
 const api=browserApi(request.signal),types=await allTypes(request,group.id,true);
 const result=parsed.success?await filterResult(()=>ward?api.getWardAttendanceHistory({params:{groupId:group.id,athleteUserId},query:historyQuery(filter)}):api.getMyAttendanceHistory({params:{groupId:group.id},query:historyQuery(filter)})):{value:null,error:invalid};
 return {group,filter,types,history:result.value,error:result.error,athleteUserId};
 }catch(error){return sessionError(error,request);}
}
async function statsData(request:Request,group:Awaited<ReturnType<typeof groupData>>){
 const api=browserApi(request.signal),query=new URL(request.url).searchParams,page=Number(query.get("page")??1),wardPage=Number(query.get("ward_page")??1);
 if(![page,wardPage].every(value=>Number.isInteger(value)&&value>=1&&value<=1000000)||query.getAll("page").length>1||query.getAll("ward_page").length>1)throw new Response(null,{status:400});
 const season={period:"season" as const,activity_type_ids:"",page:1,page_size:1};
 const [result,personal,wardRows]=await Promise.all([
 (async()=>{try{return {report:await api.getGroupStats({params:{groupId:group.id},query:{page,page_size:50}}),error:null};}catch(error){if(error instanceof ApiClientError&&error.status===403&&error.error.code==="group_stats_disabled")return {report:null,error:null};throw error;}})(),
 group.roles.includes("ATHLETE")?api.getMyAttendanceHistory({params:{groupId:group.id},query:season}):null,
 group.roles.includes("GUARDIAN")?api.listMyWards({query:{group_id:group.id,page:wardPage}}):null,
 ]);
 const wardReports=await Promise.all((wardRows?.data??[]).map(async ward=>({...ward,history:await api.getWardAttendanceHistory({params:{groupId:group.id,athleteUserId:ward.athlete_user_id},query:season}),error:null})));
 return {kind:"stats" as const,group,result,personal:personal?{history:{totals:personal.totals},error:null}:null,wards:wardRows?{wards:wardRows.data,hasNext:wardRows.has_next}:null,wardReports,page,wardPage};
}
export type StatsData=Awaited<ReturnType<typeof statsData>>;
export async function reportData(request:Request,groupId:string|undefined){
 const group=await groupData(request,groupId);
 try{
 if(!canManageAttendance(group.roles))return await statsData(request,group);
 const parsed=parseFilters(request),filter=parsed.success?reportFilterSchema.parse(parsed.data):reportFilterSchema.parse({}),types=await allTypes(request,group.id,true);
 const result=parsed.success?await filterResult(()=>browserApi(request.signal).getGroupAttendanceReport({params:{groupId:group.id},query:{...historyQuery(filter),include_inactive:filter.include_inactive,sort:filter.sort}})):{value:null,error:invalid};
 return {kind:"report" as const,group,filter,types,result:{report:result.value,error:result.error}};
 }catch(error){return sessionError(error,request);}
}
