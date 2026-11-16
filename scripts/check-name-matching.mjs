import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const client = new pg.Client({ connectionString: url });
await client.connect();

const residents = (
  await client.query(
    `select id, file_number, name, resident_number from residents order by name`,
  )
).rows;
const treatment = (
  await client.query(`select "رقم النزيل" as n, "اسم النزيل" as name from "راس العلاج"`)
).rows;
const finance = (
  await client.query(`select "رقم النزيل" as n, "اسم النزيل" as name from "راس النزيل"`)
).rows;

function normalize(value) {
  return (value ?? "")
    .normalize("NFC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function tokens(value) {
  return normalize(value).split(" ").filter(Boolean);
}
function lev(a, b) {
  const m = a.length,
    n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[m][n];
}
function tokenMatch(a, b) {
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)))
    return 0.92;
  const dist = lev(a, b);
  const ratio = 1 - dist / Math.max(a.length, b.length);
  if (ratio >= 0.8) return ratio;
  return 0;
}
function score(a, b) {
  const ta = tokens(a),
    tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  if (ta.join(" ") === tb.join(" ")) return 1;
  let matched = 0;
  const used = new Set();
  for (const x of ta) {
    let best = 0,
      bi = -1;
    for (let i = 0; i < tb.length; i++) {
      if (used.has(i)) continue;
      const s = tokenMatch(x, tb[i]);
      if (s > best) (best = s), (bi = i);
    }
    if (best >= 0.8) {
      matched += best;
      used.add(bi);
    }
  }
  const containment = matched / Math.max(ta.length, tb.length);
  const coverage = matched / Math.min(ta.length, tb.length);
  return containment * 0.6 + coverage * 0.4;
}

function best(name, number) {
  return residents
    .map((r) => {
      let s = score(name, r.name);
      if (number && String(r.resident_number) === String(number)) s += 0.08;
      return { ...r, score: s };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

console.log("TREATMENT");
for (const row of treatment) {
  const top = best(row.name, row.n);
  console.log(
    `${row.n} ${row.name} -> ${top.map((r) => `${r.name} [${r.resident_number}] ${r.score.toFixed(2)}`).join(" | ")}`,
  );
}
console.log("\nFINANCE");
for (const row of finance) {
  const top = best(row.name, row.n);
  console.log(
    `${row.n} ${row.name} -> ${top.map((r) => `${r.name} [${r.resident_number}] ${r.score.toFixed(2)}`).join(" | ")}`,
  );
}
await client.end();
