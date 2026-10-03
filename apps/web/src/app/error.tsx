"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="p-4 py-12 md:p-8"><ErrorState reset={reset} /></main>;
}
