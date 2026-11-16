import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect, access_connect, fetch_all, coerce_date, coerce_str, quarantine

dsn = load_pg_dsn()
pg = pg_connect(dsn)
pg.autocommit = False

ac = access_connect()
_, headers = fetch_all(ac, 'راس الفاتورة')
_, lines = fetch_all(ac, 'اطراف الفاتورة')
ac.close()

try:
    cur = pg.cursor()

    # Quarantine headers 2 and 3 because تاريخ الفاتورة is NULL
    for h in headers:
        if not h.get('تاريخ الفاتورة'):
            quarantine(pg, 'راس الفاتورة', h['ID'], h, 'تاريخ الفاتورة is NULL (NOT NULL constraint)', dry=False)

    # Process lines
    imported = 0
    for l in lines:
        lid = l['ID']
        inv_num = l['رقم']
        ldate = coerce_date(l.get('التاريخ'))
        price = int(float(l.get('السعر') or 0))
        qty = int(float(l.get('الكمية') or 1))
        item = coerce_str(l.get('الصنف'))
        total = price * qty

        if not ldate:
            quarantine(pg, 'اطراف الفاتورة', lid, l, 'التاريخ is NULL (NOT NULL constraint)', dry=False)
            continue
        if total <= 0:
            quarantine(pg, 'اطراف الفاتورة', lid, l, f'الاجمالى={total} violates check > 0', dry=False)
            continue

        cur.execute("""
            INSERT INTO "اطراف الفاتورة" (
              "ID", "الرصيد", "الفئه", "الفئة", "الصنف", "السعر",
              "الكمية", "الاجمالى", "التاريخ", "اليوم", "الشهر", "رقم"
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT ("ID") DO UPDATE SET
              "الصنف"=EXCLUDED."الصنف", "الاجمالى"=EXCLUDED."الاجمالى"
        """, (
            lid, 0, coerce_str(l.get('الفئه')), None, item,
            str(price), str(qty), total, ldate,
            coerce_str(l.get('اليوم')), coerce_str(l.get('الشهر')), inv_num
        ))
        imported += 1

    pg.commit()
    print(f"Done. Imported invoice lines: {imported}, headers/lines quarantined as per rules.")
except Exception as e:
    pg.rollback()
    print("Error:", e)
    raise
finally:
    pg.close()

