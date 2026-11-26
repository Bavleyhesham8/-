import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const execute = process.argv.includes("--execute");
const backupDir = path.resolve(projectRoot, "..", "backups");

function readDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  for (const file of [".env.local", ".env.local.persistent.bak"]) {
    const fullPath = path.join(projectRoot, file);
    if (!fs.existsSync(fullPath)) continue;
    const url = fs
      .readFileSync(fullPath, "utf8")
      .match(/^DATABASE_URL=(.+)$/m)?.[1]
      ?.trim();
    if (url) return url;
  }
  throw new Error("DATABASE_URL is not configured.");
}

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

const url = readDatabaseUrl();
const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 15000,
});
await client.connect();

const tableRows = (
  await client.query(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  )
).rows;
const tables = tableRows.map((row) => row.tablename);

async function count(table) {
  const result = await client.query(
    `select count(*)::int as n from ${quoteIdent(table)}`,
  );
  return result.rows[0].n;
}

const keptTables = [
  "user",
  "account",
  "session",
  "verification",
  "residents",
  "resident_stays",
  "nam",
  "resident_legacy_links",
  "رقم الفيلا",
  "الموظفين",
  "تحديث البيانات",
  "staff_account_links",
  "user_canteen_access",
  "user_inventory_categories",
  "inventory_categories",
  "inventory_items",
  "الفئة",
  "الفئه",
  "الكنيسة التابع لها",
  "المحافظة",
  "اليوم",
];

const truncateTables = [
  "invoice_stock_movement_links",
  "canteen_stock_movement_links",
  "canteen_stock_voids",
  "meat_sale_stock_movement_links",
  "meat_sale_payments",
  "meat_sale_voids",
  "refrigerator_stock_voids",
  "resident_invoice_payments",
  "resident_invoice_voids",
  "اطراف الفاتورة",
  "راس الفاتورة",
  "اطراف فواتير البيع",
  "فواتير بيع اللحوم",
  "اطراف الثلاجة",
  "راس الثلاجة",
  "الاصناف / الفئة",
  "اطراف الكانتين",
  "راس الكانتين",
  "طرف الكانين",
  "مشتريات النزلاء",
  "كانتين",
  "inventory_movements",
  "inventory_price_history",
  "custody_events",
  "اطراف المخزن",
  "العهدة",
  "راس العهدة",
  "راس المخزن",
  "الاصناف",
  "center_custody_transactions",
  "اطراف العلاج",
  "راس العلاج",
  "اطراف النزيل",
  "راس النزيل",
  "gate_visits",
  "gate_visitors",
  "staff_attendance",
  "اطراف الموظفين",
  "import_quarantine",
  "audit_logs",
];

const missingTables = [...keptTables, ...truncateTables].filter(
  (table) => !tables.includes(table),
);
if (missingTables.length) {
  throw new Error(`Missing tables: ${missingTables.join(", ")}`);
}

const beforeCounts = {};
for (const table of tables) beforeCounts[table] = await count(table);

const canteenRows = (
  await client.query(
    `select "رقم الصنف" as item_number, "اسم الصنف" as name
     from "كانتين"
     order by "رقم الصنف"`,
  )
).rows;
const seenCanteen = new Set();
const canteenItems = [];
for (const row of canteenRows) {
  const name = String(row.name ?? "").normalize("NFC").trim();
  const key = name.toLowerCase();
  if (!name || seenCanteen.has(key)) continue;
  seenCanteen.add(key);
  canteenItems.push({ name, oldItemNumber: row.item_number });
}

const fridgeRows = (
  await client.query(
    `select "ID" as id, "الصنف / الفئة" as name
     from "الاصناف / الفئة"
     order by "ID"`,
  )
).rows;
const seenFridge = new Set();
const fridgeItems = [];
for (const row of fridgeRows) {
  const name = String(row.name ?? "").normalize("NFC").trim();
  const key = name.toLowerCase();
  if (!name || seenFridge.has(key)) continue;
  seenFridge.add(key);
  fridgeItems.push({ name, oldCatalogId: row.id });
}

console.log(
  JSON.stringify(
    {
      mode: execute ? "execute" : "dry-run",
      totalsBefore: {
        canteen: canteenRows.length,
        canteenUnique: canteenItems.length,
        fridge: fridgeRows.length,
        fridgeUnique: fridgeItems.length,
        inventoryItems: beforeCounts["inventory_items"],
        residents: beforeCounts.residents,
        stays: beforeCounts.resident_stays,
      },
      canteenItems: canteenItems.map((item) => item.name),
      fridgeItems: fridgeItems.map((item) => item.name),
      truncateTables,
    },
    null,
    2,
  ),
);

if (!execute) {
  await client.end();
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `qithara-backup-${stamp}.json`);
const backup = {
  format: "qithara-reset-backup-v1",
  createdAt: new Date().toISOString(),
  source: "qithara-center-web",
  tables: {},
};
for (const table of tables) {
  const rows = (
    await client.query(`select * from ${quoteIdent(table)}`)
  ).rows;
  backup.tables[table] = rows;
}
fs.writeFileSync(backupPath, JSON.stringify(backup), "utf8");
console.log(`BACKUP_PATH=${backupPath}`);

