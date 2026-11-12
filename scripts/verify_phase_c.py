import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect

dsn = load_pg_dsn()
pg = pg_connect(dsn)
tables = [
    'residents', 'resident_stays', 'resident_legacy_links',
    'nam', 'راس الفاتورة', 'اطراف الفاتورة', 'import_quarantine'
]
with pg.cursor() as cur:
    for t in tables:
        try:
            cur.execute(f'SELECT COUNT(*) FROM "{t}"')
            print(f'{t}: {cur.fetchone()[0]}')
        except Exception as e:
            print(f'{t}: ERROR {e}')
pg.close()

