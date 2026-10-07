import "server-only";
import { type ApiClient } from "@asisteam/api-client";
import { createServerApiClient } from "./server";

import { moduleTransport, type TransportModule } from "./config";
export { moduleTransport, TRANSPORT_MODULES, type TransportModule } from "./config";

/** One executor, including on error/timeout. A write may have committed before timeout. */
export async function runModuleOperation<T>(module: TransportModule, executors: {
  supabase: () => Promise<T>;
  nest: (client: ApiClient) => Promise<T>;
}): Promise<T> {
  const transport = moduleTransport(module);
  return transport === "nest" ? executors.nest(createServerApiClient()) : executors.supabase();
}
