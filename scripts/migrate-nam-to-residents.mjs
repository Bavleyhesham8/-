import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const unknownArgs = args.filter(
  (arg) => arg !== "--apply" && arg !== "--confirm-target=import-test",
);
if (unknownArgs.length) {
  console.error(
    "Usage: node scripts/migrate-nam-to-residents.mjs --confirm-target=import-test [--apply]",
  );
  process.exit(2);
}
if (!args.includes("--confirm-target=import-test")) {
  console.error("TARGET_REQUIRES_IMPORT_TEST_CONFIRMATION");
  process.exit(2);
}
if (process.env.NEON_BRANCH_NAME !== "import-test") {
  console.error("TARGET_REQUIRES_NEON_BRANCH_NAME_IMPORT_TEST");
  process.exit(2);
}
const connectionString =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not configured.");
  process.exit(2);
}
let targetHost;
try {
  targetHost = new URL(connectionString).hostname;
} catch {
  console.error("DATABASE_URL_INVALID");
  process.exit(2);
}
console.log("TARGET_BRANCH=import-test");
console.log(`TARGET_HOST=${targetHost}`);
console.log(`MODE=${APPLY ? "APPLY" : "DRY_RUN"}`);

const client = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 30000,
});

const text = (value) => (value === null || value === undefined ? "" : String(value));
const hasText = (value) => text(value).trim() !== "";
const quoteIdentifier = (identifier) =>
  `"${identifier.replaceAll('"', '""')}"`;

const sourceQuery = `
  SELECT
    "ID" AS id,
    "num" AS file_number,
    "nam" AS name,
    to_char("Dat_Brth", 'YYYY-MM-DD') AS birth_date,
    "Adrres" AS address,
    "tal" AS phone,
    "Con" AS governorate,
    "mar" AS district,
    "Achesh" AS church,
    "Fathr" AS confessor,
    to_char("Dat_Ent", 'YYYY-MM-DD') AS admission_date,
    to_char("Dat_AO", 'YYYY-MM-DD') AS exit_date,
    "sak" AS villa,
    "Num_ROm" AS room
  FROM public."nam"
  ORDER BY "ID"
`;

const residentColumns = [
  "file_number",
  "name",
  "birth_date",
  "phone",
  "address",
  "emergency_contact",
  "emergency_phone",
  "district",
  "relationship",
  "church",
  "confessor",
  "governorate",
  "resident_number",
  "incomplete_stay",
  "follow_up",
  "graduated",
  "national_id",
  "marital_status",
  "qualification",
  "previous_experience",
  "previous_workplaces",
  "resident_entry",
  "relationship_degree",
  "entry_time",
  "exit_method",
  "treating_doctor_number",
  "treating_doctor_address",
  "rehabilitation_team",
  "rehabilitation_stage",
  "trainer",
  "supervisor",
  "lecturer",
  "image_path",
  "archived",
];

function residentValues(row) {
  const values = {
    file_number: text(row.file_number),
    name: text(row.name),
    birth_date: row.birth_date,
    phone: text(row.phone),
    address: text(row.address),
    emergency_contact: "",
    emergency_phone: "",
    district: text(row.district),
    relationship: "",
    church: text(row.church),
    confessor: text(row.confessor),
    governorate: text(row.governorate),
    resident_number: "",
    incomplete_stay: false,
    follow_up: false,
    graduated: false,
    national_id: "",
    marital_status: "",
    qualification: "",
    previous_experience: "",
    previous_workplaces: "",
    resident_entry: "",
    relationship_degree: "",
    entry_time: "",
    exit_method: "",
    treating_doctor_number: "",
    treating_doctor_address: "",
    rehabilitation_team: "",
    rehabilitation_stage: "",
    trainer: "",
    supervisor: "",
    lecturer: "",
    image_path: "",
    archived: false,
  };
  return residentColumns.map((column) => values[column]);
}

