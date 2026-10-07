const verified = new WeakSet<object>();
export type VerifiedIdentity = Readonly<{ authUserId: string; sessionId: string; expiresAt: number }>;
export function sealIdentity(value: VerifiedIdentity): VerifiedIdentity { const identity = Object.freeze(value); verified.add(identity); return identity; }
export function isVerifiedIdentity(identity: VerifiedIdentity): boolean { return verified.has(identity); }
