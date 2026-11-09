import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { nextCookies } from "better-auth/next-js";
import { getPersistentConfigurationError } from "@/lib/app-config";
import { getDatabase } from "@/db";
import { authSchema } from "@/db/schema";

function createAuth() {
  const configurationError = getPersistentConfigurationError();
  if (configurationError) throw new Error(configurationError);

  const baseURL = process.env.BETTER_AUTH_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!baseURL || !secret) {
    throw new Error("BETTER_AUTH_URL and BETTER_AUTH_SECRET are required.");
  }

  return betterAuth({
    appName: "مركز قيثارة داود",
    baseURL,
    secret,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(getDatabase(), {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
    },
    user: {
      additionalFields: {
        canEditResidents: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
        canAccessClinic: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
        canManageCanteen: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
        canIssueInvoices: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
        canManageWarehouse: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
        canManageCustody: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
        canManageMeatSales: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
        allowedScreens: {
          type: "string",
          required: false,
          defaultValue: "",
          input: false,
        },
      },
    },
    plugins: [
      admin({
        defaultRole: "staff",
        roles: {
          admin: adminAc,
          staff: userAc,
          viewer: userAc,
        },
      }),
      nextCookies(),
    ],
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  if (!authInstance) authInstance = createAuth();
  return authInstance;
}
