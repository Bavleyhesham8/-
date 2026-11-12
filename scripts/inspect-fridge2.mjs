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
  "fridge ledger summary",
  `select movement_direction, count(*)::int as n, count(*) filter (where "الصنف / الفئة" = '')::int as empty_category, count(*) filter (where "السعر" is null)::int as null_price, count(*) filter (where "الاجمالى" is null)::int as null_total from "اطراف الثلاجة" group by movement_direction`,
);
await run(
  "fridge outgoing sample",
  `select "ID", "رقم الصنف", "الصنف / الفئة", "السعر", "المنصرف", "تاريخ الصرف", "جهة الصرف", "رقم اذن الصرف", needs_review from "اطراف الثلاجة" where movement_direction = 'out' order by "ID" desc limit 30`,
);
await run(
  "fridge incoming summary",
  `select i."رقم الصنف", i."الصنف / الفئة", l."الكمية", l."السعر", c."السعر" as cat_price, c."الكمية" as cat_qty from "اطراف الثلاجة" l join "راس الثلاجة" i on i."رقم الصنف" = l."رقم الصنف" join "الاصناف / الفئة" c on c."ID" = i.catalog_id where l.movement_direction = 'in' order by i."رقم الصنف"`,
);
await run(
  "attendance",
  `select a.id, a.employee_number, e.employee_name, a.clock_in_at, a.clock_out_at from staff_attendance a join staff_employees e on e.employee_number = a.employee_number order by a.id`,
);
await run(
  "meat invoices",
  `select * from "فواتير بيع اللحوم" order by "رقم الفاتورة" desc limit 20`,
);
await run(
  "meat lines",
  `select * from "اطراف فواتير البيع" order by "ID" desc limit 30`,
);

await client.end();
