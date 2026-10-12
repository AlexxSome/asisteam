// One channel per document: the sender does not invalidate its own active action.
export const sessionChannel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("asisteam-web-session");
export function changedSession() { sessionChannel?.postMessage("changed"); }
