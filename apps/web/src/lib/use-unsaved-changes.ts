"use client";

import { useCallback, useEffect, useRef } from "react";

const navigationEvent = "asisteam:before-navigation";
const message = "Tienes cambios sin guardar. ¿Quieres salir y descartarlos?";

/** Programmatic navigation (for example, the active group selector). */
export function navigateWithUnsavedChanges(navigate: () => void) {
  if (window.dispatchEvent(new CustomEvent(navigationEvent, { cancelable: true, detail: navigate }))) navigate();
}

/** The draft stays only in React memory; history contains a boolean marker. */
export function useUnsavedChanges(dirty: boolean) {
  const savedRef = useRef(false);
  if (!dirty) savedRef.current = false;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty && !savedRef.current;
  const guardRef = useRef(false);
  const pendingRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(false);

  const leave = useCallback((navigate: () => void, saved = false) => {
    if (!saved && dirtyRef.current && !window.confirm(message)) return;
    if (saved) { savedRef.current = true; dirtyRef.current = false; }
    if (pendingRef.current) { pendingRef.current = navigate; return; }
    if (guardRef.current && window.history.state?.asisteamUnsavedActivity) {
      pendingRef.current = navigate;
      window.history.back();
    } else navigate();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const navigate = (event: Event) => {
      event.preventDefault();
      leave((event as CustomEvent<() => void>).detail);
    };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (!dirtyRef.current && !guardRef.current) return;
      event.preventDefault(); event.stopPropagation();
      // Replay the original link after removing the history guard, so Next retains
      // its normal navigation behavior without changing authorized destinations.
      leave(() => { dirtyRef.current = false; link.click(); });
    };
    const submit = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement && event.target.dataset.unsavedActivity === "true") return;
      if (!dirtyRef.current) return;
      if (!window.confirm(message)) { event.preventDefault(); event.stopPropagation(); }
      else dirtyRef.current = false;
    };
    const popState = (event: PopStateEvent) => {
      if (!guardRef.current || event.state?.asisteamUnsavedActivity) return;
      // This pop reaches the duplicate of the current route, not another page.
      event.stopImmediatePropagation();
      guardRef.current = false;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) { pending(); return; }
      if (dirtyRef.current && !window.confirm(message)) {
        window.history.pushState({ ...window.history.state, asisteamUnsavedActivity: true }, "", window.location.href);
        guardRef.current = true;
      } else { dirtyRef.current = false; window.history.back(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener(navigationEvent, navigate);
    window.addEventListener("popstate", popState, true);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener(navigationEvent, navigate);
      window.removeEventListener("popstate", popState, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
    };
  }, [leave]);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (dirty && !guardRef.current) {
      window.history.pushState({ ...window.history.state, asisteamUnsavedActivity: true }, "", window.location.href);
      guardRef.current = true;
    } else if (!dirty && guardRef.current && !pendingRef.current) {
      pendingRef.current = () => {};
      window.history.back();
    }
  }, [dirty]);
  return leave;
}
