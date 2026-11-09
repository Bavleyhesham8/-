import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--apply");
if (unknownArgs.length) {
  console.error("Usage: node scripts/migrate-nam-to-residents.mjs [--apply]");
  process.exit(2);
}

const connectionString =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not configured.");
  process.exit(2);
}

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
    "mar" AS marital_status,
    "Nom" AS national_id,
    "المؤهل الدراسى" AS qualification,
    "الخبرات السابقة" AS previous_experience,
    "اماكن العمل السابقة" AS previous_workplaces,
    "دخول النزيل" AS resident_entry,
    "صلة القرابة" AS relationship,
    "من االدرجة" AS relationship_degree,
    "ساعة الدخول" AS entry_time,
    "طريقة الخروج" AS exit_method,
    "رقم الطبيب المعالج" AS treating_doctor_number,
    "عنوان الطبيب المعالج" AS treating_doctor_address,
    "فريق التأهل والارشاد" AS rehabilitation_team,
    "مرحلة التأهيل والتعافى" AS rehabilitation_stage,
    "المدرب" AS trainer,
    "المشرف" AS supervisor,
    "المحاضر" AS lecturer,
    to_char("Dat_Ent", 'YYYY-MM-DD') AS admission_date,
    to_char("Dat_AO", 'YYYY-MM-DD') AS exit_date,
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
  return [
    text(row.file_number),
    text(row.name),
    row.birth_date,
    text(row.phone),
    text(row.address),
    "",
    "",
    "",
    text(row.relationship),
    "",
    "",
    "",
    // No verified relation connects the resident header number to nam.ID.
    "",
    false,
    false,
    false,
    text(row.national_id),
    text(row.marital_status),
    text(row.qualification),
    text(row.previous_experience),
    text(row.previous_workplaces),
    text(row.resident_entry),
    text(row.relationship_degree),
    text(row.entry_time),
    text(row.exit_method),
    text(row.treating_doctor_number),
    text(row.treating_doctor_address),
    text(row.rehabilitation_team),
    text(row.rehabilitation_stage),
    text(row.trainer),
    text(row.supervisor),
    text(row.lecturer),
    "",
    false,
  ];
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
          "",
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
