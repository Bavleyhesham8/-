import { getPersistentConfigurationError } from "@/lib/app-config";

async function handleAuthRequest(request: Request) {
  const configurationError = getPersistentConfigurationError();
  if (configurationError) {
    return Response.json({ error: "Authentication is not configured." }, {
      status: 503,
    });
  }

  const [{ getAuth }, { toNextJsHandler }] = await Promise.all([
    import("@/lib/auth"),
    import("better-auth/next-js"),
  ]);
  const handlers = toNextJsHandler(getAuth());

  return request.method === "GET"
    ? handlers.GET(request)
    : handlers.POST(request);
}

export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
