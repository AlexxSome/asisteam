import { timingSafeEqual, createHash } from "node:crypto";
import { managedClaimSchema } from "../../../packages/core/src/schemas/register.ts";
import { invitationTokenSchema } from "../../../packages/core/src/schemas/invitation.ts";
const input = managedClaimSchema.pick({email:true,password:true}).extend({nonce:invitationTokenSchema.regex(/^[0-9a-f]{64}$/)}).strict();
type Options = { secret?: string; createUser: (body: { email: string; password: string; email_confirm: true; user_metadata: { invitation_registration_nonce: string } }) => Promise<{ data: { user: { id: string } | null }; error: unknown }> };
/** Temporary GoTrue executor only. Reservation/authorization/acceptance stay in Nest + the Auth trigger. */
export function invitationAuthHandler(options: Options) {
  return async (request: Request) => {
    const headers = { "content-type": "application/json", "cache-control": "no-store" };
    const fail = (status: number) => new Response(JSON.stringify({ error: { code: status===401?"authentication_required":"registration_failed", message: "No pudimos activar la cuenta.", details: {} } }), { status, headers });
    if(request.method!=="POST")return fail(405);
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if(!options.secret)return fail(503);
    if(!timingSafeEqual(digest(options.secret),digest(request.headers.get("x-asisteam-auth-bridge")??"")))return fail(401);
    try {
      const raw=await request.text();if(raw.length>4096)return fail(400);
      const parsed=input.safeParse(JSON.parse(raw));if(!parsed.success)return fail(400);
      const {email,password,nonce}=parsed.data;
      const {data,error}=await options.createUser({email,password,email_confirm:true,user_metadata:{invitation_registration_nonce:nonce}});
      if(error||!data.user)return fail(422);
      return new Response(JSON.stringify({id:data.user.id}),{status:200,headers});
    } catch { return fail(503); }
  };
}
