import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const client = new pg.Client({ connectionString: url });
await client.connect();
const q = async (label, sql) => {
  const res = await client.query(sql);
  console.log(`\n=== ${label} (${res.rows.length}) ===`);
  console.table(res.rows);
};
await q("nam distinct Achesh", `select "Achesh", count(*) from nam group by 1 order by 2 desc`);
await q("nam distinct Fathr", `select "Fathr", count(*) from nam group by 1 order by 2 desc`);
await q("nam distinct sak", `select "sak", count(*) from nam group by 1 order by 2 desc`);
await q("nam distinct room", `select "Num_ROm", count(*) from nam group by 1 order by 2 desc`);
await q("nam distinct Mon", `select "Mon", count(*) from nam group by 1 order by 2 desc`);
await q("nam distinct mmon", `select "mmon", count(*) from nam group by 1 order by 2 desc`);
await q("nam all", `select "ID","num","nam","sak","khn","Achesh","Fathr","Num_ROm","Mon","mmon","Alt","ALF","N-AL","ALm","F_N","Nom" from nam order by "ID"`);
await client.end();
