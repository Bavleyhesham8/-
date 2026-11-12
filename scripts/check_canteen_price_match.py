import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect

dsn = load_pg_dsn()
pg = pg_connect(dsn)
with pg.cursor() as cur:
    cur.execute("""
        SELECT c."رقم الصنف", c."اسم الصنف", p."السعر"
        FROM كانتين c
        JOIN "مشتريات النزلاء" p ON c."اسم الصنف" = p."الصنف"
        WHERE p."السعر" > 0
    """)
    matches = cur.fetchall()
    print(f"Direct name matches between كانتين and مشتريات النزلاء: {len(matches)} out of 55")
    for m in matches[:10]:
        print(f"  {m[0]}: {m[1]} -> price {m[2]}")
pg.close()

