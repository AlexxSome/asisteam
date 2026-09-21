import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@asisteam/db";
import { isGroupId } from "@/lib/group-routing";

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

  const segments = request.nextUrl.pathname.split("/");
  if (segments[1] === "groups" && segments[2] && segments[2] !== "new") {
    const groupId = segments[2];
    const { data: group } = user && isGroupId(groupId)
      ? await supabase.from("v_my_groups").select("id, roles").eq("id", groupId).maybeSingle()
      : { data: null };
    const adminRoute = segments[3] === "settings";
    if (!group || (adminRoute && !group.roles?.includes("ADMIN"))) {
      // Antes de que Next empiece streaming: notFound() en un layout puede
      // responder 200 después de enviar encabezados. Aquí el HTTP siempre es 404.
      const missing = new NextResponse('<!doctype html><html lang="es"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No encontrado · Asisteam</title><body><main><h1>No encontrado</h1><p>La página solicitada no está disponible.</p><a href="/">Volver al inicio</a></main></body></html>', {
        status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
      });
      response.cookies.getAll().forEach((cookie) => missing.cookies.set(cookie));
      return missing;
    }
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}

export const config = {
  matcher: ["/groups/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
