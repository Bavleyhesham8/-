export function getPersistentConfigurationError() {
  const missing: string[] = [];

  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (
    process.env.VERCEL === "1" &&
    process.env.DATABASE_URL &&
    !isNeonPooledConnectionString(process.env.DATABASE_URL)
  ) {
    missing.push("a pooled Neon DATABASE_URL");
  }
  if (!process.env.BETTER_AUTH_SECRET) missing.push("BETTER_AUTH_SECRET");
  if (!process.env.BETTER_AUTH_URL) missing.push("BETTER_AUTH_URL");

  return missing.length
    ? `Persistent mode is not configured. Missing: ${missing.join(", ")}.`
    : null;
}

export function isDevelopmentDemoMode() {
  return process.env.NODE_ENV === "development" &&
    process.env.APP_MODE !== "persistent";
}

export function isNeonPooledConnectionString(value: string) {
  try {
    return new URL(value).hostname.includes("-pooler.");
  } catch {
    return false;
  }
}
