import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const client = new pg.Client({ connectionString: url });
await client.connect();

for (const [name, query] of Object.entries({
  catalog: `select * from "الاصناف / الفئة" order by "ID"`,
  items: `select * from "راس الثلاجة" order by "رقم الصنف"`,
  ledger: `select * from "اطراف الثلاجة" order by "ID"`,
  invoiceLines: `select * from "اطراف الفاتورة" where "السعر" = '0' or "الاجمالى" = 0 order by "ID" limit 50`,
  invoices: `select * from "راس الفاتورة" order by "رقم الفاتورة" desc limit 10`,
})) {
  const rows = (await client.query(query)).rows;
  console.log(`\n### ${name} (${rows.length})`);
  console.log(JSON.stringify(rows, null, 2));
}
await client.end();
