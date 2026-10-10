import { createSessionClient } from "@/lib/api/session";
import { ApiClient,ApiClientError,apiOrigin } from "@asisteam/api-client";
import "server-only";
/** Tokens remain inside Next. No session object is returned to a Client Component. */
export function createServerApiClient(): ApiClient {
    return new ApiClient({
        origin: apiOrigin(process.env.ASISTEAM_API_ORIGIN ?? ""),
        timeoutMs: Number(process.env.ASISTEAM_API_TIMEOUT_MS ?? 5000),
        accessToken: async () => {
            const sessionClient = await createSessionClient();
            const verified = await sessionClient.auth.getUser();
            if (verified.error || !verified.data.user)
                throw new ApiClientError(401, "authentication_required");
            const session = await sessionClient.auth.getSession();
            if (session.error || !session.data.session || session.data.session.user.id !== verified.data.user.id) {
                throw new ApiClientError(401, "authentication_required");
            }
            return session.data.session.access_token;
        },
    });
}
