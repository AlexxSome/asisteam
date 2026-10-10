import {beforeEach,describe,expect,it,vi} from "vitest";
import {ApiClientError} from "@asisteam/api-client";
const mock=vi.hoisted(()=>({save:vi.fn(),upload:vi.fn(),review:vi.fn(),permission:vi.fn(),revalidate:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:mock.revalidate}));
vi.mock("@/lib/api/server",()=>({createServerApiClient:()=>({updateOwnProfile:mock.save,uploadAvatar:mock.upload,reviewBirthdate:mock.review,setAvatarPermission:mock.permission})}));
import {reviewBirthdate,saveProfile,setAvatarPermission,uploadAvatar} from "@/app/profile/actions";
const user="16000000-0000-4000-8000-000000000001";
const values={full_name:"Ana Pérez",birthdate:"1990-01-01",phone:null};
const profile={id:user,...values,email:"ana@example.test",avatar_url:null};
beforeEach(()=>{vi.resetAllMocks();mock.save.mockResolvedValue({profile,birthdate_change_pending:false});mock.upload.mockResolvedValue({success:true});mock.review.mockResolvedValue({status:"APPLIED"});mock.permission.mockResolvedValue({success:true});});
describe("perfil: Server Actions nativas",()=>{
 it("rechaza modificación de campos protegidos antes de escribir",async()=>{
  expect((await saveProfile({...values,email:"otro@example.test"} as never)).ok).toBe(false);expect(mock.save).not.toHaveBeenCalled();
 });
 it("exige sesión válida",async()=>{
  mock.save.mockRejectedValue(new ApiClientError(401,"authentication_required"));
  expect((await saveProfile(values)).ok).toBe(false);expect(mock.revalidate).not.toHaveBeenCalled();
 });
 it("guarda solo perfil propio sin aceptar identidad e invalida bienvenida",async()=>{
  expect((await saveProfile(values)).ok).toBe(true);
  expect(mock.save).toHaveBeenCalledWith({body:values});expect(mock.revalidate).toHaveBeenCalledWith("/welcome");
 });
 it("comunica aprobación pendiente y devuelve la fecha vigente del servidor",async()=>{
  mock.save.mockResolvedValue({profile:{...profile,birthdate:"1991-01-01"},birthdate_change_pending:true});
  const result=await saveProfile(values);expect(result.ok).toBe(true);expect(result.message).toContain("pendiente");
  expect(result).toHaveProperty("profile.birthdate","1991-01-01");expect(mock.save).toHaveBeenCalledExactlyOnceWith({body:values});
 });
 it("no anuncia solicitud guardada si la transacción falla",async()=>{
  mock.save.mockRejectedValue(new ApiClientError(422,"birthdate_admin_confirmation_required"));
  expect((await saveProfile(values)).ok).toBe(false);expect(mock.save).toHaveBeenCalledTimes(1);expect(mock.revalidate).not.toHaveBeenCalled();
 });
 it("no expone detalles internos de DB",async()=>{
  mock.save.mockRejectedValue(new ApiClientError(500,"internal_error","sensitive database text"));
  expect((await saveProfile(values)).message).not.toContain("sensitive");
 });
});
describe("avatar privado",()=>{
 function form(type="image/png",bytes=new Uint8Array([137,80,78,71,13,10,26,10])){const data=new FormData();data.set("avatar",new File([bytes],"foto.png",{type}));return data;}
 it("rechaza contenido que no corresponde al MIME",async()=>{
  expect((await uploadAvatar(form("image/png",new TextEncoder().encode("<svg></svg>")))).ok).toBe(false);expect(mock.upload).not.toHaveBeenCalled();
 });
 it("valida límite antes de subir",async()=>{
  expect((await uploadAvatar(form("image/png",new Uint8Array(2097153)))).ok).toBe(false);expect(mock.upload).not.toHaveBeenCalled();
 });
 it("conserva rechazo de consentimiento resuelto antes del objeto en servidor",async()=>{
  mock.upload.mockRejectedValue(new ApiClientError(422,"avatar_consent_required"));
  expect((await uploadAvatar(form())).ok).toBe(false);expect(mock.revalidate).not.toHaveBeenCalled();
 });
 it("envía solo bytes/MIME; servidor genera propietario y nombre privado",async()=>{
  expect((await uploadAvatar(form())).ok).toBe(true);
  expect(mock.upload).toHaveBeenCalledExactlyOnceWith({body:{type:"image/png",content_base64:"iVBORw0KGgo="}});
  expect(mock.save).not.toHaveBeenCalled();expect(mock.revalidate).toHaveBeenCalledWith("/profile");
 });
 it("no confirma ni repite upload si falla commit del perfil",async()=>{
  // S3/HTTP integration verifies rollback/no reference and privacy of orphan.
  mock.upload.mockRejectedValue(new ApiClientError(422,"avatar_consent_required"));
  expect((await uploadAvatar(form())).ok).toBe(false);expect(mock.upload).toHaveBeenCalledTimes(1);
  expect(mock.save).not.toHaveBeenCalled();expect(mock.revalidate).not.toHaveBeenCalled();
 });
});
describe("decisiones",()=>{
 it("verifica entradas y sesión al revisar solicitud",async()=>{
  expect((await reviewBirthdate("invalid",user,true)).ok).toBe(false);expect(mock.review).not.toHaveBeenCalled();
  mock.review.mockRejectedValue(new ApiClientError(401,"authentication_required"));expect((await reviewBirthdate(user,user,true)).ok).toBe(false);
 });
 it("distingue última aprobación de parcial",async()=>{
  mock.review.mockResolvedValueOnce({status:"PENDING"}).mockResolvedValueOnce({status:"APPLIED"});
  expect((await reviewBirthdate(user,user,true)).message).toContain("Falta");expect((await reviewBirthdate(user,user,true)).message).toContain("Se aplicó");
 });
 it("resuelve permiso imagen por sesión/servidor con vínculo explícito",async()=>{
  expect((await setAvatarPermission(user,false)).ok).toBe(true);expect(mock.permission).toHaveBeenCalledWith({params:{guardianshipId:user},body:{allow:false}});
 });
});
