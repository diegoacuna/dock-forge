import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveInstallRedirect } from "./lib/install-gate";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

const readInstallCompleted = async () => {
  try {
    const response = await fetch(`${API_BASE}/install/status`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const status = (await response.json()) as { installCompleted?: boolean };
    return status.installCompleted === true;
  } catch {
    return false;
  }
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname === "/robots.txt") {
    return NextResponse.next();
  }

  const installCompleted = await readInstallCompleted();
  const redirectPath = resolveInstallRedirect({ pathname, installCompleted });

  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
