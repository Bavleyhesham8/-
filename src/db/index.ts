import "server-only";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
let pool: Pool | undefined;

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Connect a Neon database before enabling persistent mode.",
    );
  }

  if (!database) {
    pool = new Pool({ connectionString });
    database = drizzle(pool, { schema });
  }

  return database;
}
