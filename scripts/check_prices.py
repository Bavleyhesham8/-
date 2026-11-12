import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect

dsn = load_pg_dsn()
pg = pg_connect(dsn)
with pg.cursor() as cur:
    print("=== كانتين (canteenProducts) ===")
    cur.execute('SELECT "رقم الصنف", "اسم الصنف", "السعر" FROM كانتين WHERE "السعر" > 0 LIMIT 10')
    print("Positive prices in كانتين:", cur.fetchall())
    cur.execute('SELECT COUNT(*), SUM(CASE WHEN "السعر" = 0 OR "السعر" IS NULL THEN 1 ELSE 0 END) FROM كانتين')
    print("Zero price count in كانتين:", cur.fetchone())

    print("\n=== مشتريات النزلاء (residentPurchases) ===")
    cur.execute('SELECT COUNT(*), SUM(CASE WHEN "السعر" = 0 OR "السعر" IS NULL THEN 1 ELSE 0 END) FROM "مشتريات النزلاء"')
    print("Zero price count in مشتريات النزلاء:", cur.fetchone())
    cur.execute('SELECT "ID", "الصنف", "السعر" FROM "مشتريات النزلاء" WHERE "السعر" > 0 LIMIT 10')
    print("Sample positive prices in مشتريات النزلاء:", cur.fetchall())

    print("\n=== راس المخزن (warehouseHeaders) ===")
    cur.execute('SELECT COUNT(*), SUM(CASE WHEN "السعر" = 0 OR "السعر" IS NULL THEN 1 ELSE 0 END) FROM "راس المخزن"')
    print("Zero price count in راس المخزن:", cur.fetchone())

    print("\n=== الاصناف / الفئة (refrigeratorItemCatalog) ===")
    cur.execute('SELECT COUNT(*), SUM(CASE WHEN "السعر" = 0 OR "السعر" IS NULL THEN 1 ELSE 0 END) FROM "الاصناف / الفئة"')
    print("Zero price count in الاصناف / الفئة:", cur.fetchone())

pg.close()

