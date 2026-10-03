"use client";

import { ActionLink, Button } from "./button";

type PaginationProps = { label: string; page: number; totalPages: number } & (
  { onPageChange: (page: number) => void; previousHref?: never; nextHref?: never } |
  { onPageChange?: never; previousHref?: string; nextHref?: string }
);

export function Pagination({ label, page, totalPages, onPageChange, previousHref, nextHref }: PaginationProps) {
  return <nav aria-label={label} className="flex flex-wrap items-center gap-3">
    {onPageChange ? <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</Button>
      : previousHref && <ActionLink prefetch={false} variant="secondary" href={previousHref}>Anterior</ActionLink>}
    <span className="text-small" aria-live="polite" aria-atomic="true">Página {page} de {Math.max(1, totalPages)}</span>
    {onPageChange ? <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Siguiente</Button>
      : nextHref && <ActionLink prefetch={false} variant="secondary" href={nextHref}>Siguiente</ActionLink>}
  </nav>;
}
