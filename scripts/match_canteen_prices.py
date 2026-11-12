import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect
import unicodedata, re

def norm(s):
    if not s: return ""
    s = unicodedata.normalize("NFKD", s.strip())
    s = re.sub(r"[\u064B-\u065F\u0670]", "", s)
    s = re.sub(r"[إأآا]", "ا", s)
    s = re.sub(r"ى", "ي", s)
    s = re.sub(r"ة", "ه", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s

dsn = load_pg_dsn()
pg = pg_connect(dsn)
with pg.cursor() as cur:
    cur.execute('SELECT "رقم الصنف", "اسم الصنف", "السعر" FROM كانتين ORDER BY "رقم الصنف"')
    canteen = cur.fetchall()
    cur.execute('SELECT "الصنف", "السعر" FROM "مشتريات النزلاء" WHERE "السعر" > 0')
    purchases = cur.fetchall()
    purch_map = {norm(p[0]): p[1] for p in purchases}

    cur.execute('SELECT "الصنف", "السعر"::float FROM "اطراف الفاتورة" WHERE "السعر" ~ \'^[0-9]+\' AND "السعر"::float > 0')
    inv_lines = cur.fetchall()
    for l in inv_lines:
        k = norm(l[0])
        if k not in purch_map:
            purch_map[k] = l[1]

    matched = []
    unmatched = []
    for c in canteen:
        cnum, cname, cur_price = c
        n = norm(cname)
        price = purch_map.get(n)
        if price is None:
            # try substring
            for pk, pv in purch_map.items():
                if (pk in n or n in pk) and len(pk) > 3:
                    price = pv
                    break
        if price:
            matched.append((cnum, cname, price))
        else:
            unmatched.append((cnum, cname))

    print(f"Total matched: {len(matched)} / 55")
    print(f"Unmatched: {len(unmatched)}")
    for u in unmatched:
        print(f"  unmatched: {u[0]} - {u[1]}")

pg.close()

