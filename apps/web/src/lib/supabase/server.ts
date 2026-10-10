import { nativeUser } from "@/lib/api/native-auth";
import { NATIVE_ACCESS_COOKIE } from "@/lib/api/native-auth-config";
import { cookies } from "next/headers";
import "server-only";
/** Session adapter kept at its existing import path; no provider SDK or database writes. */
export async function createClient(_options: { requireCookieWrites?: boolean } = {}) {
  const store = await cookies();
  return { auth: {
    getUser: async () => ({ data: { user: await nativeUser() }, error: null }),
    getSession: async () => {
      const user = await nativeUser();
      const access_token = store.get(NATIVE_ACCESS_COOKIE)?.value;
      return { data: { session: user && access_token ? { access_token, user } : null }, error: null };
    },
  } };
}
