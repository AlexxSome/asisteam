import { createServerApiClient } from "@/lib/api/server";
import { ApiClientError,type ApiClient } from "@asisteam/api-client";
import "server-only";
/** One executor per operation; a Nest failure never invokes the legacy write. */
export async function memberOperation<N>(nest: (client: ApiClient) => Promise<N | null>) {
    try {
        return { data: await nest(createServerApiClient()), error: null };
    }
    catch (error) {
        if (!(error instanceof ApiClientError))
            throw error;
        // Preserve only the stable server code; never use a remote message in UI.
        return { data: null, error: { code: `PT${error.status}`, message: error.error.code } };
    }
}
