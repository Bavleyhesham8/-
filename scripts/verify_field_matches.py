import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect

dsn = load_pg_dsn()
pg = pg_connect(dsn)

with pg.cursor() as cur:
    cur.execute("""
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN n.nam = r.name THEN 1 ELSE 0 END) as name_match,
            SUM(CASE WHEN COALESCE(TO_CHAR(n."Dat_Brth", 'YYYY-MM-DD'), '') = COALESCE(TO_CHAR(r.birth_date, 'YYYY-MM-DD'), '') THEN 1 ELSE 0 END) as birth_date_match,
            SUM(CASE WHEN COALESCE(n.tal, '') = COALESCE(r.phone, '') THEN 1 ELSE 0 END) as phone_match,
            SUM(CASE WHEN COALESCE(n."Adrres", '') = COALESCE(r.address, '') THEN 1 ELSE 0 END) as address_match,
            SUM(CASE WHEN COALESCE(n.mar, '') = COALESCE(r.district, '') THEN 1 ELSE 0 END) as district_match,
            SUM(CASE WHEN COALESCE(n."Con", '') = COALESCE(r.governorate, '') THEN 1 ELSE 0 END) as gov_match,
            SUM(CASE WHEN COALESCE(n."num_A", '') = COALESCE(r.national_id, '') THEN 1 ELSE 0 END) as nat_id_match,
            SUM(CASE WHEN COALESCE(n."Nom", '') = COALESCE(r.resident_number, '') THEN 1 ELSE 0 END) as res_num_match,
            SUM(CASE WHEN COALESCE(n."khn", false) = r.graduated THEN 1 ELSE 0 END) as graduated_match,
            SUM(CASE WHEN COALESCE(n."no_A", false) = r.incomplete_stay THEN 1 ELSE 0 END) as incomplete_match,
            SUM(CASE WHEN COALESCE(n."Mot", false) = r.follow_up THEN 1 ELSE 0 END) as followup_match,
            SUM(CASE WHEN COALESCE(n."ImagePath", '') = COALESCE(r.image_path, '') THEN 1 ELSE 0 END) as image_match
        FROM nam n
        JOIN resident_legacy_links l ON n."ID" = l.legacy_resident_id
        JOIN residents r ON l.resident_id = r.id
    """)
    res = cur.fetchone()
    cols = [d[0] for d in cur.description]
    print("=== FIELD-BY-FIELD MATCH RESULTS ===")
    for c, val in zip(cols, res):
        print(f"  {c}: {val}/55")

pg.close()

