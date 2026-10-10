// Fixture result types allow SQL-shaped internal assertions without importing a
// provider SDK. Product transport DTOs remain validated by Nest/httpSchemas.
export interface FixtureResult<T=any> { data: T; error: {message:string;code?:string} | null; status: number }
export class NativePersistenceClient {
 auth: {signInWithPassword(input:unknown):Promise<any>;signUp(input:unknown):Promise<any>;getSession():Promise<any>;getUser(token?:string):Promise<any>};
 fixtureAccount(input:unknown):Promise<any>;
 operation(name:string,args?:Record<string,unknown>):Promise<FixtureResult>;
 sqlFunction(name:string,args?:Record<string,unknown>):Promise<FixtureResult>;
 sqlTable(table:string):FixtureQuery;
 http(path:string,body?:unknown,method?:string):Promise<FixtureResult>;
}
export function createNativeClient(origin:string,key:string,options?:unknown):NativePersistenceClient;
export function nativeIntegrationConfig():Promise<{API_ORIGIN:string;GUEST_TOKEN:string;OPERATOR_TOKEN:string}>;
export function nativeSql(query:string):string;
export function nativeInvitationRequest(body:unknown,token:string|undefined,ip:string,proxy:string):Promise<Response>;
export function syntheticEmailTransport(send:typeof fetch):void;

export function createNativeSendInvitationHandler(options:{sendEmail:typeof fetch;[key:string]:unknown}): (request:Request)=>Promise<Response>;
export function createNativeBillingHandler(options:any): (request:Request)=>Promise<Response>;
export function nativeAnnouncementTick(send:typeof fetch):Promise<Response>;
export function registerNativeInvitation(token:string,registration:Record<string,unknown>,claim?:boolean):Promise<any>;

interface FixtureRow { [column:string]:any }
interface FixtureQuery extends PromiseLike<FixtureResult<FixtureRow[]>> {
 select(columns:string):FixtureQuery;eq(column:string,value:unknown):FixtureQuery;neq(column:string,value:unknown):FixtureQuery;
 in(column:string,values:unknown[]):FixtureQuery;gte(column:string,value:unknown):FixtureQuery;is(column:string,value:unknown):FixtureQuery;or(expression:string):FixtureQuery;order(column:string,options?:{ascending?:boolean}):FixtureQuery;
 limit(count:number):FixtureQuery;range(from:number,to:number):FixtureQuery;
 insert(data:Record<string,unknown>):FixtureQuery;update(data:Record<string,unknown>):FixtureQuery;delete():FixtureQuery;
 single():Promise<FixtureResult<FixtureRow>>;maybeSingle():Promise<FixtureResult<FixtureRow>>;
}

export function attachNativeIntegrationConfig(runtime:any):void;
export function closeNativeIntegration():Promise<void>;
