import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect

dsn = load_pg_dsn()
pg = pg_connect(dsn)
with pg.cursor() as cur:
    cur.execute('SELECT "ID", "الصنف", "السعر" FROM "مشتريات النزلاء" ORDER BY "ID"')
    for r in cur.fetchall():
        print(f"ID={r[0]}: {r[1]} -> {r[2]}")
pg.close()

