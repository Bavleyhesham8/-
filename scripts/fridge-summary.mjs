import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const client = new pg.Client({ connectionString: url });
await client.connect();

const rows = (
  await client.query(
    `select "ID" as id, "الصنف / الفئة" as name, "الكمية" as qty, "السعر" as price, "المنصرف" as out, "رقم الصنف" as item, movement_direction as dir, needs_review
     from "اطراف الثلاجة" order by "رقم الصنف", "ID"`,
  )
).rows;
for (const row of rows) console.log(JSON.stringify(row));
const cats = (
  await client.query(
    `select c."ID" as id, c."الصنف / الفئة" as name, c."السعر" as price, c."الكمية" as qty, i."رقم الصنف" as item
     from "الاصناف / الفئة" c left join "راس الثلاجة" i on i.catalog_id = c."ID" order by i."رقم الصنف"`,
  )
).rows;
console.log("CATALOG");
for (const row of cats) console.log(JSON.stringify(row));
await client.end();
