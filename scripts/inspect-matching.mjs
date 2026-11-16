import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const client = new pg.Client({ connectionString: url });
await client.connect();

const q = async (sql) => (await client.query(sql)).rows;

const out = {
  treatmentHeaders: await q('select "رقم النزيل", "اسم النزيل" from "راس العلاج" order by "رقم النزيل"'),
  treatmentDetails: await q('select "ID", "اسم الدواء", "المبلغ", "الكمية", "الخصم", "الاجمالى", "التاريخ", "رقم" from "اطراف العلاج" order by "ID"'),
  financeHeaders: await q('select "رقم النزيل", "اسم النزيل" from "راس النزيل" order by "رقم النزيل"'),
  financeDetails: await q('select "ID", "المبلغ", "التاريخ", "تاريخ العودة", "رقم" from "اطراف النزيل" order by "ID"'),
  residents: await q('select id, file_number, name, resident_number, church, confessor from residents order by name'),
  nam: await q('select "ID", "num", "nam", "Nom" from nam order by "ID"'),
  churches: await q('select "ID", "num", "nam", "Achesh", "Fathr" from "الكنيسة التابع لها" order by "ID"'),
  villas: await q('select "ID", "N_V" from "رقم الفيلا" order by "ID"'),
  stays: await q('select villa, room, count(*)::int as n from resident_stays group by villa, room order by villa, room'),
  canteenZero: await q('select "ID", "الصنف", "السعر", canteen_item_number, needs_review from "مشتريات النزلاء" where "السعر" = 0 order by "ID" limit 30'),
  canteenProducts: await q('select "رقم الصنف", "اسم الصنف", "السعر" from "كانتين" order by "رقم الصنف"'),
  fridgeLedger: await q('select "ID", "الصنف / الفئة", "الكمية", "السعر", "الاجمالى", "المنصرف", "تاريخ الصرف", "رقم الصنف", movement_direction, needs_review from "اطراف الثلاجة" order by "ID" limit 40'),
  fridgeItems: await q('select "رقم الصنف", "الصنف / الفئة", catalog_id from "راس الثلاجة" order by "رقم الصنف"'),
  fridgeCatalog: await q('select "ID", "الصنف / الفئة", "السعر", "الكمية" from "الاصناف / الفئة" order by "ID"'),
};

fs.writeFileSync("scripts/inspect-matching.json", JSON.stringify(out, null, 2), "utf8");
console.log("written", Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
await client.end();
