"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { Button } from "./button";

/** Inline disclosure, deliberately non-modal: Tab can leave the confirmation. */
export function InlineConfirmation({ open, title, children, confirmLabel = "Confirmar", cancelLabel = "Cancelar",
  destructive = false, busy = false, disabled = false, onConfirm, onCancel, fallbackFocusRef }: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      returnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      cancelRef.current?.focus();
    } else if (!open && wasOpen.current) {
      const target = returnRef.current;
      if (target?.isConnected && !target.matches(":disabled")) target.focus();
      else fallbackFocusRef?.current?.focus();
    }
    wasOpen.current = open;
  }, [open, fallbackFocusRef]);

  if (!open) return null;
  return <div role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    aria-busy={busy} className="space-y-3 rounded-lg border border-input bg-surface p-4"
    onKeyDown={event => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); onCancel(); }
    }}>
    <p id={`${id}-title`} className="text-h3">{title}</p>
    <p id={`${id}-description`} className="text-small">{children}</p>
    <div className="flex flex-wrap gap-3">
      <Button type="button" variant={destructive ? "destructive" : "primary"} loading={busy} disabled={disabled}
        onClick={onConfirm}>{confirmLabel}</Button>
      <Button ref={cancelRef} type="button" variant="secondary" disabled={busy}
        aria-describedby={`${id}-description`} onClick={onCancel}>{cancelLabel}</Button>
    </div>
  </div>;
}
