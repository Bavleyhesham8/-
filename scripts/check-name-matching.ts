import fs from "node:fs";
// This one-off local inspection script uses pg without the optional @types/pg package.
// @ts-expect-error Runtime inspection only; no pg declarations are shipped in this repo.
import pg from "pg";
import { findResidentByName } from "../src/lib/resident-matching";

async function main() {
  const env = fs.readFileSync(".env.local", "utf8");
  const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
  if (!url) throw new Error("no url");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const residents = (
    await client.query(
      `select id, file_number as "fileNumber", name, resident_number as "residentNumber" from residents order by name`,
    )
  ).rows;
  const treatment = (
    await client.query(
      `select "رقم النزيل" as n, "اسم النزيل" as name from "راس العلاج"`,
    )
  ).rows;
  const finance = (
    await client.query(
      `select "رقم النزيل" as n, "اسم النزيل" as name from "راس النزيل"`,
    )
  ).rows;

  for (const [label, rows] of [
    ["TREATMENT", treatment],
    ["FINANCE", finance],
  ] as const) {
    console.log(`\n${label}`);
    for (const row of rows) {
      const match = findResidentByName(row.name, residents, row.n);
      console.log(
        `${row.n} ${row.name} -> ${
          match
            ? `${match.resident.name} [${match.resident.residentNumber}] ${match.score.toFixed(2)}${match.ambiguous ? " AMBIGUOUS" : ""}`
            : "UNMATCHED"
        }`,
      );
    }
  }
  await client.end();
}

void main();
