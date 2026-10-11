import { httpSchemas } from "@asisteam/core/browser";
import { browserApi,requireSession,sessionError } from "./api";
export async function guardianTasks(request:Request,groupId:string,athleteUserId:string){
 const api=browserApi(request.signal),memberships=[];let consents=0;
 for(let page=1;;page++){
  const rows=(await api.listMembershipOnboarding({query:{group_id:groupId,as_guardian:true,athlete_user_id:athleteUserId,page}})).data;
  memberships.push(...rows);consents+=rows.filter(row=>row.can_consent).length;
  if(page*50>=(rows[0]?.total_count??0))break;
 }
 const activations=await api.listManagedActivations({params:{groupId},query:{page:1,athlete_user_id:athleteUserId}});
 return {consents,activations:activations.data[0]?.total_count??0,memberships};
}
export async function wardsData(request:Request){
 await requireSession(request);
 const value=new URL(request.url).searchParams.get("page"),page=value?Number(value):1;
 if(!Number.isInteger(page)||page<1||page>500000)throw new Response(null,{status:404});
 try {
  const api=browserApi(request.signal),offset=(page-1)*10,result=await api.listMyWards({query:{page:Math.floor(offset/50)+1}}),start=offset%50;
  const wards=result.data.slice(start,start+10),hasNext=result.has_next||result.data.length>start+10;
  const summaries=new Map(await Promise.all(wards.map(async ward=>{
   const active=ward.groups.filter(group=>group.membership_status==="ACTIVE");
   const agenda=active.length?await api.getHomeActivities({query:{group_ids:active.map(group=>group.group_id).join(",")}}):{next:null,previous:null,now:new Date().toISOString()};
   const groups=await Promise.all(ward.groups.slice(0,3).map(async group=>{
    const [history,tasks]=await Promise.all([group.membership_status==="ACTIVE"?api.getWardAttendanceHistory({params:{groupId:group.group_id,athleteUserId:ward.athlete_user_id},query:{period:"month",page:1,page_size:1,activity_type_ids:""}}):null,guardianTasks(request,group.group_id,ward.athlete_user_id)]);
    return {group,attendance:history?{history:{period:history.period,totals:history.totals}}:null,tasks};
   }));return [ward.athlete_user_id,{agenda,groups}] as const;
  })));
  return {page,wards,hasNext,summaries};
 }catch(error){return sessionError(error,request);}
}
export async function wardData(request:Request,athleteUserId:string|undefined){
 await requireSession(request);
 const params=httpSchemas.WardParams.safeParse({athleteUserId}),query=new URL(request.url).searchParams;
 const filter=httpSchemas.GroupActivityQuery.safeParse({page:query.get("page")?Number(query.get("page")):1,period:query.get("period")??"upcoming"});
 if(!params.success||!filter.success)throw new Response(null,{status:404});
 try{
  const api=browserApi(request.signal),ward=await api.getWard({params:params.data}),active=ward.groups.filter(group=>group.membership_status==="ACTIVE");
  const result=active.length?await api.listActivities({query:{group_ids:active.map(group=>group.group_id).join(","),...filter.data}}):{activities:[],hasNext:false};
  const names=new Map(ward.groups.map(group=>[group.group_id,group.name]));
  const tasks=new Map(await Promise.all(ward.groups.map(async group=>[group.group_id,await guardianTasks(request,group.group_id,ward.athlete_user_id)] as const)));
  return {...filter.data,ward,activities:result.activities.map(activity=>({...activity,group_name:names.get(activity.group_id)??""})),hasNext:result.hasNext,tasks};
 }catch(error){return sessionError(error,request);}
}
