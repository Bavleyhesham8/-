import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect

dsn = load_pg_dsn()
pg = pg_connect(dsn)
tables = [
    'الكنيسة التابع لها', 'المحافظة', 'الفئة', 'الفئه', 'اليوم', 'رقم الفيلا',
    'nam', 'الموظفين', 'اطراف الموظفين', 'راس العلاج', 'اطراف العلاج',
    'راس النزيل', 'اطراف النزيل', 'كانتين', 'مشتريات النزلاء', 'راس الكانتين',
    'طرف الكانين', 'الاصناف', 'راس المخزن', 'اطراف المخزن', 'راس العهدة',
    'العهدة', 'الاصناف / الفئة', 'راس الثلاجة', 'اطراف الثلاجة',
    'فواتير بيع اللحوم', 'اطراف فواتير البيع', 'راس الفاتورة', 'اطراف الفاتورة'
]
with pg.cursor() as cur:
    for t in tables:
        try:
            cur.execute(f'SELECT COUNT(*) FROM "{t}"')
            print(f'{t}: {cur.fetchone()[0]}')
        except Exception as e:
            print(f'{t}: ERROR {e}')
pg.close()
