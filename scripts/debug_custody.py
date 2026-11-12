import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import access_connect, fetch_all

ac = access_connect()
_, custody_headers = fetch_all(ac, 'راس العهدة')
_, staff = fetch_all(ac, 'الموظفين')
ac.close()

lines = []
lines.append('=== STAFF ===')
for s in staff:
    lines.append(f"num={s.get('رقم الموظف')} -- name={repr(s.get('اسم الموظف / العامل'))}")

lines.append('\n=== CUSTODY HEADERS ===')
for h in custody_headers:
    lines.append(f"cnum={h.get('رقم العهدة')} -- text={repr(h.get('العهدة'))}")

Path('reports/custody_debug.txt').write_text('\n'.join(lines), encoding='utf-8')
print('Wrote reports/custody_debug.txt. Headers count:', len(custody_headers), 'Staff count:', len(staff))
