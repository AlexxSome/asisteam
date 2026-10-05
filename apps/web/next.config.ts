import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Actions receive passwords, tokens and personal data. Keep request
  // timing/error diagnostics, but never serialize their arguments in dev logs.
  logging: { serverFunctions: false },
  // QA owns its build directory and never reuses a developer's running server.
  distDir: process.env.ASISTEAM_QA === "1" ? ".next/qa-app" : ".next",
  transpilePackages: ["@asisteam/core"],
  experimental: { serverActions: { bodySizeLimit: "3mb" }, authInterrupts: true },
  async headers() {
    return [{
      source: "/reset-password",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "no-store" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    }];
  },
};

export default nextConfig;
