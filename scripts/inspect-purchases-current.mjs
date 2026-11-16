import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const client = new pg.Client({ connectionString: url });
await client.connect();

const queries = {
  purchases: `select "ID", "الصنف" as name, "السعر" as price, "اضافة" as add_flag, canteen_item_number, needs_review from "مشتريات النزلاء" order by "ID"`,
  products: `select item_number, name, price from canteen_products order by item_number`,
  invoices: `select invoice_number, invoice_date, sale_type, resident_id from resident_invoices order by invoice_number desc limit 10`,
  zeroLines: `select l.invoice_number, l.item_name, l.unit_price, l.quantity, l.total from resident_invoice_lines l where l.unit_price = 0 or l.total = 0 order by l.invoice_number desc`,
  fridge: `select * from "مشتريات الفرن" order by "ID" limit 40`,
};
for (const [name, query] of Object.entries(queries)) {
  try {
    const rows = (await client.query(query)).rows;
    console.log(`\n### ${name} (${rows.length})`);
    console.log(JSON.stringify(rows, null, 2));
  } catch (error) {
    console.log(`\n### ${name} ERROR ${error.message}`);
  }
}
await client.end();
