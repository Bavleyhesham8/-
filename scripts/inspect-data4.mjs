import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const client = new pg.Client({ connectionString: url });
await client.connect();
const q = async (label, sql) => {
  try {
    const res = await client.query(sql);
    console.log(`\n=== ${label} (${res.rows.length}) ===`);
    console.table(res.rows);
  } catch (e) { console.log("ERR", label, e.message); }
};
await q("canteen stock ledger sample", `select * from "طرف الكانين" order by "ID" limit 15`);
await q("fridge items", `select * from "راس الثلاجة" order by "رقم الصنف" limit 20`);
await q("fridge catalog", `select * from "الاصناف / الفئة" order by "ID" limit 20`);
await q("fridge ledger sample", `select * from "اطراف الثلاجة" order by "ID" limit 20`);
await q("meat invoices", `select * from "فواتير بيع اللحوم" order by "رقم الفاتورة" limit 10`);
await q("meat lines sample", `select * from "اطراف فواتير البيع" order by "ID" limit 15`);
await q("treatment headers", `select * from "راس العلاج" order by "رقم النزيل"`);
await q("treatment details", `select * from "اطراف العلاج" order by "ID" limit 60`);
await q("finance headers", `select * from "راس النزيل" order by "رقم النزيل"`);
await q("staff", `select * from "الموظفين"`);
await q("attendance", `select * from staff_attendance`);
await client.end();
