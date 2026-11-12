import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect

dsn = load_pg_dsn()
pg = pg_connect(dsn)
with pg.cursor() as cur:
    cur.execute('SELECT "ID", num, "F_N", "Nom" FROM nam WHERE num IS NULL ORDER BY "ID"')
    for r in cur.fetchall():
        print(f"ID={r[0]}: num={r[1]}, F_N={r[2]}, Nom={r[3]}")
pg.close()

