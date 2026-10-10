import { socialAuthOrigin } from "@/lib/social-auth";
import { SOCIAL_AUTH_ERROR } from "@asisteam/core";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
    const origin = socialAuthOrigin();
    const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
    if (!origin)
        return NextResponse.json({ error: { code: "social_auth_unavailable", message: SOCIAL_AUTH_ERROR, details: {} } }, { status: 503, headers });
    return NextResponse.redirect(new URL("/login?social_error=1", origin), { status: 303, headers });
}
