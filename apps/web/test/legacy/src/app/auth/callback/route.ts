// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import { nativeAuthEnabled } from '@legacy/lib/api/native-auth-config';
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkinPath, socialLoginContextSchema, SOCIAL_AUTH_ERROR } from "@asisteam/core";
import { memberOperation } from "@legacy/lib/members";
import { createClient } from "@legacy/lib/supabase/server";
import { authCookieOptions } from "@legacy/lib/supabase/cookie-options";
import { SOCIAL_CALLBACK_PATH, SOCIAL_CONTEXT_COOKIE, socialAuthOrigin } from "@legacy/lib/social-auth";
import { authPath } from "@/lib/auth-context";
import { accountConsentPath } from "@/lib/account-consent-routing";

export async function GET(request: Request) {
  const origin = socialAuthOrigin();
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  if (!origin) return NextResponse.json({ error: { code: "social_auth_unavailable", message: SOCIAL_AUTH_ERROR, details: {} } }, { status: 503, headers });

  if (nativeAuthEnabled()) return NextResponse.redirect(new URL("/login?social_error=1", origin), { status: 303, headers });

  const cookieStore = await cookies();
  const savedContext = cookieStore.get(SOCIAL_CONTEXT_COOKIE)?.value;
  cookieStore.set(SOCIAL_CONTEXT_COOKIE, "", { ...authCookieOptions(), path: SOCIAL_CALLBACK_PATH, maxAge: 0 });
  let destination = "/login?social_error=1";
  try {
    const params = new URL(request.url).searchParams;
    const code = params.get("code");
    const context = socialLoginContextSchema.safeParse(JSON.parse(savedContext ?? "null"));
    if (context.success && context.data.invite_code) {
      destination = `${authPath("/login", context.data.invite_code)}&social_error=1`;
    }
    if (context.success && code && code.length <= 4096 && params.getAll("code").length === 1 && !params.has("error")) {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        // GoTrue vincula las identidades por email. El callback nunca crea ni reasigna perfiles.
        const { data: profile, error: profileError } = await supabase.from("users")
          .select("account_status").eq("auth_user_id", data.user.id).maybeSingle();
        if (!profileError && profile?.account_status === "ACTIVE") {
          destination = context.data.checkin ? checkinPath(context.data.checkin)
            : context.data.invite_code ? `/join?code=${context.data.invite_code}` : "/welcome";
          const { data: accepted, error: consentError } = await memberOperation(() => supabase.rpc("has_account_consent"), async api => (await api.getCurrentAccountConsent()).accepted);
          if (consentError || accepted !== true) destination = accountConsentPath(destination);
        } else {
          await supabase.auth.signOut({ scope: "local" });
        }
      }
    }
  } catch {
    // Errores/cancelaciones del proveedor no exponen email, tokens ni detalles internos.
  }
  return NextResponse.redirect(new URL(destination, origin), { status: 303, headers });
}
