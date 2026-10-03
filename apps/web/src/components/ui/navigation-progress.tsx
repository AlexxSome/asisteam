"use client";

import { useLinkStatus } from "next/link";

/** Kept inside Link so pending follows the router, including cancelled navigation. */
export function NavigationProgress() {
  const { pending } = useLinkStatus();
  return <span role={pending ? "status" : undefined} className="inline-flex shrink-0 items-center">
    <span className="sr-only">{pending ? "Cargando página…" : ""}</span>
    <span aria-hidden="true" className={`inline-block size-3 rounded-full border-2 border-current transition-opacity ${pending ? "opacity-100 delay-150" : "opacity-0"}`} />
  </span>;
}
