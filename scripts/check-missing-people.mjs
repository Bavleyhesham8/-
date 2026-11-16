import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const client = new pg.Client({ connectionString: url });
await client.connect();

const names = [
  "يعقوب إبراهيم متي",
  "شفيق بكر شفيق",
  "هانى جرجس",
  "جورج حنا",
  "بيشوى اشرف",
  "كريم هلال",
  "ملاك فيكتور",
  "سامح بخيت شجع",
];
for (const name of names) {
  const first = name.split(" ")[0];
  const result = await client.query(
    `select "ID", "nam", "Nom", "num", "sak" from nam where "nam" like $1 or "Nom" like $1`,
    [`%${first}%`],
  );
  console.log(name, JSON.stringify(result.rows));
}
const count = (await client.query(`select count(*)::int n from nam`)).rows[0];
const residents = (await client.query(`select count(*)::int n from residents`)).rows[0];
console.log({ nam: count.n, residents: residents.n });
await client.end();
