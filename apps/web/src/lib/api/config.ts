import { ApiClientError, apiOrigin } from "@asisteam/api-client";

export const TRANSPORT_MODULES = ["groups", "profile", "members", "invitations", "activities", "attendance", "reports", "billing", "announcements", "qr", "storage"] as const;
export type TransportModule = typeof TRANSPORT_MODULES[number];
export function moduleTransport(module: TransportModule): "supabase" | "nest" {
  if (!TRANSPORT_MODULES.includes(module)) throw new ApiClientError(400, "invalid_transport_configuration");
  const value = process.env[`ASISTEAM_TRANSPORT_${module.toUpperCase()}`] ?? "supabase";
  if (value !== "supabase" && value !== "nest") throw new ApiClientError(400, "invalid_transport_configuration");
  if (value === "nest") {
    // Deployment attestation: Nest must still use this same Supabase project/DB.
    // It is a configuration gate, not a substitute for #149's runtime RLS tests.
    const current = apiOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const target = apiOrigin(process.env.ASISTEAM_API_SUPABASE_URL ?? "");
    if (current !== target) throw new ApiClientError(400, "transport_database_mismatch");
  }
  return value;
}
