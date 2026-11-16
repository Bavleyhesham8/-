import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) throw new Error("no url");
const client = new pg.Client({ connectionString: url });
await client.connect();

async function run(label, sql) {
  const { rows } = await client.query(sql);
  console.log(`\n### ${label} (${rows.length})`);
  console.log(JSON.stringify(rows, null, 2));
}

await run(
  "residentPurchases zero",
  `select "ID", "الصنف", "السعر", canteen_item_number, needs_review from "مشتريات النزلاء" where "السعر" = 0 or needs_review = true order by "ID"`,
);
await run(
  "invoice lines zero price",
  `select "ID", "رقم", "الصنف", "السعر", "الكمية", "الاجمالى" from "اطراف الفاتورة" where "السعر"::numeric = 0 or "الاجمالى" = 0 order by "ID" limit 100`,
);
await run(
  "canteen products zero",
  `select "رقم الصنف", "اسم الصنف", "السعر", needs_review from "كانتين" where "السعر" = 0 or needs_review = true order by "رقم الصنف"`,
);
await run(
  "invoice count by item",
  `select "الصنف", count(*)::int as n, min("السعر"::numeric) as min_price, max("السعر"::numeric) as max_price from "اطراف الفاتورة" group by "الصنف" order by n desc limit 40`,
);
await run(
  "fridge catalog",
  `select * from "الاصناف / الفئة" order by "ID"`,
);
await run(
  "fridge products",
  `select * from "راس الثلاجة" order by "رقم الصنف"`,
);
await run(
  "fridge ledger sample",
  `select "ID", "رقم الصنف", "الصنف / الفئة", "الكمية", "السعر", "الاجمالى", "المنصرف", "تاريخ الصرف", "movement_direction", needs_review from "اطراف الثلاجة" order by "ID" limit 60`,
);
await run(
  "attendance",
  `select a.id, a.employee_number, e.employee_name, a.clock_in_at, a.clock_out_at from staff_attendance a join staff_employees e on e.employee_number = a.employee_number order by a.id`,
);

await client.end();
