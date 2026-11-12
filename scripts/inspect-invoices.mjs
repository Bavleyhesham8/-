import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const client = new pg.Client({ connectionString: url });
await client.connect();
const q = async (sql) => (await client.query(sql)).rows;
const out = {
  invoices: await q('select "رقم الفاتورة", "تاريخ الفاتورة", "اسم النزيل", resident_id, sale_type from "راس الفاتورة" order by "رقم الفاتورة"'),
  lines: await q('select "ID", "الصنف", "السعر", "الكمية", "الاجمالى", "رقم", purchase_id, "الفئه" from "اطراف الفاتورة" order by "رقم", "ID"'),
  purchases: await q('select "ID", "الصنف", "السعر", canteen_item_number, needs_review from "مشتريات النزلاء" order by "ID"'),
};
fs.writeFileSync("scripts/inspect-invoices.json", JSON.stringify(out, null, 2), "utf8");
console.log(Object.fromEntries(Object.entries(out).map(([k,v])=>[k,v.length])));
await client.end();
