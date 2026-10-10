import { createServerApiClient } from "@/lib/api/server";
import { ApiClientError,type ApiClient } from "@asisteam/api-client";
import "server-only";
/** INVITATIONS selects the sole executor, including MANAGED credential requests. */
export async function invitationOperation<N>(nest: (api: ApiClient) => Promise<N | null>) {
    try {
        return { data: await nest(createServerApiClient()), error: null };
    }
    catch (error) {
        if (!(error instanceof ApiClientError))
            throw error;
        return { data: null, error: { code: `PT${error.status}`, message: error.error.code } };
    }
}
