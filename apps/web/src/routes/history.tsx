import { useLoaderData,type LoaderFunctionArgs } from "react-router";
import { Page,ActionLink } from "../ui";
import { historyData } from "../report-data";
import { ReportFilters } from "../components/report-filters";
import { PageHeader } from "../components/ui/page-header";
import { AttendanceHistoryContent } from "../components/attendance-history";
export const loader=({request,params}:LoaderFunctionArgs)=>historyData(request,params.groupId,params.athleteUserId);
export function Component(){
 const {group,filter,types,history,error,athleteUserId}=useLoaderData<typeof loader>(),ward=Boolean(athleteUserId);
 const filters=<ReportFilters key={`${group.id}:${athleteUserId??"me"}:${JSON.stringify(filter)}`} groupId={group.id} filter={filter} types={types} personal athleteUserId={athleteUserId}/>;
 return <Page className="max-w-7xl px-0 py-0 md:px-0">{ward&&<ActionLink href={`/wards/${athleteUserId}`}>Volver al perfil del pupilo</ActionLink>}<PageHeader title={ward?"Historial de asistencia del pupilo":"Mi historial de asistencia"} description={`${history?`${history.full_name} · `:""}${group.name}`} />
 {error&&<p role="alert" className="rounded-md border border-destructive p-4">{error}</p>}{history?<AttendanceHistoryContent history={history} filter={filter} filters={filters} athleteUserId={athleteUserId}/>:filters}</Page>;
}
