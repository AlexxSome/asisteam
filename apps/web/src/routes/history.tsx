import { useLoaderData,type LoaderFunctionArgs } from "react-router";
import { Page,ActionLink } from "../ui";
import { historyData } from "../report-data";
import { ReportFilters } from "../components/report-filters";
import { AttendanceHistoryContent } from "../components/attendance-history";
export const loader=({request,params}:LoaderFunctionArgs)=>historyData(request,params.groupId,params.athleteUserId);
export function Component(){
 const {group,filter,types,history,error,athleteUserId}=useLoaderData<typeof loader>(),ward=Boolean(athleteUserId);
 const filters=<ReportFilters key={`${group.id}:${athleteUserId??"me"}:${JSON.stringify(filter)}`} groupId={group.id} filter={filter} types={types} personal athleteUserId={athleteUserId}/>;
 return <Page>{ward&&<ActionLink href={`/wards/${athleteUserId}`}>Volver al perfil del pupilo</ActionLink>}<header><h1 className="text-h1">{ward?"Historial de asistencia del pupilo":"Mi historial de asistencia"}</h1><p className="mt-2 text-muted-foreground">{history&&`${history.full_name} · `}{group.name}</p></header>
 {error&&<p role="alert" className="rounded-md border border-destructive p-4">{error}</p>}{history?<AttendanceHistoryContent history={history} filter={filter} filters={filters} athleteUserId={athleteUserId}/>:filters}</Page>;
}