await client.query("BEGIN");
await client.query("SET LOCAL lock_timeout = '30s'");
await client.query("SET LOCAL statement_timeout = '120s'");
try {
  await client.query(
    `TRUNCATE TABLE ${truncateTables.map(quoteIdent).join(", ")} RESTART IDENTITY CASCADE`,
  );

  for (const item of canteenItems) {
    await client.query(
      `insert into "كانتين" ("اسم الصنف", "السعر", needs_review)
       values ($1, 0, false)`,
      [item.name],
    );
  }
  const insertedCanteen = (
    await client.query(
      `select "رقم الصنف" as item_number, "اسم الصنف" as name
       from "كانتين" order by "رقم الصنف"`,
    )
  ).rows;
  for (const item of insertedCanteen) {
    await client.query(
      `insert into "مشتريات النزلاء"
        ("الصنف", "السعر", "اضافة", canteen_item_number, needs_review)
       values ($1, 0, false, $2, false)`,
      [item.name, item.item_number],
    );
  }

  await client.query(
    `update inventory_items
     set unit_price = 0, updated_at = now()`,
  );

  for (const item of fridgeItems) {
    const catalog = (
      await client.query(
        `insert into "الاصناف / الفئة" ("الصنف / الفئة", "السعر", "الكمية")
         values ($1, 0, 0)
         returning "ID"`,
        [item.name],
      )
    ).rows[0];
    if (!catalog) throw new Error(`Failed to create fridge catalog ${item.name}`);
    await client.query(
      `insert into "راس الثلاجة" ("الصنف / الفئة", catalog_id)
       values ($1, $2)`,
      [item.name, catalog.ID],
    );
  }

  const afterCounts = {};
  for (const table of tables) afterCounts[table] = await count(table);
  for (const table of keptTables) {
    if (afterCounts[table] !== beforeCounts[table]) {
      throw new Error(
        `Kept table ${table} changed from ${beforeCounts[table]} to ${afterCounts[table]}.`,
      );
    }
  }
  for (const table of truncateTables) {
    const isRebuilt =
      table === "كانتين" ||
      table === "مشتريات النزلاء" ||
      table === "الاصناف / الفئة" ||
      table === "راس الثلاجة";
    if (!isRebuilt && afterCounts[table] !== 0) {
      throw new Error(`Table ${table} still has ${afterCounts[table]} rows.`);
    }
  }

  const checks = {
    canteenProducts: (
      await client.query(`select count(*)::int as n from "كانتين"`)
    ).rows[0].n,
    canteenSalesItems: (
      await client.query(`select count(*)::int as n from "مشتريات النزلاء"`)
    ).rows[0].n,
    unlinkedCanteenSalesItems: (
      await client.query(
        `select count(*)::int as n from "مشتريات النزلاء" rp
         left join "كانتين" c on c."رقم الصنف" = rp.canteen_item_number
         where rp.canteen_item_number is null or c."رقم الصنف" is null`,
      )
    ).rows[0].n,
    duplicateCanteenNames: (
      await client.query(
        `select count(*)::int as n from (
           select lower(trim("اسم الصنف")) as name from "كانتين"
           group by 1 having count(*) > 1
         ) duplicates`,
      )
    ).rows[0].n,
    fridgeCatalog: (
      await client.query(`select count(*)::int as n from "الاصناف / الفئة"`)
    ).rows[0].n,
    fridgeItems: (
      await client.query(`select count(*)::int as n from "راس الثلاجة"`)
    ).rows[0].n,
    fridgeItemsWithoutCatalog: (
      await client.query(
        `select count(*)::int as n from "راس الثلاجة" i
         left join "الاصناف / الفئة" c on c."ID" = i.catalog_id
         where c."ID" is null`,
      )
    ).rows[0].n,
    duplicateFridgeNames: (
      await client.query(
        `select count(*)::int as n from (
           select lower(trim("الصنف / الفئة")) as name from "راس الثلاجة"
           group by 1 having count(*) > 1
         ) duplicates`,
      )
    ).rows[0].n,
    inventoryItems: (
      await client.query(`select count(*)::int as n from inventory_items`)
    ).rows[0].n,
    inventoryItemsWithPrice: (
      await client.query(
        `select count(*)::int as n from inventory_items where unit_price <> 0`,
      )
    ).rows[0].n,
    canteenPrices: (
      await client.query(`select count(*)::int as n from "كانتين" where "السعر" <> 0`)
    ).rows[0].n,
    canteenSalesPrices: (
      await client.query(
        `select count(*)::int as n from "مشتريات النزلاء" where "السعر" <> 0`,
      )
    ).rows[0].n,
    fridgePrices: (
      await client.query(
        `select count(*)::int as n from "الاصناف / الفئة" where "السعر" <> 0 or "الكمية" <> 0`,
      )
    ).rows[0].n,
  };

  await client.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        status: "committed",
        backupPath,
        checks,
        countsAfter: {
          residents: afterCounts.residents,
          residentStays: afterCounts.resident_stays,
          employees: afterCounts["الموظفين"],
          inventoryItems: afterCounts.inventory_items,
          residentInvoices: afterCounts["راس الفاتورة"],
          meatInvoices: afterCounts["فواتير بيع اللحوم"],
          fridgeLedger: afterCounts["اطراف الثلاجة"],
          canteenLedger: afterCounts["طرف الكانين"],
          inventoryMovements: afterCounts.inventory_movements,
          gateVisits: afterCounts.gate_visits,
          gateVisitors: afterCounts.gate_visitors,
          treatments: afterCounts["راس العلاج"],
          attendance: afterCounts.staff_attendance,
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  await client.query("ROLLBACK");
  console.error("RESET_FAILED", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
