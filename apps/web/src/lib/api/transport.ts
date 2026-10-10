import { type ApiClient } from "@asisteam/api-client";
import "server-only";
import { moduleTransport,type TransportModule } from "./config";
import { createServerApiClient } from "./server";
export { moduleTransport,TRANSPORT_MODULES,type TransportModule } from "./config";
/** One executor, including on error/timeout. A write may have committed before timeout. */
export async function runModuleOperation<T>(module: TransportModule, executors: { nest: (client: ApiClient) => Promise<T> }): Promise<T> {
  moduleTransport(module);
  return executors.nest(createServerApiClient());
}
