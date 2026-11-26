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

const checks = {};
const q = async (name, sql) => {
  checks[name] = (await client.query(sql)).rows;
};

await q(
  "canteen_linkage",
  `select
     (select count(*)::int from "كانتين") as stock_items,
     (select count(*)::int from "مشتريات النزلاء") as sales_items,
     (select count(*)::int from "مشتريات النزلاء" rp
        left join "كانتين" c on c."رقم الصنف" = rp.canteen_item_number
        where c."رقم الصنف" is null) as unlinked_sales,
     (select count(*)::int from "مشتريات النزلاء" where "السعر" <> 0) as nonzero_sales_prices,
     (select count(*)::int from "كانتين" where "السعر" <> 0) as nonzero_stock_prices`,
);
await q(
  "fridge_linkage",
  `select
     (select count(*)::int from "الاصناف / الفئة") as catalog_items,
     (select count(*)::int from "راس الثلاجة") as item_headers,
     (select count(*)::int from "راس الثلاجة" i
        left join "الاصناف / الفئة" c on c."ID" = i.catalog_id
        where c."ID" is null) as headers_without_catalog,
     (select count(*)::int from "الاصناف / الفئة" where "السعر" <> 0 or "الكمية" <> 0) as nonzero_prices_or_quantities`,
);
await q(
  "inventory_prices",
  `select count(*)::int as nonzero from inventory_items where unit_price <> 0`,
);
await q(
  "canteen_catalog_sample",
  `select c."رقم الصنف" as item_number, c."اسم الصنف" as name, c."السعر" as price,
          rp."ID" as sales_id, rp."الصنف" as sales_name, rp."السعر" as sales_price
   from "كانتين" c left join "مشتريات النزلاء" rp on rp.canteen_item_number = c."رقم الصنف"
   order by c."رقم الصنف"`,
);
await q(
  "fridge_catalog",
  `select c."ID", c."الصنف / الفئة" as name, c."السعر" as price, c."الكمية" as quantity,
          i."رقم الصنف" as item_number
   from "الاصناف / الفئة" c left join "راس الثلاجة" i on i.catalog_id = c."ID"
   order by c."ID"`,
);

console.log(JSON.stringify({ counts, checks }, null, 2));
await client.end();
