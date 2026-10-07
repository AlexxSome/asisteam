import { createClient } from "@supabase/supabase-js";
import { invitationAuthHandler } from "./handler.ts";
const auth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession:false, autoRefreshToken:false } }).auth;
Deno.serve(invitationAuthHandler({secret:Deno.env.get("INVITATION_AUTH_BRIDGE_SECRET"),createUser: body => auth.admin.createUser(body)}));
