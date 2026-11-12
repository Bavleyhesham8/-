import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) throw new Error("no url");
const client = new pg.Client({ connectionString: url });
await client.connect();
const tables = await client.query(
  `select table_name from information_schema.tables where table_schema='public' order by table_name`,
);
for (const row of tables.rows) {
  const name = row.table_name;
  try {
    const count = await client.query(`select count(*)::int as n from "${name}"`);
    console.log(String(count.rows[0].n).padStart(8), name);
  } catch (e) {
    console.log("   ERROR", name, e.message);
  }
}
await client.end();
