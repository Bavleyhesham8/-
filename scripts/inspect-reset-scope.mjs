import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(".env.local.persistent.bak", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) throw new Error("no url");
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
await client.connect();

const tables = (
  await client.query(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  )
).rows.map((r) => r.tablename);

const counts = {};
for (const table of tables) {
  const r = await client.query(
    `select count(*)::int as n from "${table.replaceAll('"', '""')}"`,
  );
  counts[table] = r.rows[0].n;
}

const fks = (
  await client.query(`
    select
      con.conname as name,
      src.relname as source_table,
      tgt.relname as target_table,
      pg_get_constraintdef(con.oid) as definition
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace n on n.oid = con.connamespace
    where con.contype = 'f' and n.nspname = 'public'
    order by src.relname, con.conname
  `)
).rows;

console.log(JSON.stringify({ counts, fks }, null, 2));
await client.end();
