import { createClient } from "@supabase/supabase-js";
import { createGuardianshipMajorityHandler } from "./handler.ts";

const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
Deno.serve(createGuardianshipMajorityHandler({
  client: createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  serviceRoleKey,
  resendApiKey: Deno.env.get("RESEND_API_KEY"),
  emailFrom: Deno.env.get("INVITATION_EMAIL_FROM"),
}));
