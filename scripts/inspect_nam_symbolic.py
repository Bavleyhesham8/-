import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect

dsn = load_pg_dsn()
pg = pg_connect(dsn)

symbolic_cols = [
    'num', 'num_A', 'Con', 'mar', 'sak', 'khn', 'no_A', 'Mot',
    'Alt', 'ALF', 'N-AL', 'ALm', 'Phot', 'Num_ROm', 'Mon', 'mmon',
    'F_N', 'Nom', 'Achesh', 'Fathr'
]

with pg.cursor() as cur:
    for c in symbolic_cols:
        cur.execute(f'SELECT COUNT(*) FROM nam WHERE "{c}" IS NOT NULL')
        non_null = cur.fetchone()[0]
        cur.execute(f'SELECT DISTINCT "{c}" FROM nam WHERE "{c}" IS NOT NULL LIMIT 5')
        distincts = [r[0] for r in cur.fetchall()]
        # mask any string that looks like a person's name
        safe_samples = []
        for d in distincts:
            if isinstance(d, bool):
                safe_samples.append(str(d))
            elif isinstance(d, (int, float)):
                safe_samples.append(str(d))
            else:
                s = str(d).strip()
                if len(s.split()) > 1 and not any(ch.isdigit() for ch in s):
                    safe_samples.append(f'<TEXT_{len(s)}>')
                else:
                    safe_samples.append(repr(s))
        print(f'{c}: non_null={non_null}/55, samples={safe_samples}')
pg.close()

