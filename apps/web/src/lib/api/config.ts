import { ApiClientError } from "@asisteam/api-client";
export const TRANSPORT_MODULES = ["groups", "profile", "members", "invitations", "activities", "attendance", "reports", "billing", "announcements", "qr", "storage"] as const;
export type TransportModule = typeof TRANSPORT_MODULES[number];
/** The shipped web has a single authority. Obsolete deployment flags fail closed. */
export function moduleTransport(module: TransportModule): "nest" {
  if (!TRANSPORT_MODULES.includes(module)) throw new ApiClientError(400, "invalid_transport_configuration");
  if (process.env.ASISTEAM_DATABASE_MODE && process.env.ASISTEAM_DATABASE_MODE !== "independent"
    || process.env.ASISTEAM_TRANSPORT_AUTH && process.env.ASISTEAM_TRANSPORT_AUTH !== "nest"
    || TRANSPORT_MODULES.some(name => process.env[`ASISTEAM_TRANSPORT_${name.toUpperCase()}`] && process.env[`ASISTEAM_TRANSPORT_${name.toUpperCase()}`] !== "nest")) {
    throw new ApiClientError(400, "independent_database_requires_nest");
  }
  return "nest";
}
