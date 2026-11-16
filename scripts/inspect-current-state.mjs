import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) throw new Error("no url");
const client = new pg.Client({ connectionString: url });
await client.connect();

const queries = {
  villas: `select * from "رقم الفيلا" order by "ID"`,
  stays: `select villa, room, count(*)::int as n from resident_stays group by villa, room order by villa, room`,
  churches: `select * from "الكنيسة التابع لها" order by "ID"`,
  treatmentHeaders: `select * from "راس العلاج" order by "رقم النزيل"`,
  financeHeaders: `select * from "راس النزيل" order by "رقم النزيل"`,
  residents: `select id, file_number, name, resident_number, church, confessor from residents order by name limit 100`,
};

for (const [name, query] of Object.entries(queries)) {
  const rows = (await client.query(query)).rows;
  console.log(`\n### ${name} (${rows.length})`);
  console.log(JSON.stringify(rows, null, 2));
}
await client.end();
