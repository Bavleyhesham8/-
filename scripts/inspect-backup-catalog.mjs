import fs from "node:fs";

const backupPath = process.argv[2];
if (!backupPath) throw new Error("usage: node inspect-backup-catalog.mjs <backup.json>");
const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const sales = backup.tables["مشتريات النزلاء"] ?? [];
const stock = backup.tables["كانتين"] ?? [];
const categories = backup.tables["الفئة"] ?? backup.tables["الفئه"] ?? [];

const categoryNames = new Map(
  categories.map((row) => [row.ID ?? row.id, row["الفئة"] ?? row.name ?? ""]),
);

console.log(
  JSON.stringify(
    {
      categories: categories.length,
      categorySample: categories.slice(0, 10),
      stock: stock.length,
      sales: sales.length,
      salesWithCategory: sales.filter((row) => row.invoice_category_id).length,
      salesWithAddFlag: sales.filter((row) => row["اضافة"] === true).length,
      salesSample: sales.slice(0, 12),
      groupedByName: Object.entries(
        sales.reduce((acc, row) => {
          const key = String(row["الصنف"] ?? "").trim();
          acc[key] ??= [];
          acc[key].push({
            id: row.ID,
            categoryId: row.invoice_category_id,
            categoryName: categoryNames.get(row.invoice_category_id) ?? "",
            add: row["اضافة"],
            canteenItemNumber: row.canteen_item_number,
          });
          return acc;
        }, {}),
      )
        .filter(([, rows]) => rows.some((row) => row.categoryId))
        .slice(0, 80),
    },
    null,
    2,
  ),
);
