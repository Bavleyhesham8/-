import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { treatmentInvoices } from "@/db/schema";
import { isDevelopmentDemoMode } from "@/lib/app-config";
import {
  getAuthorizationErrorStatus,
  requireScreenAccess,
} from "@/lib/auth-session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (isDevelopmentDemoMode()) {
    return new Response("Not found", { status: 404 });
  }

  try {
    await requireScreenAccess("treatment");
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return new Response("Not found", { status: 404 });
    }
    const [invoice] = await getDatabase()
      .select({
        pathname: treatmentInvoices.prescriptionPathname,
        contentType: treatmentInvoices.prescriptionContentType,
      })
      .from(treatmentInvoices)
      .where(eq(treatmentInvoices.id, id))
      .limit(1);
    if (!invoice?.pathname) {
      return new Response("Not found", { status: 404 });
    }

    const blob = await get(invoice.pathname, { access: "private" });
    if (!blob) {
      return new Response("Not found", { status: 404 });
    }
    if (blob.statusCode !== 200) {
      return new Response(null, { status: 304 });
    }

    return new Response(blob.stream, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": 'inline; filename="prescription.jpg"',
        "Content-Type":
          blob.blob.contentType || invoice.contentType || "image/jpeg",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const authorizationStatus = getAuthorizationErrorStatus(error);
    if (authorizationStatus) {
      return new Response(
        authorizationStatus === 401
          ? "Authentication required."
          : "Treatment access is required.",
        { status: authorizationStatus },
      );
    }
    console.error("Failed to load treatment prescription image.", error);
    return new Response("Not found", { status: 404 });
  }
}
