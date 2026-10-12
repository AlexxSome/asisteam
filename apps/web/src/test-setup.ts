import { afterEach } from "vitest";
import { JSDOM } from "jsdom";
// Keep Node Request/AbortSignal in the same realm; install only DOM globals.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "MutationObserver",
  "getComputedStyle",
])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key as keyof typeof dom.window],
    configurable: true,
    writable: true,
  });
const { cleanup } = await import("@testing-library/react");
afterEach(cleanup);
