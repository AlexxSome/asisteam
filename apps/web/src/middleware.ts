import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canManageAttendance } from "@asisteam/core";
import type { Database } from "@asisteam/db";
import { isGroupId } from "@/lib/group-routing";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refresco de sesión (@supabase/ssr): los Server Components no pueden
 * escribir cookies, así que la rotación del refresh token ocurre aquí.
 */
export async function middleware(request: NextRequest) {
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

  const missingResource = () => {
    const missing = new NextResponse('<!doctype html><html lang="es"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No encontrado · Asisteam</title><body><main><h1>No encontrado</h1><p>La página solicitada no está disponible.</p><a href="/">Volver al inicio</a></main></body></html>', {
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
      const { data: ward, error } = user && isGroupId(athleteUserId)
        ? await supabase.from("v_my_wards").select("athlete_user_id").eq("athlete_user_id", athleteUserId).maybeSingle()
        : { data: null, error: null };
      // Revalidar antes de streaming: mismo HTTP 404 para ajeno, adulto o inexistente.
      if (error || !ward) return missingResource();
    }
  }
  if (segments[1] === "groups" && segments[2] && segments[2] !== "new") {
    const groupId = segments[2];
    const { data: group } = user && isGroupId(groupId)
      ? await supabase.from("v_my_groups").select("id, roles").eq("id", groupId).maybeSingle()
      : { data: null };
    const forbidden = (message: string) => {
      const denied = new NextResponse(`<!doctype html><html lang="es"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sin permisos · Asisteam</title><body><main><h1>No tienes permisos</h1><p>${message}</p><a href="/groups">Volver a mis grupos</a></main></body></html>`, {
        status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
      });
      response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
      return denied;
    };
    const managementRoute = ["settings", "invitations", "guardians", "activity-types"].includes(segments[3] ?? "")
      || (segments[3] === "members" && segments[4] !== "consent")
      || (segments[3] === "activities" && (segments[4] === "new" || segments[5] === "edit"));
    if (group?.roles?.includes("COACH") && !group.roles.includes("ADMIN") && managementRoute) {
      return forbidden("Solo un administrador del grupo puede acceder a esta gestión.");
    }
    const adminRoute = segments[3] === "settings" || (segments[3] === "members" && segments[4] === "new");
    if (!group || (adminRoute && !group.roles?.includes("ADMIN"))) {
      // Antes de que Next empiece streaming: notFound() en un layout puede
      // responder 200 después de enviar encabezados. Aquí el HTTP siempre es 404.
      return missingResource();
    }
    if (segments[3] === "billing" && !group.roles?.includes("ADMIN")) {
      return forbidden("Solo un administrador del grupo puede gestionar su suscripción.");
    }
    const attendanceRoute = segments[3] === "activities" && !!segments[4] && segments[5] === "attendance";
    if (attendanceRoute && !canManageAttendance(group.roles ?? [])) {
      return forbidden("Solo un administrador o entrenador del grupo puede tomar asistencia.");
    }
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}

export const config = {
  matcher: ["/groups/:path*", "/wards/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
