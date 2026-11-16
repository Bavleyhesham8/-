import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect

dsn = load_pg_dsn()
pg = pg_connect(dsn)
with pg.cursor() as cur:
    cur.execute('SELECT "ID", num, "F_N", "Nom" FROM nam ORDER BY "ID"')
    rows = cur.fetchall()
    nums = [r[1] for r in rows if r[1]]
    print(f'Total rows: {len(rows)}, Non-null num: {len(nums)}, Unique nums: {len(set(nums))}')
    null_nums = [r[0] for r in rows if not r[1]]
    print('IDs with NULL num:', null_nums)
pg.close()

