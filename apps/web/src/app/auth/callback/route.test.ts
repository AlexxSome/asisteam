import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ApiClientError} from "@asisteam/api-client";
import {checkinPath} from "@asisteam/core";
const mock=vi.hoisted(()=>({get:vi.fn(),set:vi.fn(),complete:vi.fn(),consent:vi.fn(),tokens:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:mock.get,set:mock.set})}));
vi.mock("@/lib/api/native-auth",()=>({nativeAuthClient:async()=>({completeSocialLogin:mock.complete,getCurrentAccountConsent:mock.consent}),setNativeCookies:mock.tokens}));
import {completeSocialCallback,SOCIAL_TRANSACTION_COOKIE} from "@/lib/api/social-auth";
import {SOCIAL_CONTEXT_COOKIE} from "@/lib/social-auth";
import {GET} from "@/app/auth/callback/route";
const tokens={access_token:"native-access",refresh_token:"a".repeat(64),expires_in:900};
const callback=(query="code=valid&state=bound")=>completeSocialCallback(new Request(`https://asisteam.example/auth/callback/google?${query}`),"google");
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv("ASISTEAM_SITE_URL","https://asisteam.example");
 mock.get.mockImplementation((name:string)=>({value:name===SOCIAL_TRANSACTION_COOKIE?"encrypted-transaction":"{}"}));
 mock.complete.mockResolvedValue({tokens,context:{},linked:false});mock.consent.mockResolvedValue({accepted:true});
});
afterEach(()=>vi.unstubAllEnvs());
describe("retorno OAuth nativo",()=>{
 it("usa la identidad verificada por API, sin escrituras de perfil ni next ajeno",async()=>{
  const response=await callback("code=valid&state=bound&next=https://evil.example");
  expect(response.status).toBe(303);expect(response.headers.get("Location")).toBe("https://asisteam.example/welcome");
  expect(mock.complete).toHaveBeenCalledExactlyOnceWith({body:{provider:"google",code:"valid",state:"bound",transaction:"encrypted-transaction"}});
  expect(mock.tokens).toHaveBeenCalledExactlyOnceWith(tokens);
  expect(response.headers.get("Cache-Control")).toContain("no-store");expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(mock.set).toHaveBeenCalledWith(SOCIAL_TRANSACTION_COOKIE,"",expect.objectContaining({path:"/auth/callback/google",maxAge:0}));
 });
 it("conserva código de grupo validado por transacción API",async()=>{
  mock.complete.mockResolvedValue({tokens,context:{invite_code:"ABCD1234"},linked:false});
  expect((await callback()).headers.get("Location")).toBe("https://asisteam.example/join?code=ABCD1234");
 });
 it("devuelve QR en fragmento sin poner token en query",async()=>{
  const checkin={activity_id:"58000000-0000-4000-8000-000000000501",token:"a".repeat(64)};
  mock.complete.mockResolvedValue({tokens,context:{checkin},linked:false});
  const location=(await callback()).headers.get("Location")!;
  expect(location).toBe(`https://asisteam.example${checkinPath(checkin)}`);expect(new URL(location).search).toBe("");
 });
 it.each(["error=access_denied&error_description=private","","code=one&code=two&state=bound"])("cancelación/código inválido: %s",async query=>{
  expect((await callback(query)).headers.get("Location")).toBe("https://asisteam.example/login?social_error=1");expect(mock.complete).not.toHaveBeenCalled();
 });
 it.each([undefined,"not-encrypted","forged-transaction"])("no autentica sin transacción nativa válida: %s",async value=>{
  mock.get.mockImplementation((name:string)=>name===SOCIAL_TRANSACTION_COOKIE?(value?{value}:undefined):{value:"{}"});
  mock.complete.mockRejectedValue(new ApiClientError(401,"authentication_required"));
  expect((await callback()).headers.get("Location")).toContain("social_error=1");expect(mock.tokens).not.toHaveBeenCalled();
  if(!value)expect(mock.complete).not.toHaveBeenCalled();
 });
 it("código vencido/reutilizado y red no revelan detalles",async()=>{
  mock.complete.mockRejectedValueOnce(new ApiClientError(401,"authentication_required","code expired")).mockRejectedValueOnce(new Error("network token"));
  for(let i=0;i<2;i++)expect((await callback()).headers.get("Location")).toBe("https://asisteam.example/login?social_error=1");expect(mock.tokens).not.toHaveBeenCalled();
 });
 it.each([null,"MANAGED","INVITED"])("cuenta no autorizada por API no crea cookies: %s",async()=>{
  mock.complete.mockRejectedValue(new ApiClientError(401,"authentication_required"));
  expect((await callback()).headers.get("Location")).toContain("social_error=1");expect(mock.tokens).not.toHaveBeenCalled();
 });
});
it.each(["error=access_denied","code=valid&state=bound"])("fallo conserva invitación validada para reintentar: %s",async query=>{
 mock.get.mockImplementation((name:string)=>({value:name===SOCIAL_TRANSACTION_COOKIE?"encrypted-transaction":JSON.stringify({invite_code:"ABCD1234"})}));
 mock.complete.mockRejectedValue(new Error("network"));
 expect((await callback(query)).headers.get("Location")).toBe("https://asisteam.example/login?invite_code=ABCD1234&social_error=1");
});
it("sin evidencia pide aceptación y conserva invitación",async()=>{
 mock.consent.mockResolvedValue({accepted:false});mock.complete.mockResolvedValue({tokens,context:{invite_code:"ABCD1234"},linked:false});
 const url=new URL((await callback()).headers.get("Location")!);expect(url.pathname).toBe("/accept-terms");expect(url.searchParams.get("return_to")).toBe("/join?code=ABCD1234");expect(mock.consent).toHaveBeenCalledExactlyOnceWith();
});
it("evidencia indisponible falla cerrada conservando QR solo en fragmento",async()=>{
 const checkin={activity_id:"58000000-0000-4000-8000-000000000501",token:"a".repeat(64)};
 mock.complete.mockResolvedValue({tokens,context:{checkin},linked:false});mock.consent.mockRejectedValue(new ApiClientError(503,"unavailable"));
 const url=new URL((await callback()).headers.get("Location")!);expect(url.pathname).toBe("/accept-terms");expect(url.searchParams.get("return_to")).toBe("/check-in");expect(url.search).not.toContain(checkin.token);expect(url.hash).toBe(new URL(checkinPath(checkin),"https://asisteam.example").hash);
});
it("callback genérico retirado rechaza códigos y redirecciones ajenas sin intercambio",async()=>{
 const response=await GET(new Request("https://attacker.example/auth/callback?code=valid&next=https://evil.example"));
 expect(response.headers.get("Location")).toBe("https://asisteam.example/login?social_error=1");expect(mock.complete).not.toHaveBeenCalled();expect(mock.tokens).not.toHaveBeenCalled();
});
