import { createClient } from "@supabase/supabase-js";
import { createSendInvitationHandler } from "./handler.ts";

Deno.serve(createSendInvitationHandler({
  client: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  resendApiKey: Deno.env.get("RESEND_API_KEY"),
  emailFrom: Deno.env.get("INVITATION_EMAIL_FROM"),
  webUrl: Deno.env.get("INVITATION_WEB_URL"),
  allowedOrigins: (Deno.env.get("INVITATION_ALLOWED_ORIGINS") ?? "https://app.asisteam.cl,https://staging.asisteam.cl").split(",").map(value => value.trim()),
}));
