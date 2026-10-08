import { nativeAuthEnabled, NATIVE_ACCESS_COOKIE, NATIVE_REFRESH_COOKIE } from '@/lib/api/native-auth-config';
import { nativeAuthMiddleware } from '@/lib/api/native-auth-middleware';
import { ApiClient, ApiClientError } from "@asisteam/api-client";
import { moduleTransport } from "@/lib/api/config";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canManageAttendance } from "@asisteam/core";
import type { Database } from "@asisteam/db";
import { isGroupId } from "@/lib/group-routing";
import { resourceResponseHtml } from "@/lib/resource-state";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { accountConsentPath } from "@/lib/account-consent-routing";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refresco de sesión (@supabase/ssr): los Server Components no pueden
 * escribir cookies, así que la rotación del refresh token ocurre aquí.
 */
export async function middleware(request: NextRequest) {
  if(nativeAuthEnabled()&&(request.cookies.has(NATIVE_ACCESS_COOKIE)||request.cookies.has(NATIVE_REFRESH_COOKIE)))return nativeAuthMiddleware(request);
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // No quitar: dispara la validación/refresco del token.
  const { data: { user } } = await supabase.auth.getUser();
  // Perfil y bienvenida también contienen datos privados sin contexto de grupo.
  if (user) response.headers.set("Cache-Control", "private, no-store");

  const unavailableResource = () => {
    const unavailable = new NextResponse("No pudimos cargar los datos. Vuelve a intentarlo.", { status: 503, headers: { "Cache-Control": "private, no-store" } });
    response.cookies.getAll().forEach(cookie => unavailable.cookies.set(cookie));
    return unavailable;
  };

  // Consultar el aviso, autenticarse y salir siguen disponibles sin aceptar.
  // Invitaciones capturan aceptación al crear credenciales o verifican el RPC
  // en su Server Action si se usa una cuenta existente.
  const pathname = request.nextUrl.pathname;
  const publicRoute = ["/accept-terms", "/login", "/register", "/forgot-password", "/reset-password", "/auth/callback"].includes(pathname)
    || pathname.startsWith("/legal/") || pathname.startsWith("/invitations/") || pathname.startsWith("/_next/");
  if (user && !publicRoute) {
    let accepted = false;
    let consentFailed = false;
    if (moduleTransport("members") === "nest") {
      try {
        const client = new ApiClient({ origin: process.env.ASISTEAM_API_ORIGIN ?? "", accessToken: async () => {
          const { data, error } = await supabase.auth.getSession();
          return !error && data.session?.user.id === user.id ? data.session.access_token : null;
        } });
        accepted = (await client.getCurrentAccountConsent()).accepted;
      } catch (error) {
        if (!(error instanceof ApiClientError) || error.status !== 401) return unavailableResource();
        consentFailed = true;
      }
    } else {
      const result = await supabase.rpc("has_account_consent");
      accepted = result.data === true;
      consentFailed = !!result.error;
    }
    if (consentFailed || accepted !== true) {
      const pending = NextResponse.redirect(new URL(accountConsentPath(pathname + request.nextUrl.search), request.url), 303);
      pending.headers.set("Cache-Control", "private, no-store");
      pending.headers.set("Referrer-Policy", "no-referrer");
      response.cookies.getAll().forEach(cookie => pending.cookies.set(cookie));
      return pending;
    }
  }

  const missingResource = () => {
    const missing = new NextResponse(resourceResponseHtml(404), {
      status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
    });
    response.cookies.getAll().forEach((cookie) => missing.cookies.set(cookie));
    return missing;
  };

  const segments = request.nextUrl.pathname.split("/");
  if (segments[1] === "wards") {
    response.headers.set("Cache-Control", "private, no-store");
    const athleteUserId = segments[2];
    if (athleteUserId) {
      let ward: { athlete_user_id: string | null } | null = null;
      let error = false;
      if (user && isGroupId(athleteUserId)) {
        if (moduleTransport("members") === "nest") {
          try {
            const client = new ApiClient({ origin: process.env.ASISTEAM_API_ORIGIN ?? "", accessToken: async () => {
              const session = await supabase.auth.getSession();
              return !session.error && session.data.session?.user.id === user.id ? session.data.session.access_token : null;
            } });
            ward = await client.getWard({ params: { athleteUserId } });
          } catch (failure) {
            if (!(failure instanceof ApiClientError) || ![401, 404].includes(failure.status)) return unavailableResource();
            error = true;
          }
        } else {
          const result = await supabase.from("v_my_wards").select("athlete_user_id").eq("athlete_user_id", athleteUserId).maybeSingle();
          ward = result.data; error = !!result.error;
        }
      }
      // Revalidar antes de streaming: mismo HTTP 404 para ajeno, adulto o inexistente.
      if (error || !ward) return missingResource();
    }
  }
  if (segments[1] === "groups" && segments[2] && segments[2] !== "new") {
    const groupId = segments[2];
    let group: { id: string | null; roles: string[] | null } | null = null;
    if (user && isGroupId(groupId)) {
      if (moduleTransport("groups") === "nest") {
        try {
          const client = new ApiClient({ origin: process.env.ASISTEAM_API_ORIGIN ?? "", accessToken: async () => {
            const { data, error } = await supabase.auth.getSession();
            return !error && data.session?.user.id === user.id ? data.session.access_token : null;
          } });
          group = await client.getGroup({ params: { groupId } });
        } catch (error) {
          if (!(error instanceof ApiClientError) || ![401, 404].includes(error.status)) {
            const unavailable = new NextResponse("No pudimos cargar el grupo. Vuelve a intentarlo.", { status: 503, headers: { "Cache-Control": "private, no-store" } });
            response.cookies.getAll().forEach(cookie => unavailable.cookies.set(cookie));
            return unavailable;
          }
        }
      } else { group = (await supabase.from("v_my_groups").select("id, roles").eq("id", groupId).maybeSingle()).data; }
    }
    const forbidden = () => {
      const denied = new NextResponse(resourceResponseHtml(403), {
        status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
      });
      response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
      return denied;
    };
    const managementRoute = ["settings", "invitations", "guardians", "activity-types"].includes(segments[3] ?? "")
      || (segments[3] === "members" && segments[4] !== "consent")
      || (segments[3] === "activities" && (segments[4] === "new" || segments[5] === "edit"));
    if (group?.roles?.includes("COACH") && !group.roles.includes("ADMIN") && managementRoute) {
      return forbidden();
    }
    const adminRoute = segments[3] === "settings" || (segments[3] === "members" && segments[4] === "new");
    if (!group || (adminRoute && !group.roles?.includes("ADMIN"))) {
      // Antes de que Next empiece streaming: notFound() en un layout puede
      // responder 200 después de enviar encabezados. Aquí el HTTP siempre es 404.
      return missingResource();
    }
    if (segments[3] === "billing" && !group.roles?.includes("ADMIN")) {
      return forbidden();
    }
    const attendanceRoute = segments[3] === "activities" && !!segments[4] && segments[5] === "attendance";
    if (attendanceRoute && !canManageAttendance(group.roles ?? [])) {
      return forbidden();
    }
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}

export const config = {
  matcher: ["/groups/:path*", "/wards/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
