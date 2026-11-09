import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { parse } from "csv-parse/sync";
import { applyDerivations } from "./derive.mjs";

dotenv.config({ path: ".env.local" });

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) =>
  args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=") ?? d;

const DIR = opt("dir", "C:\\Users\\OPT\\AppData\\Local\\Temp\\opencode\\access-csv-export");
const ENCODING = opt("encoding", "utf-8"); // لو العربي مبوظ: --encoding=windows-1256
const DRY = flag("dry");
const TRUNCATE = flag("truncate");
const SKIP_UNMATCHED = flag("skip-unmatched");

const ar = (s) =>
  s.normalize("NFKC").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/[\u064B-\u0652\u0640]/g, "");
const norm = (s) => ar(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const SKIP = new Set(opt("skip", "").split(",").map(norm).filter(Boolean));

const PROTECTED = new Set(["user", "account", "session", "verification"]); // جداول الـ auth: ممنوع نلمسها

const TEXTUAL = new Set(["text", "character varying", "character"]);
const TRUE_SET = new Set(["true", "t", "1", "-1", "yes", "y", "نعم", "صح"]);
const FALSE_SET = new Set(["false", "f", "0", "no", "n", "لا", "خطأ"]);

function convert(raw, col) {
  const s = raw === undefined || raw === null ? "" : String(raw);
  if (s.trim() === "") {
    if (col.is_nullable === "YES") return null;
    return TEXTUAL.has(col.data_type) ? "" : null;
  }
  if (col.data_type === "boolean") {
    const k = s.trim().toLowerCase();
    if (TRUE_SET.has(k)) return true;
    if (FALSE_SET.has(k)) return false;
    throw new Error(`قيمة boolean غير مفهومة "${s}" في العمود ${col.column_name}`);
  }
  return TEXTUAL.has(col.data_type) ? s : s.trim();
}

function readCsv(file) {
  const text = new TextDecoder(ENCODING).decode(fs.readFileSync(file)).replace(/^\uFEFF/, "");
  return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL مش موجود في .env.local");
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000 });
await client.connect();

// ---------- الجداول والأعمدة ----------
const { rows: colRows } = await client.query(`
  SELECT table_name, column_name, data_type, is_nullable, is_generated
  FROM information_schema.columns WHERE table_schema='public'
  ORDER BY table_name, ordinal_position`);
const tables = new Map();
for (const r of colRows) {
  if (!tables.has(r.table_name)) tables.set(r.table_name, []);
  tables.get(r.table_name).push(r);
}
const byNorm = new Map();
for (const t of tables.keys()) {
  const k = norm(t);
  byNorm.set(k, [...(byNorm.get(k) ?? []), t]);
}

// ---------- مطابقة الملفات بالجداول ----------
if (!fs.existsSync(DIR)) throw new Error(`الفولدر مش موجود: ${DIR}`);
const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".csv"));
console.log(`لقيت ${files.length} ملف CSV في الفولدر.\n`);

const problems = [];
const warnings = [];
const skippedTables = new Set();
let plan = [];
for (const f of files) {
  const base = f.replace(/\.csv$/i, "");
  const cands = byNorm.get(norm(base)) ?? [];
  const table = cands.length === 1 ? cands[0] : cands.find((t) => t === base);
  if (!table) {
    (SKIP_UNMATCHED ? warnings : problems).push(
      cands.length > 1
        ? `${f}: ينطبق على أكتر من جدول [${cands.join(" | ")}]`
        : `${f}: مفيش جدول بنفس الاسم في Neon`
    );
    continue;
  }
  if (PROTECTED.has(table)) { warnings.push(`${f}: اتخطّى (جدول auth محمي: ${table})`); continue; }
  if (SKIP.has(norm(table))) {
    skippedTables.add(table);
    warnings.push(`${f}: اتخطّى (--skip)`);
    continue;
  }

  let rows = readCsv(path.join(DIR, f));
  if (table === "الاصناف / الفئة" && rows.length) {
    const nameHeader = Object.keys(rows[0]).find((header) => norm(header) === norm("الصنف / الفئة"));
    const priceHeader = Object.keys(rows[0]).find((header) => norm(header) === norm("السعر"));
    const quantityHeader = Object.keys(rows[0]).find((header) => norm(header) === norm("الكمية"));
    const groupLabels = new Set([norm("السعر القديم"), norm("السعر الجديد")]);
    const originalCount = rows.length;
    rows = rows.filter((row) => {
      const isLabel = nameHeader && groupLabels.has(norm(row[nameHeader] ?? ""));
      const hasNoPrice = !priceHeader || String(row[priceHeader] ?? "").trim() === "";
      const hasNoQuantity =
        !quantityHeader || String(row[quantityHeader] ?? "").trim() === "";
      return !(isLabel && hasNoPrice && hasNoQuantity);
    });
    const omitted = originalCount - rows.length;
    if (omitted) {
      console.log(
        `ℹ ${table}: اتخطّى ${omitted} صفوف عناوين سعر من غير بيانات صنف`
      );
    }
  }
  const dbCols = tables.get(table).filter((c) => c.is_generated !== "ALWAYS");
  const colByNorm = new Map(dbCols.map((c) => [norm(c.column_name), c]));
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const mapping = [];
  const unmatched = [];
  for (const h of headers) {
    const c = colByNorm.get(norm(h));
    if (c) mapping.push({ header: h, col: c });
    else unmatched.push(h);
  }
  if (unmatched.length) {
    problems.push(
      `${f} -> ${table}: أعمدة CSV مش لاقية مقابل: [${unmatched.join(", ")}]\n    أعمدة الجدول: [${dbCols.map((c) => c.column_name).join(", ")}]`
    );
    continue;
  }
  const missingReq = dbCols.filter(
    (c) => c.is_nullable === "NO" && !mapping.some((m) => m.col.column_name === c.column_name)
  );
  console.log(
    `✔ ${f} -> ${table}: ${rows.length} صف` +
      (missingReq.length ? `  (تنبيه NOT NULL مش في الـ CSV: ${missingReq.map((c) => c.column_name).join(", ")})` : "")
  );
  plan.push({ f, table, rows, mapping });
}

