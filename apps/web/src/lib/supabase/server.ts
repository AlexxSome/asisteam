import { nativeAuthEnabled, NATIVE_ACCESS_COOKIE, NATIVE_REFRESH_COOKIE } from '@/lib/api/native-auth-config';
import { nativeUser } from '@/lib/api/native-auth';
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@asisteam/db";
import { authCookieOptions } from "./cookie-options";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Cliente Supabase para Server Components y Server Actions.
 * Sesión en cookies HttpOnly vía @supabase/ssr (nunca localStorage),
 * según docs/07-api-y-backend.md §6.1.
 */
export async function createClient({ requireCookieWrites = false } = {}) {
  const cookieStore = await cookies();

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch (error) {
            if (requireCookieWrites) throw error;
            // Ignorado en Server Components: el refresco de sesión
            // que escribe cookies ocurre en el middleware.
          }
        },
      },
    },
  );
  if(nativeAuthEnabled()&&(cookieStore.get(NATIVE_ACCESS_COOKIE)||cookieStore.get(NATIVE_REFRESH_COOKIE))){
    // Compatibility for consumers of getUser/getSession only; all domain calls
    // are gated to Nest. Credentials remain exclusively in Server Actions.
    client.auth.getUser=async()=>{const user=await nativeUser();return {data:{user},error:null} as Awaited<ReturnType<typeof client.auth.getUser>>;};
    client.auth.getSession=async()=>{const user=await nativeUser();return {data:{session:user?{access_token:cookieStore.get(NATIVE_ACCESS_COOKIE)?.value,user}:null},error:null} as Awaited<ReturnType<typeof client.auth.getSession>>;};
  }
  return client;
}
