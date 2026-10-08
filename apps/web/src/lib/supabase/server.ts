import { nativeAuthEnabled, NATIVE_ACCESS_COOKIE } from '@/lib/api/native-auth-config';
import { nativeUser } from '@/lib/api/native-auth';
import { ApiClientError } from '@asisteam/api-client';
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { PersistenceSchema } from "@asisteam/db";
import { authCookieOptions } from "./cookie-options";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Cliente Supabase para Server Components y Server Actions.
 * Sesión en cookies HttpOnly vía @supabase/ssr (nunca localStorage),
 * según docs/07-api-y-backend.md §6.1.
 */
export async function createClient({ requireCookieWrites = false } = {}) {
  const cookieStore = await cookies();

  if (nativeAuthEnabled()) {
    // Session compatibility only. Never initialize the retired SDK, even when
    // the browser has no native cookies or still carries a legacy session.
    const auth = {
      getUser: async () => ({ data: { user: await nativeUser() }, error: null }),
      getSession: async () => {
        const user = await nativeUser();
        return { data: { session: user ? { access_token: cookieStore.get(NATIVE_ACCESS_COOKIE)?.value, user } : null }, error: null };
      },
    };
    return new Proxy({ auth }, {
      get(target, property) {
        if (property === 'then') return undefined;
        if (property === 'auth') return target.auth;
        throw new ApiClientError(503, 'native_auth_requires_nest');
      },
    }) as unknown as ReturnType<typeof createServerClient<PersistenceSchema>>;
  }

  const client = createServerClient<PersistenceSchema>(
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
  return client;
}
