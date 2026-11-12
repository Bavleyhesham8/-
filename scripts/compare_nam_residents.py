import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect

dsn = load_pg_dsn()
pg = pg_connect(dsn)
with pg.cursor() as cur:
    cur.execute("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='nam'
        ORDER BY ordinal_position
    """)
    nam_cols = cur.fetchall()
    cur.execute("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='residents'
        ORDER BY ordinal_position
    """)
    res_cols = cur.fetchall()

print(f"=== NAM COLUMNS ({len(nam_cols)}) ===")
for c in nam_cols:
    print(f"  {c[0]}: {c[1]} (nullable={c[2]})")

print(f"\n=== RESIDENTS COLUMNS ({len(res_cols)}) ===")
for c in res_cols:
    print(f"  {c[0]}: {c[1]} (nullable={c[2]})")
pg.close()

