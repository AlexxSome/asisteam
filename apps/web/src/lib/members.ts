import "server-only";
import { ApiClientError, type ApiClient } from "@asisteam/api-client";
import { moduleTransport } from "@/lib/api/config";
import { createServerApiClient } from "@/lib/api/server";

/** One executor per operation; a Nest failure never invokes the legacy write. */
export async function memberOperation<L, N>(legacy: () => PromiseLike<{ data: L | null; error: { code: string; message: string } | null }>, nest: (client: ApiClient) => Promise<N | null>) {
  if (moduleTransport("members") === "supabase") return legacy();
  try { return { data: await nest(createServerApiClient()), error: null }; }
  catch (error) {
    if (!(error instanceof ApiClientError)) throw error;
    // Preserve only the stable server code; never use a remote message in UI.
    return { data: null, error: { code: `PT${error.status}`, message: error.error.code } };
  }
}
