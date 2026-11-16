import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { parse } from "csv-parse/sync";

dotenv.config({ path: ".env.local" });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DIR = "C:\\Users\\OPT\\AppData\\Local\\Temp\\opencode\\access-csv-export";
const EXPECTED_HOST =
  "ep-little-dawn-bev149sv-pooler.c-9.us-east-2.aws.neon.tech";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_MISSING");
const host = new URL(url).hostname;
if (host !== EXPECTED_HOST) throw new Error("DATABASE_HOST_NOT_APPROVED");
console.log(`TARGET_HOST=${host}`);
console.log(`MODE=${APPLY ? "APPLY" : "DRY_RUN (default)"}`);

const read = (file) =>
  parse(fs.readFileSync(path.join(DIR, file), "utf8"), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");

  const churchRows = read("الكنيسة التابع لها.csv");
  const churchById = new Map(
    churchRows.map((row) => [String(row.ID).trim(), row]),
  );
  const sourceChurchId = churchById.get("3");
  if (sourceChurchId) {
    const result = await client.query(
      `UPDATE public."الكنيسة التابع لها"
       SET "num" = $1, "nam" = $2, "Achesh" = $3, "Fathr" = $4
       WHERE "ID" = 3`,
      [
        sourceChurchId.num ?? "",
        sourceChurchId.nam ?? "",
        sourceChurchId.Achesh ?? "",
        sourceChurchId.Fathr ?? "",
      ],
    );
    console.log(`CHURCH_ROW_3_UPDATED=${result.rowCount}`);
  }

  const extraChurch = await client.query(
    `DELETE FROM public."الكنيسة التابع لها"
     WHERE "ID" NOT IN (${churchRows.map((row) => Number(row.ID)).join(",")})
     RETURNING "ID"`,
  );
  console.log(
    `CHURCH_EXTRA_DELETED=${extraChurch.rowCount} IDS=${extraChurch.rows.map((row) => row.ID).join(",")}`,
  );

  const governorateRows = read("المحافظة.csv");
  const sourceGovernorateIds = governorateRows
    .map((row) => Number(row.ID))
    .join(",");
  const extraGovernorate = await client.query(
    `DELETE FROM public."المحافظة"
     WHERE "ID" NOT IN (${sourceGovernorateIds})
     RETURNING "ID"`,
  );
  console.log(
    `GOVERNORATE_EXTRA_DELETED=${extraGovernorate.rowCount} IDS=${extraGovernorate.rows.map((row) => row.ID).join(",")}`,
  );

  const duplicateLeaves = await client.query(
    `DELETE FROM public."اطراف الموظفين" target
     USING public."اطراف الموظفين" keep
     WHERE target."ID" > keep."ID"
       AND target."رقم" IS NOT DISTINCT FROM keep."رقم"
       AND target."تاريخ النزول" IS NOT DISTINCT FROM keep."تاريخ النزول"
       AND target."تاريخ العودة" IS NOT DISTINCT FROM keep."تاريخ العودة"
       AND target."نوع الاجازة" IS NOT DISTINCT FROM keep."نوع الاجازة"
       AND target."ملاحظات" IS NOT DISTINCT FROM keep."ملاحظات"
     RETURNING target."ID"`,
  );
  console.log(
    `STAFF_LEAVE_DUPLICATES_DELETED=${duplicateLeaves.rowCount} IDS=${duplicateLeaves.rows.map((row) => row.ID).join(",")}`,
  );

  if (APPLY) {
    await client.query("COMMIT");
    console.log("CLEANUP_COMMITTED");
  } else {
    await client.query("ROLLBACK");
    console.log("CLEANUP_DRY_RUN_ROLLED_BACK");
  }
} catch (error) {
  await client.query("ROLLBACK");
  console.error(`CLEANUP_FAILED=${error.code ?? error.name}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