// جداول Access الأصلية اللي معندهاش ملف (للعلم بس)
const used = new Set([...plan.map((p) => p.table), ...skippedTables]);
const appTables = new Set(["residents", "resident_stays", "resident_legacy_links"]);
const noFile = [...tables.keys()].filter(
  (t) => !used.has(t) && !PROTECTED.has(t) && !appTables.has(t) && !/_(links|voids|payments|movements|events|access)$/.test(t) && !t.startsWith("inventory_") && !t.startsWith("user_") && !t.startsWith("staff_")
);
if (noFile.length) warnings.push(`جداول في Neon مفيش ليها ملف CSV: ${noFile.join(", ")}`);

// ---------- ترتيب حسب الـ foreign keys ----------
const { rows: fks } = await client.query(`
  SELECT c.relname AS child, p.relname AS parent
  FROM pg_constraint k
  JOIN pg_class c ON c.oid=k.conrelid JOIN pg_class p ON p.oid=k.confrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE k.contype='f' AND n.nspname='public' AND c.oid<>p.oid`);
const names = new Set(plan.map((p) => p.table));
const deps = new Map(plan.map((p) => [p.table, new Set()]));
for (const { child, parent } of fks) if (names.has(child) && names.has(parent)) deps.get(child).add(parent);
const ordered = [];
const left = new Map(deps);
while (left.size) {
  const ready = [...left].filter(([, d]) => [...d].every((x) => !left.has(x))).map(([t]) => t);
  if (!ready.length) { warnings.push("فيه علاقات دائرية، اتكمّل بالترتيب الحالي"); ordered.push(...left.keys()); break; }
  for (const t of ready) { ordered.push(t); left.delete(t); }
}
plan = ordered.map((t) => plan.find((p) => p.table === t));

problems.push(...(await applyDerivations({ plan, client, tables, norm })));

for (const w of warnings) console.log("⚠ " + w);
if (problems.length) {
  console.error("\n❌ مشاكل لازم تتحل (محدش اتكتب في الداتا بيز):\n");
  for (const p of problems) console.error(" - " + p + "\n");
  console.error("لو الملفات اللي مالهاش جدول مش مهمة استخدم --skip-unmatched");
  await client.end();
  process.exit(1);
}
console.log("\nترتيب الرفع: " + plan.map((p) => p.table).join(" → "));
if (DRY) {
  console.log("\nDry run خلص، كل حاجة متطابقة. شغّله من غير --dry للرفع.");
  await client.end();
  process.exit(0);
}

// ---------- الرفع في transaction واحدة ----------
const q = (id) => `"${id.replace(/"/g, '""')}"`;
try {
  await client.query("BEGIN");
  if (TRUNCATE) {
    await client.query(`TRUNCATE ${plan.map((p) => `public.${q(p.table)}`).join(", ")} RESTART IDENTITY`);
    console.log("تم تفريغ الجداول قبل الرفع.");
  }
  for (const { f, table, rows, mapping } of plan) {
    if (!rows.length) continue;
    const cols = mapping.map((m) => q(m.col.column_name)).join(", ");
    const batch = Math.max(1, Math.min(500, Math.floor(60000 / mapping.length)));
    for (let i = 0; i < rows.length; i += batch) {
      const chunk = rows.slice(i, i + batch);
      const values = [];
      const ph = chunk.map((row, r) => {
        const one = mapping.map((m, c) => {
          try { values.push(convert(row[m.header], m.col)); }
          catch (e) { throw new Error(`${f} سطر ${i + r + 2}: ${e.message}`); }
          return `$${r * mapping.length + c + 1}`;
        });
        return `(${one.join(",")})`;
      });
      try {
        await client.query(
          `INSERT INTO public.${q(table)} (${cols}) OVERRIDING SYSTEM VALUE VALUES ${ph.join(",")}`,
          values
        );
      } catch (e) {
        throw new Error(`${f} -> ${table} (الصفوف ${i + 2} إلى ${i + chunk.length + 1}): ${e.message}`);
      }
    }
    for (const m of mapping) {
      const { rows: s } = await client.query(`SELECT pg_get_serial_sequence($1,$2) AS seq`, [
        `public.${q(table)}`, m.col.column_name,
      ]);
      if (s[0]?.seq) {
        const c = q(m.col.column_name), t = `public.${q(table)}`;
        await client.query(
          `SELECT setval($1, COALESCE((SELECT MAX(${c}) FROM ${t}),1), (SELECT MAX(${c}) IS NOT NULL FROM ${t}))`,
          [s[0].seq]
        );
      }
    }
    const { rows: cnt } = await client.query(`SELECT count(*)::int AS n FROM public.${q(table)}`);
    console.log(`⬆ ${table}: اترفع ${rows.length}، العدد دلوقتي ${cnt[0].n}`);
  }
  await client.query("COMMIT");
  console.log("\n✅ تم الرفع بنجاح.");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("\n❌ فشل الرفع واتعمل ROLLBACK (مفيش حاجة اتكتبت):\n", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}