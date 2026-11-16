import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import { residents } from "@/db/schema";
import {
  getAuthorizationErrorStatus,
  requireCurrentSession,
} from "@/lib/auth-session";

const idSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentSession();
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return new Response("Invalid resident id.", { status: 400 });
    }

    const [resident] = await getDatabase()
      .select({ imagePath: residents.imagePath })
      .from(residents)
      .where(eq(residents.id, id))
      .limit(1);

    const imagePath = resident?.imagePath?.trim() ?? "";
    if (!imagePath) {
      return new Response("No resident photo.", { status: 404 });
    }

    if (imagePath.startsWith("data:image/")) {
      const match = imagePath.match(
        /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([a-zA-Z0-9+/=]+)$/,
      );
      if (!match) {
        return new Response("Unsupported resident photo.", { status: 415 });
      }
      const bytes = Buffer.from(match[2], "base64");
      return new Response(bytes, {
        headers: {
          "Cache-Control": "private, max-age=300",
          "Content-Type": match[1],
          "Content-Length": String(bytes.length),
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (/^https?:\/\//i.test(imagePath) || imagePath.startsWith("/")) {
      return Response.redirect(new URL(imagePath, request.url), 302);
    }

    return new Response("No resident photo.", { status: 404 });
  } catch (error) {
    const authorizationStatus = getAuthorizationErrorStatus(error);
    if (authorizationStatus === 401) {
      return new Response("Authentication required.", { status: 401 });
    }
    if (authorizationStatus) {
      return new Response("Access denied.", { status: authorizationStatus });
    }
    throw error;
  }
}
