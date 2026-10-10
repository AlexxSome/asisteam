import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
import { attendancePeriodFilterSchema, reportFilterSchema } from "@asisteam/core";
const mock=vi.hoisted(()=>({getGroup:vi.fn(),rpc:vi.fn(),getGroupAttendanceReport:vi.fn(),getGroupStats:vi.fn(),getMyAttendanceHistory:vi.fn(),getWardAttendanceHistory:vi.fn()}));
vi.mock("@/lib/groups",()=>({getGroup:mock.getGroup}));
vi.mock("@/lib/api/session",()=>({createSessionClient:async()=>({rpc:mock.rpc})}));
vi.mock("./server",()=>({createServerApiClient:()=>mock}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error('404');}}));
import {reportFixture} from "@/lib/reports.test-fixture";
import {historyFixture} from "@/lib/attendance-history.test-fixture";
import {getGroupAttendanceReport,getGroupStats} from "../reports";
import {getMyAttendanceHistory,getWardAttendanceHistory} from "../attendance-history";
const id='17000000-0000-4000-8000-000000000201', ward='17000000-0000-4000-8000-000000000202';
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('ASISTEAM_TRANSPORT_REPORTS','nest');mock.getGroup.mockResolvedValue({id,roles:['ADMIN','ATHLETE','GUARDIAN']});});
afterEach(()=>vi.unstubAllEnvs());
it('reporte envía rango, tipos CSV, inactivos, orden/página y conserva el DTO SQL',async()=>{
 const report=reportFixture;mock.getGroupAttendanceReport.mockResolvedValue(report);
 const filter=reportFilterSchema.parse({period:'custom',from:'2026-03-01',to:'2026-03-31',activity_type_ids:[id,ward],include_inactive:true,sort:'name',page:2});
 expect(await getGroupAttendanceReport(id,filter)).toEqual({report,error:null});
 expect(mock.getGroupAttendanceReport).toHaveBeenCalledWith({params:{groupId:id},query:{...filter,activity_type_ids:id+','+ward,page_size:50}});expect(mock.rpc).not.toHaveBeenCalled();
});
it('historial propio y pupilo mantienen filtros, IDs autorizados y tamaño de página',async()=>{
 const filter=attendancePeriodFilterSchema.parse({period:'season',page:3});const history={...historyFixture,totals:{...historyFixture.totals,attendance_pct:null}};
 mock.getMyAttendanceHistory.mockResolvedValue(history);mock.getWardAttendanceHistory.mockResolvedValue(history);
 expect(await getMyAttendanceHistory(id,filter,20)).toEqual({history,error:null});expect(await getWardAttendanceHistory(id,ward,filter,20)).toEqual({history,error:null});
 expect(mock.getMyAttendanceHistory).toHaveBeenCalledWith({params:{groupId:id},query:{...filter,activity_type_ids:'',page_size:20}});expect(mock.getWardAttendanceHistory).toHaveBeenCalledWith({params:{groupId:id,athleteUserId:ward},query:{...filter,activity_type_ids:'',page_size:20}});expect(mock.rpc).not.toHaveBeenCalled();
});
it('toggle revocado oculta stats, conserva historial y no oculta fallos de consentimiento',async()=>{
 const stats={group_id:id,members:[],page:2,page_size:30,totals:{athletes:0,convened:0,present:0,late:0,absent:0,excused:0,attendance_pct:null,late_rate:null}};
 mock.getGroupStats.mockResolvedValueOnce(stats).mockRejectedValueOnce(new ApiClientError(403,'group_stats_disabled')).mockRejectedValueOnce(new ApiClientError(403,'account_consent_required'));
 expect(await getGroupStats(id,2,30)).toEqual({report:stats,error:null});expect(mock.getGroupStats).toHaveBeenCalledWith({params:{groupId:id},query:{page:2,page_size:30}});
 expect(await getGroupStats(id)).toEqual({report:null,error:null});await expect(getGroupStats(id)).rejects.toMatchObject({status:403});expect(mock.rpc).not.toHaveBeenCalled();
});
it.each([401,403,404])('revocación%s produce404 sin consultar transporte anterior',async status=>{
 for(const [call,fn] of [[()=>getGroupAttendanceReport(id,reportFilterSchema.parse({})),mock.getGroupAttendanceReport],[()=>getMyAttendanceHistory(id,attendancePeriodFilterSchema.parse({})),mock.getMyAttendanceHistory],[()=>getWardAttendanceHistory(id,ward,attendancePeriodFilterSchema.parse({})),mock.getWardAttendanceHistory]] as const){fn.mockRejectedValue(new ApiClientError(status,'resource_not_found'));await expect(call()).rejects.toThrow('404');}expect(mock.rpc).not.toHaveBeenCalled();
});
it.each([400,503,504])('validación/fallo%s conserva error o lanza sin inventar cero ni hacer fallback',async status=>{
 mock.getGroupAttendanceReport.mockRejectedValue(new ApiClientError(status,'invalid_request'));mock.getMyAttendanceHistory.mockRejectedValue(new ApiClientError(status,'invalid_request'));
 if(status===400){expect(await getGroupAttendanceReport(id,reportFilterSchema.parse({}))).toMatchObject({report:null,error:expect.stringContaining('Revisa')});expect(await getMyAttendanceHistory(id,attendancePeriodFilterSchema.parse({}))).toMatchObject({history:null,error:expect.stringContaining('Revisa')});}
 else{await expect(getGroupAttendanceReport(id,reportFilterSchema.parse({}))).rejects.toMatchObject({status});await expect(getMyAttendanceHistory(id,attendancePeriodFilterSchema.parse({}))).rejects.toMatchObject({status});}
 expect(mock.rpc).not.toHaveBeenCalled();
});
