import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: ".env.local" });
dotenv.config();

const isMigrationCommand = process.argv.includes("migrate");
const databaseUrl = process.env.DATABASE_URL;

if (isMigrationCommand && !databaseUrl) {
  throw new Error(
    "Set DATABASE_URL in .env.local before applying database migrations.",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "postgresql://qithara:qithara@localhost:5432/qithara",
  },
});
