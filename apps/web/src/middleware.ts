import { moduleTransport } from "@/lib/api/config";
import { nativeAuthMiddleware } from "@/lib/api/native-auth-middleware";
import { NextResponse,type NextRequest } from "next/server";
export async function middleware(request: NextRequest) {
  moduleTransport("groups");
  if (request.nextUrl.pathname.startsWith("/auth/callback/")) return NextResponse.next();
  return nativeAuthMiddleware(request);
}
export const config = {
  matcher: ["/groups/:path*", "/wards/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
