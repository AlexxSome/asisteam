import { createClient } from "@supabase/supabase-js";
import { createAnnouncementPushHandler } from "./handler.ts";

const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
Deno.serve(createAnnouncementPushHandler({
  client: createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } }),
  serviceRoleKey,
  expoAccessToken: Deno.env.get("EXPO_ACCESS_TOKEN"),
}));
