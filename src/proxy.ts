import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// المسارات العامة التي يُسمح بالوصول إليها بدون تسجيل دخول
const PUBLIC_PATHS = ["/sign-in", "/api/auth"];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // السماح بمسارات تسجيل الدخول ومصادقة API
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // تجاهل الملفات الثابتة والوسائط
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // التحقق من وجود جلسة صالحة (حقيقية أو تجريبية)
  const sessionCookie =
    getSessionCookie(request) ||
    request.cookies.get("__session")?.value ||
    request.cookies.get("qithara-demo-session")?.value;

  // إذا لم يكن مسجلاً، يتم تحويله فوراً لصفحة تسجيل الدخول
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  // تفعيل الحماية على كل صفحات التطبيق عدا الملفات الثابتة
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
