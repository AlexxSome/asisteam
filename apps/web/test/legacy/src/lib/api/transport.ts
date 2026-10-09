// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import "server-only";
import { type ApiClient } from "@asisteam/api-client";
import { createServerApiClient } from "@legacy/lib/api/server";

import { moduleTransport, type TransportModule } from "@legacy/lib/api/config";
export { moduleTransport, TRANSPORT_MODULES, type TransportModule } from "@legacy/lib/api/config";

/** One executor, including on error/timeout. A write may have committed before timeout. */
export async function runModuleOperation<T>(module: TransportModule, executors: {
  supabase: () => Promise<T>;
  nest: (client: ApiClient) => Promise<T>;
}): Promise<T> {
  const transport = moduleTransport(module);
  return transport === "nest" ? executors.nest(createServerApiClient()) : executors.supabase();
}
