import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

import { isOwnerPath, isGateConfigured, requestHasOwnerAccess } from "@/lib/ownerGate";

export default withAuth(
  async function middleware(req) {
    const { pathname, search } = req.nextUrl;
    if (!isOwnerPath(pathname)) return NextResponse.next();

    const isApi = pathname.startsWith("/api/");

    // Fail closed: with no code configured there is nothing to check against,
    // so the owner sections stay shut rather than falling open to every admin.
    if (!isGateConfigured()) {
      return isApi
        ? new NextResponse("OWNER_CODE is not configured.", { status: 500 })
        : NextResponse.redirect(new URL("/admin/unlock?reason=unconfigured", req.url));
    }

    if (await requestHasOwnerAccess(req)) return NextResponse.next();

    if (isApi) return new NextResponse("Owner code required.", { status: 403 });

    const url = new URL("/admin/unlock", req.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  },
  {
    callbacks: {
      // Pages keep the original behaviour: admin session or redirect to /login.
      // API routes are left to assertAdmin so the x-security-code scripting
      // path and the 401/403 responses stay intact — middleware only adds the
      // owner gate for those.
      authorized: ({ token, req }) =>
        req.nextUrl.pathname.startsWith("/api/admin") ? true : token?.isAdmin === true,
    },
  }
);

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