try {
  await client.connect();
  await client.query(APPLY ? "BEGIN" : "BEGIN READ ONLY");
  if (APPLY) {
    await client.query("SELECT pg_advisory_xact_lock(827341902)");
  }

  const { rows } = await client.query(sourceQuery);
  const { rows: linkedRows } = await client.query(
    `SELECT legacy_resident_id FROM public.resident_legacy_links`,
  );
  const { rows: existingFileRows } = await client.query(
    `SELECT file_number FROM public.residents`,
  );
  const linkedIds = new Set(
    linkedRows.map((row) => String(row.legacy_resident_id)),
  );
  const existingFileNumbers = new Set(
    existingFileRows.map((row) => String(row.file_number)),
  );
  const fileNumberCounts = new Map();
  for (const row of rows) {
    const fileNumber = text(row.file_number);
    if (hasText(fileNumber)) {
      fileNumberCounts.set(
        fileNumber,
        (fileNumberCounts.get(fileNumber) ?? 0) + 1,
      );
    }
  }

  const { rows: imageCountRows } = await client.query(`
    SELECT count(*)::int AS count
    FROM public."nam"
    WHERE NULLIF(btrim("ImagePath"), '') IS NOT NULL
  `);
  const imagePathCount = imageCountRows[0].count;

  const ready = [];
  const rejectedIds = [];
  let skipped = 0;

  for (const row of rows) {
    const id = Number(row.id);
    const idLabel = Number.isSafeInteger(id) ? String(id) : "<missing>";
    if (Number.isSafeInteger(id) && linkedIds.has(String(id))) {
      skipped += 1;
      continue;
    }

    const fileNumber = text(row.file_number);
    const admissionDate = row.admission_date;
    const invalid =
      !Number.isSafeInteger(id) ||
      !hasText(fileNumber) ||
      !hasText(row.name) ||
      !admissionDate ||
      (row.exit_date && row.exit_date < admissionDate) ||
      (fileNumberCounts.get(fileNumber) ?? 0) > 1 ||
      existingFileNumbers.has(fileNumber);

    if (invalid) {
      rejectedIds.push(idLabel);
      continue;
    }
    ready.push(row);
  }

  if (APPLY) {
    const quotedColumns = residentColumns.map(quoteIdentifier).join(", ");
    const placeholders = residentColumns.map((_, index) => `$${index + 1}`).join(", ");
    const residentInsert = `
      INSERT INTO public.residents (${quotedColumns})
      VALUES (${placeholders})
      RETURNING id
    `;

    for (const row of ready) {
      const { rows: residentRows } = await client.query(
        residentInsert,
        residentValues(row),
      );
      await client.query(
        `INSERT INTO public.resident_stays
          (resident_id, admission_date, exit_date, villa, room)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          residentRows[0].id,
          row.admission_date,
          row.exit_date,
          text(row.villa),
          text(row.room),
        ],
      );
      await client.query(
        `INSERT INTO public.resident_legacy_links (resident_id, legacy_resident_id)
         VALUES ($1, $2)`,
        [residentRows[0].id, row.id],
      );
    }
  }

  await client.query(APPLY ? "COMMIT" : "ROLLBACK");
  console.log(`MODE=${APPLY ? "APPLY" : "DRY_RUN"}`);
  console.log(`SOURCE_ROWS=${rows.length}`);
  console.log(`${APPLY ? "MIGRATED" : "READY_TO_MIGRATE"}=${ready.length}`);
  console.log(`SKIPPED_ALREADY_LINKED=${skipped}`);
  console.log(`REJECTED=${rejectedIds.length}`);
  console.log(`NONEMPTY_IMAGEPATH_ROWS=${imagePathCount}`);
  for (const id of rejectedIds) console.log(`REJECTED_ID=${id}`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    `MIGRATION_FAILED_ROLLED_BACK=${error?.code || "DB_ERROR"}`,
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
