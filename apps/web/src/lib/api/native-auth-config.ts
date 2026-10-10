import { moduleTransport } from './config';
export const NATIVE_ACCESS_COOKIE = 'asisteam-access';
export const NATIVE_REFRESH_COOKIE = 'asisteam-refresh';
export function nativeAuthEnabled(): boolean { moduleTransport('groups'); return true; }
export function authCookieSettings(maxAge: number) { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge }; }
