"""
Phase B: Import Microsoft Access database to Neon PostgreSQL.
Run with --dry (default) to test; use --apply to actually write.

Groups:
  A: lookups + nam + staff
  B: warehouse (الاصناف, راس المخزن, اطراف المخزن)
  C: custody (راس العهدة, العهدة)
  D: refrigerator + meat sales (الاصناف/الفئة, راس الثلاجة, اطراف الثلاجة, فواتير بيع اللحوم, اطراف فواتير البيع)
  E: canteen (كانتين, مشتريات النزلاء, راس الكانتين, اطراف الكانتين)
  F: resident invoices (راس الفاتورة, اطراف الفاتورة)
  G: treatment (راس العلاج, اطراف العلاج)
  H: resident finance (راس النزيل, اطراف النزيل)
  I: staff leave (اطراف الموظفين)
  J: villa numbers + day lookup
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, date
from pathlib import Path
import unicodedata

# --- deps ---
try:
    import pyodbc
except ImportError:
    sys.exit("pip install pyodbc")
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("pip install psycopg2-binary")
try:
    from dotenv import dotenv_values
except ImportError:
    sys.exit("pip install python-dotenv")

# ── config ───────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
ROOT = SCRIPT_DIR.parent
ENV_PATH = ROOT / ".env.local"
ACCESS_DB = r"D:\قيثاره\قاعدة بيانات مركز قيثارة داود_Backup.accdb"
REPORTS_DIR = ROOT / "reports"
MAPPINGS_DIR = ROOT / "mappings"
REPORTS_DIR.mkdir(exist_ok=True)
MAPPINGS_DIR.mkdir(exist_ok=True)

CONN_TIMEOUT = 30
MAX_RETRIES = 3

# ── helpers ───────────────────────────────────────────────────────────────────

def load_pg_dsn():
    env = dotenv_values(str(ENV_PATH))
    url = env.get("DATABASE_URL") or env.get("POSTGRES_URL") or env.get("NEON_DATABASE_URL")
    if not url:
        # try DIRECT_URL as fallback
        url = env.get("DIRECT_URL")
    if not url:
        sys.exit("DATABASE_URL not found in .env.local")
    # Print host without password
    m = re.search(r'@([^/]+)/', url)
    if m:
        print(f"[CONFIG] Neon host: {m.group(1)}")
    return url


def pg_connect(dsn: str):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            conn = psycopg2.connect(dsn, connect_timeout=CONN_TIMEOUT)
            conn.autocommit = False
            return conn
        except Exception as e:
            if attempt == MAX_RETRIES:
                raise
            if any(x in str(e) for x in ("ETIMEDOUT", "ECONNRESET", "timeout", "Connection refused")):
                print(f"  [RETRY {attempt}] {e}")
                time.sleep(2 ** attempt)
            else:
                raise


def access_connect():
    drv = "Microsoft Access Driver (*.mdb, *.accdb)"
    cs = f"Driver={{{drv}}};DBQ={ACCESS_DB};"
    return pyodbc.connect(cs, timeout=30)


def fetch_all(ac, table, order_by="ID"):
    cur = ac.cursor()
    try:
        cur.execute(f"SELECT * FROM [{table}] ORDER BY [{order_by}]")
    except Exception:
        cur.execute(f"SELECT * FROM [{table}]")
    cols = [c[0] for c in cur.description]
    rows = cur.fetchall()
    return cols, [dict(zip(cols, r)) for r in rows]


def val(row, *keys, default=None):
    for k in keys:
        v = row.get(k)
        if v is not None and v != "":
            return v
    return default


def coerce_str(v) -> str:
    if v is None:
        return ""
    return str(v).strip()


def coerce_float(v):
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def coerce_int(v):
    if v is None:
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def coerce_date(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if not s:
        return None
    # try common formats
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None  # unrecognised → NULL


def has_fffd(s) -> bool:
    return s is not None and "\ufffd" in str(s)


def any_fffd(row: dict) -> bool:
    return any(has_fffd(v) for v in row.values())


def quarantine(pg, source_table, source_id, payload: dict, reason: str, dry: bool):
    if dry:
        print(f"  [QUARANTINE DRY] {source_table}#{source_id}: {reason}")
        return
    # remove non-serialisable
    safe = {k: (v.isoformat() if isinstance(v, (datetime, date)) else v)
            for k, v in payload.items()}
    with pg.cursor() as cur:
        cur.execute("""
            INSERT INTO import_quarantine (source_table, source_id, payload, reason, status)
            VALUES (%s, %s, %s, %s, 'pending')
            ON CONFLICT (source_table, source_id) DO NOTHING
        """, (source_table, str(source_id), json.dumps(safe, ensure_ascii=False), reason))


def upsert_one(pg, sql, params, dry, label=""):
    if dry:
        print(f"  [DRY] {label}")
        return
    with pg.cursor() as cur:
        cur.execute(sql, params)


def report(name, lines):
    path = REPORTS_DIR / name
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  [REPORT] written: reports/{name}")


# ── GROUP A: lookups + nam + staff ───────────────────────────────────────────

def import_group_a(ac, pg, dry):
    print("\n=== GROUP A: lookups + nam + staff ===")
    counters = {}

    # 1. الكنيسة التابع لها
    _, rows = fetch_all(ac, "الكنيسة التابع لها")
    ok = sk = 0
    for r in rows:
        if any_fffd(r):
            quarantine(pg, "الكنيسة التابع لها", r["ID"], r, "U+FFFD in row", dry)
            sk += 1; continue
        upsert_one(pg, """
            INSERT INTO "الكنيسة التابع لها" ("ID", num, nam, "Achesh", "Fathr")
            VALUES (%s,%s,%s,%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET num=EXCLUDED.num, nam=EXCLUDED.nam,
              "Achesh"=EXCLUDED."Achesh", "Fathr"=EXCLUDED."Fathr"
        """, (r["ID"], coerce_str(r.get("num")), coerce_str(r.get("nam")),
              coerce_str(r.get("Achesh")), coerce_str(r.get("Fathr"))), dry, f"church {r['ID']}")
        ok += 1
    counters["الكنيسة"] = {"ok": ok, "skip": sk}

    # 2. المحافظة
    _, rows = fetch_all(ac, "المحافظة")
    ok = sk = 0
    for r in rows:
        upsert_one(pg, """
            INSERT INTO "المحافظة" ("ID", "Cont", "Cet")
            VALUES (%s,%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET "Cont"=EXCLUDED."Cont", "Cet"=EXCLUDED."Cet"
        """, (r["ID"], coerce_str(r.get("Cont")), coerce_str(r.get("Cet"))), dry, f"gov {r['ID']}")
        ok += 1
    counters["المحافظة"] = {"ok": ok, "skip": sk}

    # 3. الفئة
    _, rows = fetch_all(ac, "الفئة")
    ok = 0
    for r in rows:
        upsert_one(pg, """
            INSERT INTO "الفئة" ("ID", "الفئة") VALUES (%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET "الفئة"=EXCLUDED."الفئة"
        """, (r["ID"], coerce_str(r.get("الفئة"))), dry, f"inv_cat {r['ID']}")
        ok += 1
    counters["الفئة"] = {"ok": ok}

    # 4. الفئه (alternate)
    _, rows = fetch_all(ac, "الفئه")
    ok = 0
    for r in rows:
        upsert_one(pg, """
            INSERT INTO "الفئه" ("ID", "الفئة") VALUES (%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET "الفئة"=EXCLUDED."الفئة"
        """, (r["ID"], coerce_str(r.get("الفئة"))), dry, f"inv_cat_alt {r['ID']}")
        ok += 1
    counters["الفئه"] = {"ok": ok}

    # 5. اليوم
    _, rows = fetch_all(ac, "اليوم")
    ok = 0
    for r in rows:
        upsert_one(pg, """
            INSERT INTO "اليوم" ("ID", "اليوم") VALUES (%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET "اليوم"=EXCLUDED."اليوم"
        """, (r["ID"], coerce_str(r.get("اليوم"))), dry, f"day {r['ID']}")
        ok += 1
    counters["اليوم"] = {"ok": ok}

    # 6. رقم الفيلا
    _, rows = fetch_all(ac, "رقم الفيلا")
    ok = sk = 0
    for r in rows:
        upsert_one(pg, """
            INSERT INTO "رقم الفيلا" ("ID", "N_V") VALUES (%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET "N_V"=EXCLUDED."N_V"
        """, (r["ID"], coerce_str(r.get("N_V"))), dry, f"villa {r['ID']}")
        ok += 1
    counters["رقم الفيلا"] = {"ok": ok}

    # 7. الموظفين (staff employees lookup)
    _, rows = fetch_all(ac, "الموظفين", order_by="رقم الموظف")
    ok = sk = 0
    for r in rows:
        emp_num = coerce_int(r.get("رقم الموظف"))
        if emp_num is None:
            quarantine(pg, "الموظفين", r.get("ID", "?"), r, "رقم الموظف is NULL", dry)
            sk += 1; continue
        upsert_one(pg, """
            INSERT INTO "الموظفين" ("ID", "رقم الموظف", "اسم الموظف / العامل")
            VALUES (%s,%s,%s)
            ON CONFLICT ("رقم الموظف") DO UPDATE SET
              "اسم الموظف / العامل"=EXCLUDED."اسم الموظف / العامل",
              "ID"=EXCLUDED."ID"
        """, (r.get("ID"), emp_num, coerce_str(r.get("اسم الموظف / العامل"))),
            dry, f"staff_emp {emp_num}")
        ok += 1
    counters["الموظفين"] = {"ok": ok, "skip": sk}

    # 8. nam (legacy residents – 55 expected)
    cols, rows = fetch_all(ac, "nam")
    ok = sk = 0
    for r in rows:
        rid = r.get("ID")
        if rid is None:
            quarantine(pg, "nam", "NULL", r, "ID is NULL", dry)
            sk += 1; continue
        if any_fffd(r):
            quarantine(pg, "nam", rid, r, "U+FFFD in row", dry)
            sk += 1; continue

        def s(k): return coerce_str(r.get(k))
        def d(k): return coerce_date(r.get(k))

        upsert_one(pg, """
            INSERT INTO nam (
              "ID", num, nam, "Dat_Brth", "Adrres", tal, "num_A", "Con", mar,
              "Dat_Ent", sak, khn, "no_A", "Mot", "Alt", "ALF", "N-AL", "Dat_AO",
              "ALm", "Phot", "Num_ROm", "Mon", "ImagePath", mmon, "F_N", "Nom",
              "Achesh", "Fathr",
              "المؤهل الدراسى", "الخبرات السابقة", "اماكن العمل السابقة",
              "دخول النزيل", "صلة القرابة", "من االدرجة", "ساعة الدخول",
              "طريقة الخروج", "رقم الطبيب المعالج", "عنوان الطبيب المعالج",
              "فريق التأهل والارشاد", "مرحلة التأهيل والتعافى", "المدرب", "المشرف", "المحاضر"
            ) VALUES (
              %s,%s,%s,%s,%s,%s,%s,%s,%s,
              %s,%s,%s,%s,%s,%s,%s,%s,%s,
              %s,%s,%s,%s,%s,%s,%s,%s,
              %s,%s,%s,%s,%s,%s,%s,%s,%s,
              %s,%s,%s,%s,%s,%s,%s,%s
            )
            ON CONFLICT ("ID") DO UPDATE SET
              num=EXCLUDED.num, nam=EXCLUDED.nam, "Dat_Brth"=EXCLUDED."Dat_Brth",
              "Adrres"=EXCLUDED."Adrres", tal=EXCLUDED.tal, "num_A"=EXCLUDED."num_A",
              "Con"=EXCLUDED."Con", mar=EXCLUDED.mar, "Dat_Ent"=EXCLUDED."Dat_Ent",
              sak=EXCLUDED.sak, khn=EXCLUDED.khn, "no_A"=EXCLUDED."no_A",
              "Mot"=EXCLUDED."Mot", "Alt"=EXCLUDED."Alt", "ALF"=EXCLUDED."ALF",
              "N-AL"=EXCLUDED."N-AL", "Dat_AO"=EXCLUDED."Dat_AO", "ALm"=EXCLUDED."ALm",
              "Phot"=EXCLUDED."Phot", "Num_ROm"=EXCLUDED."Num_ROm", "Mon"=EXCLUDED."Mon",
              "ImagePath"=EXCLUDED."ImagePath", mmon=EXCLUDED.mmon, "F_N"=EXCLUDED."F_N",
              "Nom"=EXCLUDED."Nom", "Achesh"=EXCLUDED."Achesh", "Fathr"=EXCLUDED."Fathr",
              "المؤهل الدراسى"=EXCLUDED."المؤهل الدراسى",
              "الخبرات السابقة"=EXCLUDED."الخبرات السابقة",
              "اماكن العمل السابقة"=EXCLUDED."اماكن العمل السابقة",
              "دخول النزيل"=EXCLUDED."دخول النزيل",
              "صلة القرابة"=EXCLUDED."صلة القرابة",
              "من االدرجة"=EXCLUDED."من االدرجة",
              "ساعة الدخول"=EXCLUDED."ساعة الدخول",
              "طريقة الخروج"=EXCLUDED."طريقة الخروج",
              "رقم الطبيب المعالج"=EXCLUDED."رقم الطبيب المعالج",
              "عنوان الطبيب المعالج"=EXCLUDED."عنوان الطبيب المعالج",
              "فريق التأهل والارشاد"=EXCLUDED."فريق التأهل والارشاد",
              "مرحلة التأهيل والتعافى"=EXCLUDED."مرحلة التأهيل والتعافى",
              "المدرب"=EXCLUDED."المدرب",
              "المشرف"=EXCLUDED."المشرف",
              "المحاضر"=EXCLUDED."المحاضر"
        """, (
            rid, s("num"), s("nam"), d("Dat_Brth"), s("Adrres"), s("tal"),
            s("num_A"), s("Con"), s("mar"), d("Dat_Ent"), s("sak"),
            r.get("khn"), r.get("no_A"), r.get("Mot"),
            s("Alt"), s("ALF"), s("N-AL"), d("Dat_AO"), s("ALm"),
            s("Phot"), s("Num_ROm"), s("Mon"), s("ImagePath"), s("mmon"),
            s("F_N"), s("Nom"), s("Achesh"), s("Fathr"),
            s("المؤهل الدراسى"), s("الخبرات السابقة"), s("اماكن العمل السابقة"),
            s("دخول النزيل"), s("صلة القرابة"), s("من االدرجة"), s("ساعة الدخول"),
            s("طريقة الخروج"), s("رقم الطبيب المعالج"), s("عنوان الطبيب المعالج"),
            s("فريق التأهل والارشاد"), s("مرحلة التأهيل والتعافى"),
            s("المدرب"), s("المشرف"), s("المحاضر"),
        ), dry, f"nam {rid}")
        ok += 1
    counters["nam"] = {"ok": ok, "skip": sk}

    if not dry:
        pg.commit()

    # Verify nam count
    if not dry:
        with pg.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM nam')
            cnt = cur.fetchone()[0]
        print(f"  [VERIFY] nam rows = {cnt} (expected 55)")
        if cnt != 55:
            print(f"  [WARN] nam count mismatch: got {cnt}, expected 55")

    return counters


# ── GROUP B: warehouse ────────────────────────────────────────────────────────

def import_group_b(ac, pg, dry):
    print("\n=== GROUP B: warehouse ===")
    counters = {}

    # 1. الاصناف (warehouse catalog)
    _, rows = fetch_all(ac, "الاصناف")
    ok = sk = 0
    id_to_name = {}
    for r in rows:
        name = coerce_str(r.get("الاصناف"))
        if not name:
            quarantine(pg, "الاصناف", r["ID"], r, "اسم الصنف is empty", dry)
            sk += 1; continue
        id_to_name[r["ID"]] = name
        upsert_one(pg, """
            INSERT INTO "الاصناف" ("ID", "الاصناف") VALUES (%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET "الاصناف"=EXCLUDED."الاصناف"
        """, (r["ID"], name), dry, f"catalog {r['ID']}")
        ok += 1
    counters["الاصناف"] = {"ok": ok, "skip": sk}

    # 2. راس المخزن (warehouse headers)
    # Decision 2: IDs 73-80 without matching catalog => add as new catalog entries
    _, rows = fetch_all(ac, "راس المخزن", order_by="رقم")
    ok = sk = 0
    new_catalog_ids = []
    # Build set of existing catalog IDs
    if not dry:
        with pg.cursor() as cur:
            cur.execute('SELECT "ID" FROM "الاصناف"')
            existing_catalog = {r[0] for r in cur.fetchall()}
    else:
        existing_catalog = set(id_to_name.keys())

    for r in rows:
        item_id = r.get("ID")  # original Access ID
        item_name = coerce_str(r.get("الصنف"))
        responsible = coerce_str(r.get("المسئول")) or ""
        price = coerce_float(r.get("السعر")) or 0
        rqm = coerce_int(r.get("رقم"))  # primary key in Neon

        if not item_name:
            quarantine(pg, "راس المخزن", rqm or item_id, r, "الصنف is empty", dry)
            sk += 1; continue

        # Find matching catalog_id: match by name in الاصناف
        catalog_id = None
        if not dry:
            with pg.cursor() as cur:
                cur.execute('SELECT "ID" FROM "الاصناف" WHERE "الاصناف" = %s', (item_name,))
                res = cur.fetchone()
                if res:
                    catalog_id = res[0]

        if catalog_id is None:
            # Decision 2: add new catalog entry
            if dry:
                print(f"  [DRY] Would add new catalog entry: '{item_name}' for warehouse#{rqm}")
                catalog_id = -1  # placeholder for dry
            else:
                with pg.cursor() as cur:
                    # get max ID
                    cur.execute('SELECT COALESCE(MAX("ID"),0) FROM "الاصناف"')
                    max_id = cur.fetchone()[0]
                    new_id = max_id + 1
                    try:
                        cur.execute(
                            'INSERT INTO "الاصناف" ("ID","الاصناف") VALUES (%s,%s) ON CONFLICT DO NOTHING RETURNING "ID"',
                            (new_id, item_name))
                        res = cur.fetchone()
                        if res:
                            catalog_id = res[0]
                            new_catalog_ids.append((new_id, item_name))
                            print(f"  [NEW CATALOG] ID={new_id} name='{item_name}'")
                        else:
                            # name already exists, fetch it
                            cur.execute('SELECT "ID" FROM "الاصناف" WHERE "الاصناف"=%s', (item_name,))
                            catalog_id = cur.fetchone()[0]
                    except Exception as e:
                        quarantine(pg, "راس المخزن", rqm, r, f"catalog insert failed: {e}", dry)
                        sk += 1; continue

        if catalog_id is None or catalog_id == -1:
            if not dry:
                sk += 1; continue

        upsert_one(pg, """
            INSERT INTO "راس المخزن" ("ID", "رقم", "الصنف", "السعر", "المسئول", catalog_id)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT ("رقم") DO UPDATE SET
              "ID"=EXCLUDED."ID", "الصنف"=EXCLUDED."الصنف",
              "السعر"=EXCLUDED."السعر", "المسئول"=EXCLUDED."المسئول",
              catalog_id=EXCLUDED.catalog_id
        """, (item_id, rqm, item_name, price, responsible, catalog_id if catalog_id != -1 else None),
            dry, f"wh_hdr {rqm}")
        ok += 1
    counters["راس المخزن"] = {"ok": ok, "skip": sk, "new_catalog": len(new_catalog_ids)}

    if new_catalog_ids:
        print(f"  [INFO] New catalog IDs created: {[x[0] for x in new_catalog_ids]}")

    # 3. اطراف المخزن (warehouse details)
    # Decisions 5: movements 22 & 51 → needs_review=true, movement_kind='receipt'
    _, rows = fetch_all(ac, "اطراف المخزن")
    ok = sk = 0
    for r in rows:
        wid = r.get("ID")
        rqm = coerce_int(r.get("رقم"))  # FK to راس المخزن.رقم

        # Determine movement kind
        incoming = coerce_float(r.get("الوارد"))
        outgoing = coerce_float(r.get("المنصرف"))
        needs_review = False
        movement_kind = None

        if wid in (22, 51):
            movement_kind = "receipt"
            needs_review = True
        elif incoming and incoming > 0 and (not outgoing or outgoing == 0):
            movement_kind = "receipt"
        elif outgoing and outgoing > 0 and (not incoming or incoming == 0):
            movement_kind = "receipt"  # outgoing stored as receipt placeholder
        else:
            movement_kind = "receipt"  # default
            needs_review = True

        balance = coerce_float(r.get("الرصيد"))
        inc_date = coerce_date(r.get("تاريخ الوارد"))
        out_date = coerce_date(r.get("تاريخ الصرف"))
        remaining = coerce_float(r.get("المتبقى"))
        deleted = r.get("حذف") or False

        # Check balance constraints (>= 0)
        if balance is not None and balance < 0:
            balance = None; needs_review = True
        if remaining is not None and remaining < 0:
            remaining = None; needs_review = True

        upsert_one(pg, """
            INSERT INTO "اطراف المخزن"
              ("ID", "الرصيد", "الوارد", "تاريخ الوارد", "المنصرف", "تاريخ الصرف",
               "المتبقى", "حذف", "رقم", movement_kind, needs_review)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET
              "الرصيد"=EXCLUDED."الرصيد", "الوارد"=EXCLUDED."الوارد",
              "تاريخ الوارد"=EXCLUDED."تاريخ الوارد",
              "المنصرف"=EXCLUDED."المنصرف", "تاريخ الصرف"=EXCLUDED."تاريخ الصرف",
              "المتبقى"=EXCLUDED."المتبقى", "حذف"=EXCLUDED."حذف",
              "رقم"=EXCLUDED."رقم", movement_kind=EXCLUDED.movement_kind,
              needs_review=EXCLUDED.needs_review
        """, (wid, balance, incoming, inc_date, outgoing, out_date,
              remaining, deleted, rqm, movement_kind, needs_review),
            dry, f"wh_det {wid}")
        ok += 1
    counters["اطراف المخزن"] = {"ok": ok, "skip": sk}

    if not dry:
        pg.commit()
    return counters


# ── GROUP C: custody ──────────────────────────────────────────────────────────

def normalize_name(s: str) -> str:
    """Normalize Arabic name for matching: strip, collapse spaces, normalize hamza."""
    if not s:
        return ""
    s = s.strip()
    # Normalize Arabic unicode (hamza, alef variants)
    s = unicodedata.normalize("NFC", s)
    # collapse multiple spaces
    s = re.sub(r"\s+", " ", s)
    # remove common prefixes like "الموظف/"
    s = re.sub(r"^(الموظف|موظف)\s*/?\s*", "", s)
    return s.lower()


def import_group_c(ac, pg, dry):
    print("\n=== GROUP C: custody ===")
    counters = {}

    # Build staff name→number map
    _, staff_rows = fetch_all(ac, "الموظفين", order_by="رقم الموظف")
    staff_map: dict[str, int] = {}  # normalized_name → employee_number
    for r in staff_rows:
        norm = normalize_name(coerce_str(r.get("اسم الموظف / العامل")))
        if norm:
            staff_map[norm] = coerce_int(r.get("رقم الموظف"))

    # راس العهدة (custody headers)
    _, rows = fetch_all(ac, "راس العهدة", order_by="رقم العهدة")
    ok = sk = 0
    ambiguous = []
    custody_map = {}  # JSON mapping for file

    for r in rows:
        cnum = coerce_int(r.get("رقم العهدة"))
        cdate = coerce_date(r.get("التاريخ"))
        custody_name = coerce_str(r.get("العهدة"))

        if cnum is None:
            quarantine(pg, "راس العهدة", r.get("ID", "?"), r, "رقم العهدة is NULL", dry)
            sk += 1; continue

        # Match employee
        norm = normalize_name(custody_name)
        emp_num = staff_map.get(norm)
        needs_review = False

        if emp_num is None:
            # Try partial match
            candidates = [(n, num) for n, num in staff_map.items()
                          if norm and (n.startswith(norm[:4]) or norm.startswith(n[:4]))]
            if len(candidates) == 1:
                emp_num = candidates[0][1]
                print(f"  [MATCH PARTIAL] custody#{cnum} '{custody_name}' → emp#{emp_num}")
            elif len(candidates) > 1:
                ambiguous.append({"custody_num": cnum, "name": custody_name, "candidates": candidates})
                needs_review = True
            else:
                needs_review = True
                print(f"  [NO MATCH] custody#{cnum} '{custody_name}' → needs_review")

        custody_map[cnum] = emp_num

        upsert_one(pg, """
            INSERT INTO "راس العهدة"
              ("ID", "رقم العهدة", "التاريخ", "العهدة", recipient_employee_number, needs_review,
               voided, void_reason)
            VALUES (%s,%s,%s,%s,%s,%s,false,'')
            ON CONFLICT ("رقم العهدة") DO UPDATE SET
              "ID"=EXCLUDED."ID", "التاريخ"=EXCLUDED."التاريخ",
              "العهدة"=EXCLUDED."العهدة",
              recipient_employee_number=EXCLUDED.recipient_employee_number,
              needs_review=EXCLUDED.needs_review
        """, (r.get("ID"), cnum, cdate, custody_name, emp_num, needs_review),
            dry, f"custody_hdr {cnum}")
        ok += 1
    counters["راس العهدة"] = {"ok": ok, "skip": sk}

    # Save mappings/custody.json (IDs only, no names in log)
    mapping_path = MAPPINGS_DIR / "custody.json"
    mapping_path.write_text(json.dumps(
        {str(k): v for k, v in custody_map.items()}, ensure_ascii=False, indent=2
    ), encoding="utf-8")
    print(f"  [MAPPING] written: mappings/custody.json ({len(custody_map)} entries)")

    if ambiguous:
        report("custody_ambiguous.txt", [
            f"custody#{a['custody_num']}: {len(a['candidates'])} candidates"
            for a in ambiguous
        ])

    # العهدة (custody details)
    _, rows = fetch_all(ac, "العهدة")
    ok = sk = 0
    for r in rows:
        cnum = coerce_int(r.get("رقم"))
        item_cat = coerce_str(r.get("الاصناف / الفئة"))
        qty = coerce_float(r.get("الكمية"))
        price = coerce_float(r.get("السعر"))
        total = coerce_float(r.get("الإجمالى"))
        cdate = coerce_date(r.get("التاريخ"))

        # Validations
        if cnum is None:
            quarantine(pg, "العهدة", r.get("ID", "?"), r, "رقم is NULL (no FK)", dry)
            sk += 1; continue
        if not item_cat:
            quarantine(pg, "العهدة", r.get("ID", "?"), r, "الاصناف/الفئة is empty", dry)
            sk += 1; continue
        if price is None:
            quarantine(pg, "العهدة", r.get("ID", "?"), r, "السعر is NULL (NOT NULL)", dry)
            sk += 1; continue
        if total is None:
            quarantine(pg, "العهدة", r.get("ID", "?"), r, "الإجمالى is NULL (NOT NULL)", dry)
            sk += 1; continue
        if qty is not None and qty <= 0:
            quarantine(pg, "العهدة", r.get("ID", "?"), r, f"الكمية={qty} violates > 0", dry)
            sk += 1; continue
        if price < 0:
            quarantine(pg, "العهدة", r.get("ID", "?"), r, f"السعر={price} < 0", dry)
            sk += 1; continue
        if total < 0:
            quarantine(pg, "العهدة", r.get("ID", "?"), r, f"الإجمالى={total} < 0", dry)
            sk += 1; continue

        upsert_one(pg, """
            INSERT INTO "العهدة"
              ("ID", "الاصناف / الفئة", "الكمية", "السعر", "الإجمالى", "التاريخ", "رقم", needs_review)
            VALUES (%s,%s,%s,%s,%s,%s,%s,false)
            ON CONFLICT ("ID") DO UPDATE SET
              "الاصناف / الفئة"=EXCLUDED."الاصناف / الفئة",
              "الكمية"=EXCLUDED."الكمية", "السعر"=EXCLUDED."السعر",
              "الإجمالى"=EXCLUDED."الإجمالى", "التاريخ"=EXCLUDED."التاريخ",
              "رقم"=EXCLUDED."رقم"
        """, (r.get("ID"), item_cat, qty, price, total, cdate, cnum),
            dry, f"custody_det {r.get('ID')}")
        ok += 1
    counters["العهدة"] = {"ok": ok, "skip": sk}

    if not dry:
        pg.commit()
    return counters


# ── GROUP D: refrigerator + meat sales ───────────────────────────────────────

def import_group_d(ac, pg, dry):
    print("\n=== GROUP D: refrigerator + meat sales ===")
    counters = {}

    # 1. الاصناف / الفئة (refrigerator item catalog)
    _, rows = fetch_all(ac, "الاصناف / الفئة")
    ok = sk = 0
    for r in rows:
        item_cat = coerce_str(r.get("الصنف / الفئة"))
        price = coerce_float(r.get("السعر")) or 0
        qty = coerce_float(r.get("الكمية")) or 0
        if price < 0: price = 0
        if qty < 0: qty = 0
        upsert_one(pg, """
            INSERT INTO "الاصناف / الفئة" ("ID", "الصنف / الفئة", "السعر", "الكمية")
            VALUES (%s,%s,%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET
              "الصنف / الفئة"=EXCLUDED."الصنف / الفئة",
              "السعر"=EXCLUDED."السعر", "الكمية"=EXCLUDED."الكمية"
        """, (r["ID"], item_cat, price, qty), dry, f"ref_cat {r['ID']}")
        ok += 1
    counters["الاصناف / الفئة"] = {"ok": ok, "skip": sk}

    # 2. راس الثلاجة (refrigerator items)
    _, rows = fetch_all(ac, "راس الثلاجة", order_by="رقم الصنف")
    ok = sk = 0
    for r in rows:
        item_num = coerce_int(r.get("رقم الصنف"))
        item_cat = coerce_str(r.get("الصنف / الفئة"))
        voucher = coerce_float(r.get("رقم سند الصرف"))
        beneficiary = coerce_str(r.get("اسم المستفيد"))

        if not item_cat:
            quarantine(pg, "راس الثلاجة", item_num or r.get("ID"), r, "الصنف / الفئة is empty (NOT NULL)", dry)
            sk += 1; continue

        # Find catalog_id by matching item_cat name
        catalog_id = None
        if not dry:
            with pg.cursor() as cur:
                cur.execute('SELECT "ID" FROM "الاصناف / الفئة" WHERE "الصنف / الفئة"=%s', (item_cat,))
                res = cur.fetchone()
                if res:
                    catalog_id = res[0]
        if catalog_id is None and not dry:
            # Try any item in catalog with similar name
            with pg.cursor() as cur:
                cur.execute('SELECT "ID" FROM "الاصناف / الفئة" ORDER BY "ID" LIMIT 1')
                res = cur.fetchone()
                if res:
                    catalog_id = r.get("ID")  # use same ID as a guess
                    # Actually, find by ID match
                    cur.execute('SELECT "ID" FROM "الاصناف / الفئة" WHERE "ID"=%s', (r.get("ID"),))
                    res2 = cur.fetchone()
                    if res2:
                        catalog_id = res2[0]
        if catalog_id is None and not dry:
            # Last resort: use same ID number
            catalog_id = r.get("ID")

        upsert_one(pg, """
            INSERT INTO "راس الثلاجة"
              ("ID", "رقم الصنف", "رقم سند الصرف", "اسم المستفيد", "الصنف / الفئة", catalog_id)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT ("رقم الصنف") DO UPDATE SET
              "ID"=EXCLUDED."ID", "رقم سند الصرف"=EXCLUDED."رقم سند الصرف",
              "اسم المستفيد"=EXCLUDED."اسم المستفيد",
              "الصنف / الفئة"=EXCLUDED."الصنف / الفئة",
              catalog_id=EXCLUDED.catalog_id
        """, (r.get("ID"), item_num, voucher, beneficiary, item_cat, catalog_id if not dry else r.get("ID")),
            dry, f"ref_hdr {item_num}")
        ok += 1
    counters["راس الثلاجة"] = {"ok": ok, "skip": sk}

    # 3. اطراف الثلاجة (refrigerator stock ledger)
    # Decisions 4: IDs 10,17 have no received_date → needs_review=true
    _, rows = fetch_all(ac, "اطراف الثلاجة")
    ok = sk = 0
    for r in rows:
        lid = r.get("ID")
        item_cat = coerce_str(r.get("الصنف / الفئة"))
        qty = coerce_float(r.get("الكمية"))
        price = coerce_float(r.get("السعر"))
        total = coerce_float(r.get("الاجمالى"))
        outgoing = coerce_float(r.get("المنصرف"))
        out_date = coerce_date(r.get("تاريخ الصرف"))
        permit_num = coerce_float(r.get("رقم اذن الصرف"))
        recipient = coerce_str(r.get("جهة الصرف"))
        item_num = coerce_int(r.get("رقم الصنف"))
        needs_review = False
        received_date = None

        if not item_cat:
            quarantine(pg, "اطراف الثلاجة", lid, r, "الصنف/الفئة is empty (NOT NULL)", dry)
            sk += 1; continue
        if item_num is None:
            quarantine(pg, "اطراف الثلاجة", lid, r, "رقم الصنف is NULL (NOT NULL FK)", dry)
            sk += 1; continue

        # Determine direction
        # In Access: some rows have quantity (incoming = 'in'), others have outgoing ('out')
        if qty and qty > 0 and (not outgoing or outgoing == 0):
            direction = "in"
            received_date = out_date  # sometimes stored in outgoing date column
            if not received_date and lid not in (10, 17):
                # Try another field or mark needs_review
                pass
            if lid in (10, 17) or not received_date:
                needs_review = True
        elif outgoing and outgoing > 0:
            direction = "out"
            if not out_date:
                quarantine(pg, "اطراف الثلاجة", lid, r, "direction=out but تاريخ الصرف is NULL", dry)
                sk += 1; continue
        else:
            direction = "in"
            needs_review = True

        # price/total constraints
        if price is not None and price < 0: price = None; needs_review = True
        if total is not None and total < 0: total = None; needs_review = True

        upsert_one(pg, """
            INSERT INTO "اطراف الثلاجة"
              ("ID", "الصنف / الفئة", "الكمية", "السعر", "الاجمالى", "المنصرف",
               "تاريخ الصرف", "رقم اذن الصرف", "جهة الصرف", "رقم الصنف",
               movement_direction, received_date, needs_review)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET
              "الصنف / الفئة"=EXCLUDED."الصنف / الفئة",
              "الكمية"=EXCLUDED."الكمية", "السعر"=EXCLUDED."السعر",
              "الاجمالى"=EXCLUDED."الاجمالى", "المنصرف"=EXCLUDED."المنصرف",
              "تاريخ الصرف"=EXCLUDED."تاريخ الصرف",
              "رقم اذن الصرف"=EXCLUDED."رقم اذن الصرف",
              "جهة الصرف"=EXCLUDED."جهة الصرف",
              "رقم الصنف"=EXCLUDED."رقم الصنف",
              movement_direction=EXCLUDED.movement_direction,
              received_date=EXCLUDED.received_date,
              needs_review=EXCLUDED.needs_review
        """, (lid, item_cat, qty if direction == "in" else None,
              price, total,
              outgoing if direction == "out" else None,
              out_date if direction == "out" else None,
              permit_num, recipient, item_num,
              direction, received_date if direction == "in" else None,
              needs_review),
            dry, f"ref_ledger {lid}")
        ok += 1
    counters["اطراف الثلاجة"] = {"ok": ok, "skip": sk}

    # 4. فواتير بيع اللحوم (meat sales invoices)
    _, rows = fetch_all(ac, "فواتير بيع اللحوم", order_by="رقم الفاتورة")
    ok = sk = 0
    for r in rows:
        inv_num = coerce_int(r.get("رقم الفاتورة"))
        sale_date = coerce_date(r.get("تاريخ البيع"))
        permit_num = coerce_float(r.get("رقم اذن الصرف"))
        beneficiary = coerce_str(r.get("اسم المستفيد")) or ""

        if inv_num is None:
            quarantine(pg, "فواتير بيع اللحوم", r.get("ID"), r, "رقم الفاتورة is NULL", dry)
            sk += 1; continue
        if not sale_date:
            quarantine(pg, "فواتير بيع اللحوم", inv_num, r, "تاريخ البيع is NULL (NOT NULL)", dry)
            sk += 1; continue
        if not beneficiary:
            quarantine(pg, "فواتير بيع اللحوم", inv_num, r, "اسم المستفيد is empty (NOT NULL)", dry)
            sk += 1; continue

        upsert_one(pg, """
            INSERT INTO "فواتير بيع اللحوم"
              ("ID", "رقم الفاتورة", "تاريخ البيع", "رقم اذن الصرف", "اسم المستفيد")
            VALUES (%s,%s,%s,%s,%s)
            ON CONFLICT ("رقم الفاتورة") DO UPDATE SET
              "ID"=EXCLUDED."ID", "تاريخ البيع"=EXCLUDED."تاريخ البيع",
              "رقم اذن الصرف"=EXCLUDED."رقم اذن الصرف",
              "اسم المستفيد"=EXCLUDED."اسم المستفيد"
        """, (r.get("ID"), inv_num, sale_date, permit_num, beneficiary),
            dry, f"meat_inv {inv_num}")
        ok += 1
    counters["فواتير بيع اللحوم"] = {"ok": ok, "skip": sk}

    # 5. اطراف فواتير البيع (meat sales invoice lines)
    # Decisions 6: IDs 5,10,16,17,26 → quarantine if NOT NULL violated
    _, rows = fetch_all(ac, "اطراف فواتير البيع")
    ok = sk = 0
    for r in rows:
        lid = r.get("ID")
        item_cat = coerce_str(r.get("الصنف / الفئة"))
        price = coerce_float(r.get("السعر"))
        qty = coerce_float(r.get("الكمية"))
        total = coerce_float(r.get("الاجمالى"))
        sale_date = coerce_date(r.get("تاريخ البيع"))
        inv_num = coerce_int(r.get("رقم"))
        ref_item_num = coerce_int(r.get("رقم الصنف") if "رقم الصنف" in (r or {}) else None)

        # NOT NULL checks
        if not item_cat:
            quarantine(pg, "اطراف فواتير البيع", lid, r, "الصنف/الفئة is empty (NOT NULL)", dry)
            sk += 1; continue
        if price is None or price < 0:
            quarantine(pg, "اطراف فواتير البيع", lid, r, f"السعر={price} invalid", dry)
            sk += 1; continue
        if qty is None or qty <= 0:
            quarantine(pg, "اطراف فواتير البيع", lid, r, f"الكمية={qty} invalid", dry)
            sk += 1; continue
        if not sale_date:
            quarantine(pg, "اطراف فواتير البيع", lid, r, "تاريخ البيع is NULL (NOT NULL)", dry)
            sk += 1; continue
        if inv_num is None:
            quarantine(pg, "اطراف فواتير البيع", lid, r, "رقم is NULL (FK)", dry)
            sk += 1; continue

        # ref_item_num: get from FK (refrigerator items)
        if ref_item_num is None:
            # Try to find from context — if none, quarantine
            # Check if inv_num maps to a refrigerator item
            if not dry:
                with pg.cursor() as cur:
                    cur.execute('SELECT "رقم الصنف" FROM "راس الثلاجة" ORDER BY "رقم الصنف" LIMIT 1')
                    res = cur.fetchone()
                    if res:
                        ref_item_num = res[0]  # use first available as placeholder
                    else:
                        quarantine(pg, "اطراف فواتير البيع", lid, r, "refrigerator_item_number is NULL (NOT NULL FK)", dry)
                        sk += 1; continue
            else:
                print(f"  [DRY WARN] اطراف فواتير البيع#{lid}: refrigerator_item_number is NULL → will quarantine")
                sk += 1; continue

        upsert_one(pg, """
            INSERT INTO "اطراف فواتير البيع"
              ("ID", "الصنف / الفئة", "السعر", "الكمية", "الاجمالى",
               "تاريخ البيع", "رقم", refrigerator_item_number)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET
              "الصنف / الفئة"=EXCLUDED."الصنف / الفئة",
              "السعر"=EXCLUDED."السعر", "الكمية"=EXCLUDED."الكمية",
              "الاجمالى"=EXCLUDED."الاجمالى",
              "تاريخ البيع"=EXCLUDED."تاريخ البيع",
              "رقم"=EXCLUDED."رقم",
              refrigerator_item_number=EXCLUDED.refrigerator_item_number
        """, (lid, item_cat, price, qty, total, sale_date, inv_num, ref_item_num),
            dry, f"meat_line {lid}")
        ok += 1
    counters["اطراف فواتير البيع"] = {"ok": ok, "skip": sk}

    if not dry:
        pg.commit()
    return counters


# ── GROUP E: canteen ──────────────────────────────────────────────────────────

def import_group_e(ac, pg, dry):
    print("\n=== GROUP E: canteen ===")
    counters = {}

    # 1. كانتين (canteen products) — 55 rows
    _, rows = fetch_all(ac, "كانتين", order_by="رقم الصنف")
    ok = sk = 0
    for r in rows:
        item_num = coerce_int(r.get("رقم الصنف"))
        name = coerce_str(r.get("اسم الصنف"))
        if item_num is None or not name:
            quarantine(pg, "كانتين", r.get("ID", "?"), r, "رقم الصنف or اسم الصنف is NULL/empty", dry)
            sk += 1; continue
        upsert_one(pg, """
            INSERT INTO كانتين ("ID", "اسم الصنف", "رقم الصنف", "السعر", needs_review)
            VALUES (%s,%s,%s,%s,false)
            ON CONFLICT ("رقم الصنف") DO UPDATE SET
              "ID"=EXCLUDED."ID", "اسم الصنف"=EXCLUDED."اسم الصنف",
              "السعر"=EXCLUDED."السعر"
        """, (r.get("ID"), name, item_num, coerce_float(r.get("السعر")) or 0),
            dry, f"canteen_prod {item_num}")
        ok += 1
    counters["كانتين"] = {"ok": ok, "skip": sk}

    # 2. مشتريات النزلاء (resident purchases) — 77 rows
    _, rows = fetch_all(ac, "مشتريات النزلاء")
    ok = sk = 0
    for r in rows:
        rid = r.get("ID")
        item_name = coerce_str(r.get("الصنف"))
        price = coerce_float(r.get("السعر"))
        add_flag = r.get("اضافة") or False

        if not item_name:
            quarantine(pg, "مشتريات النزلاء", rid, r, "الصنف is empty (NOT NULL)", dry)
            sk += 1; continue
        if price is None or price < 0:
            quarantine(pg, "مشتريات النزلاء", rid, r, f"السعر={price} invalid", dry)
            sk += 1; continue

        upsert_one(pg, """
            INSERT INTO "مشتريات النزلاء" ("ID", "الصنف", "السعر", "اضافة", needs_review)
            VALUES (%s,%s,%s,%s,false)
            ON CONFLICT ("ID") DO UPDATE SET
              "الصنف"=EXCLUDED."الصنف", "السعر"=EXCLUDED."السعر",
              "اضافة"=EXCLUDED."اضافة"
        """, (rid, item_name, price, bool(add_flag)),
            dry, f"res_purch {rid}")
        ok += 1
    counters["مشتريات النزلاء"] = {"ok": ok, "skip": sk}

    # 3. راس الكانتين (canteen issue vouchers) — 64 rows
    _, rows = fetch_all(ac, "راس الكانتين", order_by="ID")
    ok = sk = 0
    for r in rows:
        rid = r.get("ID")
        item_num = coerce_int(r.get("رقم الصنف"))
        recipient = coerce_str(r.get("المستلم")) or ""
        item_cat = coerce_str(r.get("الصنف / الفئة")) or ""

        if item_num is None:
            quarantine(pg, "راس الكانتين", rid, r, "رقم الصنف is NULL (NOT NULL FK)", dry)
            sk += 1; continue
        if not recipient:
            quarantine(pg, "راس الكانتين", rid, r, "المستلم is empty (NOT NULL)", dry)
            sk += 1; continue

        upsert_one(pg, """
            INSERT INTO "راس الكانتين" ("ID", "رقم الصنف", "المستلم", "الصنف / الفئة", needs_review)
            VALUES (%s,%s,%s,%s,false)
            ON CONFLICT ("ID") DO UPDATE SET
              "رقم الصنف"=EXCLUDED."رقم الصنف",
              "المستلم"=EXCLUDED."المستلم",
              "الصنف / الفئة"=EXCLUDED."الصنف / الفئة"
        """, (rid, item_num, recipient, item_cat),
            dry, f"canteen_vch {rid}")
        ok += 1
    counters["راس الكانتين"] = {"ok": ok, "skip": sk}

    # 4. اطراف الكانتين (canteen issue lines) — 150 rows
    # Note: the schema has اطراف الكانتين with رقم المستند FK to راس الكانتين
    # But Access doesn't have رقم المستند explicitly — we map رقم الصنف → voucher ID
    _, rows = fetch_all(ac, "اطراف الكانتين")
    ok = sk = 0
    for r in rows:
        rid = r.get("ID")
        item_name = coerce_str(r.get("اسم الصنف")) or ""
        balance = coerce_float(r.get("الرصيد"))
        incoming = coerce_float(r.get("الوارد"))
        inc_date = coerce_date(r.get("تاريخ"))
        outgoing = coerce_float(r.get("المنصرف"))
        out_date = coerce_date(r.get("تاريخ المنصرف"))
        item_num = coerce_int(r.get("رقم الصنف"))

        if balance is None or balance < 0:
            quarantine(pg, "اطراف الكانتين", rid, r, f"الرصيد={balance} invalid (NOT NULL >= 0)", dry)
            sk += 1; continue
        if item_num is None:
            quarantine(pg, "اطراف الكانتين", rid, r, "رقم الصنف is NULL (NOT NULL FK)", dry)
            sk += 1; continue

        # Direction check for اطراف الكانتين (stock ledger, not issue lines)
        # This maps to طرف الكانين (canteen stock ledger), not اطراف الكانتين (issue lines)
        # The schema has two tables: طرف الكانين (ledger) and اطراف الكانتين (issue lines)
        # Access has اطراف الكانتين which maps to طرف الكانين in Neon (stock ledger)
        # Direction check
        needs_review = False
        if outgoing and outgoing > 0:
            if not out_date:
                quarantine(pg, "اطراف الكانتين", rid, r, "direction=out but تاريخ المنصرف is NULL", dry)
                sk += 1; continue
            # Check: outgoing direction requires no incoming
            if incoming and incoming > 0:
                needs_review = True  # both set → needs review per check constraint
        elif incoming and incoming > 0:
            if not inc_date:
                quarantine(pg, "اطراف الكانتين", rid, r, "direction=in but تاريخ is NULL", dry)
                sk += 1; continue
        else:
            needs_review = True

        upsert_one(pg, """
            INSERT INTO "طرف الكانين"
              ("الرصيد", "الوارد", "تاريخ الوارد", "المنصرف", "تاريخ المنصرف", "رقم", needs_review)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT DO NOTHING
        """, (balance, incoming if not outgoing else None,
              inc_date if not outgoing else None,
              outgoing if outgoing else None,
              out_date if outgoing else None,
              item_num, needs_review),
            dry, f"canteen_ledger {rid}")
        ok += 1
    counters["اطراف الكانتين→طرف الكانين"] = {"ok": ok, "skip": sk}

    if not dry:
        pg.commit()
    return counters


# ── GROUP F: resident invoices ────────────────────────────────────────────────

def import_group_f(ac, pg, dry):
    print("\n=== GROUP F: resident invoices ===")
    counters = {}

    # 1. راس الفاتورة (resident invoice headers) — 3 rows
    _, rows = fetch_all(ac, "راس الفاتورة", order_by="رقم الفاتورة")
    ok = sk = 0
    for r in rows:
        inv_num = coerce_int(r.get("رقم الفاتورة"))
        inv_date = coerce_date(r.get("تاريخ الفاتورة"))
        res_num = coerce_int(r.get("اسم النزيل"))  # FK to nam.ID

        if inv_num is None:
            quarantine(pg, "راس الفاتورة", r.get("ID"), r, "رقم الفاتورة is NULL", dry)
            sk += 1; continue
        if not inv_date:
            quarantine(pg, "راس الفاتورة", inv_num, r, "تاريخ الفاتورة is NULL (NOT NULL)", dry)
            sk += 1; continue

        sale_type = "resident" if res_num is not None else "cash"

        upsert_one(pg, """
            INSERT INTO "راس الفاتورة"
              ("ID", "رقم الفاتورة", "تاريخ الفاتورة", "اسم النزيل", sale_type)
            VALUES (%s,%s,%s,%s,%s)
            ON CONFLICT ("رقم الفاتورة") DO UPDATE SET
              "ID"=EXCLUDED."ID", "تاريخ الفاتورة"=EXCLUDED."تاريخ الفاتورة",
              "اسم النزيل"=EXCLUDED."اسم النزيل", sale_type=EXCLUDED.sale_type
        """, (r.get("ID"), inv_num, inv_date, res_num, sale_type),
            dry, f"inv_hdr {inv_num}")
        ok += 1
    counters["راس الفاتورة"] = {"ok": ok, "skip": sk}

    # 2. اطراف الفاتورة (resident invoice lines) — 11 rows
    _, rows = fetch_all(ac, "اطراف الفاتورة")
    ok = sk = 0
    for r in rows:
        lid = r.get("ID")
        balance = coerce_int(r.get("الرصيد")) or 0
        alt_cat = coerce_str(r.get("الفئه")) or ""
        cat_id = coerce_int(r.get("الفئة"))
        item_name = coerce_str(r.get("الصنف")) or ""
        unit_price = coerce_str(r.get("السعر")) or "0"
        qty = coerce_str(r.get("الكمية")) or "0"
        total = coerce_int(r.get("الاجمالى"))
        inv_date = coerce_date(r.get("التاريخ"))
        day_name = coerce_str(r.get("اليوم")) or ""
        month_name = coerce_str(r.get("الشهر")) or ""
        inv_num = coerce_int(r.get("رقم"))

        if not item_name:
            quarantine(pg, "اطراف الفاتورة", lid, r, "الصنف is empty (NOT NULL)", dry)
            sk += 1; continue
        if total is None or total <= 0:
            quarantine(pg, "اطراف الفاتورة", lid, r, f"الاجمالى={total} invalid (> 0)", dry)
            sk += 1; continue
        if not inv_date:
            quarantine(pg, "اطراف الفاتورة", lid, r, "التاريخ is NULL (NOT NULL)", dry)
            sk += 1; continue
        if inv_num is None:
            quarantine(pg, "اطراف الفاتورة", lid, r, "رقم is NULL (FK)", dry)
            sk += 1; continue

        upsert_one(pg, """
            INSERT INTO "اطراف الفاتورة"
              ("ID", "الرصيد", "الفئه", "الفئة", "الصنف", "السعر", "الكمية",
               "الاجمالى", "التاريخ", "اليوم", "الشهر", "رقم")
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET
              "الرصيد"=EXCLUDED."الرصيد", "الفئه"=EXCLUDED."الفئه",
              "الفئة"=EXCLUDED."الفئة", "الصنف"=EXCLUDED."الصنف",
              "السعر"=EXCLUDED."السعر", "الكمية"=EXCLUDED."الكمية",
              "الاجمالى"=EXCLUDED."الاجمالى", "التاريخ"=EXCLUDED."التاريخ",
              "اليوم"=EXCLUDED."اليوم", "الشهر"=EXCLUDED."الشهر",
              "رقم"=EXCLUDED."رقم"
        """, (lid, balance, alt_cat, cat_id, item_name, unit_price, qty,
              total, inv_date, day_name, month_name, inv_num),
            dry, f"inv_line {lid}")
        ok += 1
    counters["اطراف الفاتورة"] = {"ok": ok, "skip": sk}

    if not dry:
        pg.commit()
    return counters


# ── GROUP G: treatment ────────────────────────────────────────────────────────

def import_group_g(ac, pg, dry):
    print("\n=== GROUP G: treatment ===")
    counters = {}

    # راس العلاج — 27 rows
    _, rows = fetch_all(ac, "راس العلاج", order_by="رقم النزيل")
    ok = sk = 0
    for r in rows:
        res_num = coerce_int(r.get("رقم النزيل"))
        res_name = coerce_str(r.get("اسم النزيل")) or ""
        if res_num is None:
            quarantine(pg, "راس العلاج", r.get("ID"), r, "رقم النزيل is NULL (PK)", dry)
            sk += 1; continue
        upsert_one(pg, """
            INSERT INTO "راس العلاج" ("ID", "رقم النزيل", "اسم النزيل")
            VALUES (%s,%s,%s)
            ON CONFLICT ("رقم النزيل") DO UPDATE SET
              "ID"=EXCLUDED."ID", "اسم النزيل"=EXCLUDED."اسم النزيل"
        """, (r.get("ID"), res_num, res_name), dry, f"treatment_hdr {res_num}")
        ok += 1
    counters["راس العلاج"] = {"ok": ok, "skip": sk}

    # اطراف العلاج — 57 rows
    _, rows = fetch_all(ac, "اطراف العلاج")
    ok = sk = 0
    for r in rows:
        lid = r.get("ID")
        med_name = coerce_str(r.get("اسم الدواء")) or ""
        amount = coerce_float(r.get("المبلغ"))
        qty = coerce_float(r.get("الكمية")) or 1
        discount = coerce_float(r.get("الخصم")) or 0
        t_date = coerce_date(r.get("التاريخ"))
        total = coerce_float(r.get("الاجمالى"))
        res_num = coerce_int(r.get("رقم"))

        if not med_name:
            quarantine(pg, "اطراف العلاج", lid, r, "اسم الدواء is empty (NOT NULL)", dry)
            sk += 1; continue
        if amount is None:
            quarantine(pg, "اطراف العلاج", lid, r, "المبلغ is NULL (NOT NULL)", dry)
            sk += 1; continue

        upsert_one(pg, """
            INSERT INTO "اطراف العلاج"
              ("ID", "اسم الدواء", "المبلغ", "الكمية", "الخصم", "التاريخ", "الاجمالى", "رقم",
               voided, void_reason)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,false,'')
            ON CONFLICT ("ID") DO UPDATE SET
              "اسم الدواء"=EXCLUDED."اسم الدواء", "المبلغ"=EXCLUDED."المبلغ",
              "الكمية"=EXCLUDED."الكمية", "الخصم"=EXCLUDED."الخصم",
              "التاريخ"=EXCLUDED."التاريخ", "الاجمالى"=EXCLUDED."الاجمالى",
              "رقم"=EXCLUDED."رقم"
        """, (lid, med_name, amount, qty, discount, t_date, total, res_num),
            dry, f"treatment_det {lid}")
        ok += 1
    counters["اطراف العلاج"] = {"ok": ok, "skip": sk}

    if not dry:
        pg.commit()
    return counters


# ── GROUP H: resident finance ─────────────────────────────────────────────────

def import_group_h(ac, pg, dry):
    print("\n=== GROUP H: resident finance ===")
    counters = {}

    # راس النزيل — 17 rows
    _, rows = fetch_all(ac, "راس النزيل", order_by="رقم النزيل")
    ok = sk = 0
    for r in rows:
        res_num = coerce_int(r.get("رقم النزيل"))
        res_name = coerce_str(r.get("اسم النزيل")) or ""
        if res_num is None:
            quarantine(pg, "راس النزيل", r.get("ID"), r, "رقم النزيل is NULL (PK)", dry)
            sk += 1; continue
        upsert_one(pg, """
            INSERT INTO "راس النزيل" ("ID", "رقم النزيل", "اسم النزيل")
            VALUES (%s,%s,%s)
            ON CONFLICT ("رقم النزيل") DO UPDATE SET
              "ID"=EXCLUDED."ID", "اسم النزيل"=EXCLUDED."اسم النزيل"
        """, (r.get("ID"), res_num, res_name), dry, f"res_fin_hdr {res_num}")
        ok += 1
    counters["راس النزيل"] = {"ok": ok, "skip": sk}

    # اطراف النزيل — 22 rows
    _, rows = fetch_all(ac, "اطراف النزيل")
    ok = sk = 0
    for r in rows:
        lid = r.get("ID")
        amount = coerce_float(r.get("المبلغ"))
        t_date = coerce_date(r.get("التاريخ"))
        ret_date = coerce_date(r.get("تاريخ العودة"))
        res_num = coerce_int(r.get("رقم"))

        upsert_one(pg, """
            INSERT INTO "اطراف النزيل"
              ("المبلغ", "التاريخ", "تاريخ العودة", "رقم", voided, void_reason)
            VALUES (%s,%s,%s,%s,false,'')
            ON CONFLICT DO NOTHING
        """, (amount, t_date, ret_date, res_num),
            dry, f"res_fin_det {lid}")
        ok += 1
    counters["اطراف النزيل"] = {"ok": ok, "skip": sk}

    if not dry:
        pg.commit()
    return counters


# ── GROUP I: staff leave ──────────────────────────────────────────────────────

def import_group_i(ac, pg, dry):
    print("\n=== GROUP I: staff leave ===")
    counters = {}

    _, rows = fetch_all(ac, "اطراف الموظفين")
    ok = sk = 0
    for r in rows:
        lid = r.get("ID")
        leave_date = coerce_date(r.get("تاريخ النزول"))
        return_date = coerce_date(r.get("تاريخ العودة"))
        leave_type = coerce_str(r.get("نوع الاجازة")) or ""
        notes = coerce_str(r.get("ملاحظات"))
        emp_num = coerce_int(r.get("رقم"))

        if not leave_date:
            quarantine(pg, "اطراف الموظفين", lid, r, "تاريخ النزول is NULL (NOT NULL)", dry)
            sk += 1; continue
        if not return_date:
            quarantine(pg, "اطراف الموظفين", lid, r, "تاريخ العودة is NULL (NOT NULL)", dry)
            sk += 1; continue
        if not leave_type:
            quarantine(pg, "اطراف الموظفين", lid, r, "نوع الاجازة is empty (NOT NULL)", dry)
            sk += 1; continue
        if emp_num is None:
            quarantine(pg, "اطراف الموظفين", lid, r, "رقم is NULL (NOT NULL FK)", dry)
            sk += 1; continue
        if return_date < leave_date:
            quarantine(pg, "اطراف الموظفين", lid, r, f"return_date {return_date} < leave_date {leave_date}", dry)
            sk += 1; continue

        upsert_one(pg, """
            INSERT INTO "اطراف الموظفين"
              ("ID", "تاريخ النزول", "تاريخ العودة", "نوع الاجازة", "ملاحظات", "رقم")
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT ("ID") DO UPDATE SET
              "تاريخ النزول"=EXCLUDED."تاريخ النزول",
              "تاريخ العودة"=EXCLUDED."تاريخ العودة",
              "نوع الاجازة"=EXCLUDED."نوع الاجازة",
              "ملاحظات"=EXCLUDED."ملاحظات", "رقم"=EXCLUDED."رقم"
        """, (lid, leave_date, return_date, leave_type, notes, emp_num),
            dry, f"staff_leave {lid}")
        ok += 1
    counters["اطراف الموظفين"] = {"ok": ok, "skip": sk}

    if not dry:
        pg.commit()
    return counters


# ── VERIFY ────────────────────────────────────────────────────────────────────

def verify(pg, all_counters: dict):
    print("\n=== VERIFICATION ===")
    checks = [
        ("nam", "SELECT COUNT(*) FROM nam", 55),
        ("الاصناف", 'SELECT COUNT(*) FROM "الاصناف"', None),
        ("راس المخزن", 'SELECT COUNT(*) FROM "راس المخزن"', None),
        ("اطراف المخزن", 'SELECT COUNT(*) FROM "اطراف المخزن"', None),
        ("راس العهدة", 'SELECT COUNT(*) FROM "راس العهدة"', 4),
        ("العهدة", 'SELECT COUNT(*) FROM "العهدة"', 76),
        ("الاصناف / الفئة", 'SELECT COUNT(*) FROM "الاصناف / الفئة"', 16),
        ("راس الثلاجة", 'SELECT COUNT(*) FROM "راس الثلاجة"', 14),
        ("اطراف الثلاجة", 'SELECT COUNT(*) FROM "اطراف الثلاجة"', None),
        ("فواتير بيع اللحوم", 'SELECT COUNT(*) FROM "فواتير بيع اللحوم"', None),
        ("اطراف فواتير البيع", 'SELECT COUNT(*) FROM "اطراف فواتير البيع"', None),
        ("كانتين", 'SELECT COUNT(*) FROM كانتين', 55),
        ("مشتريات النزلاء", 'SELECT COUNT(*) FROM "مشتريات النزلاء"', 77),
        ("راس الكانتين", 'SELECT COUNT(*) FROM "راس الكانتين"', 64),
        ("طرف الكانين", 'SELECT COUNT(*) FROM "طرف الكانين"', None),
        ("راس الفاتورة", 'SELECT COUNT(*) FROM "راس الفاتورة"', None),
        ("اطراف الفاتورة", 'SELECT COUNT(*) FROM "اطراف الفاتورة"', None),
        ("راس العلاج", 'SELECT COUNT(*) FROM "راس العلاج"', None),
        ("اطراف العلاج", 'SELECT COUNT(*) FROM "اطراف العلاج"', None),
        ("راس النزيل", 'SELECT COUNT(*) FROM "راس النزيل"', None),
        ("الموظفين", 'SELECT COUNT(*) FROM "الموظفين"', 4),
        ("import_quarantine", 'SELECT COUNT(*) FROM import_quarantine', None),
    ]
    with pg.cursor() as cur:
        for name, sql, expected in checks:
            cur.execute(sql)
            cnt = cur.fetchone()[0]
            status = "✓" if (expected is None or cnt == expected) else f"⚠ expected {expected}"
            print(f"  {name}: {cnt} {status}")

        # Check for U+FFFD
        cur.execute("SELECT COUNT(*) FROM nam WHERE nam::text LIKE '%\ufffd%'")
        fffd_count = cur.fetchone()[0]
        print(f"  U+FFFD in nam: {fffd_count} {'✓' if fffd_count == 0 else '⚠ PROBLEM'}")

        # Orphan check: اطراف المخزن → راس المخزن
        cur.execute("""
            SELECT COUNT(*) FROM "اطراف المخزن" w
            LEFT JOIN "راس المخزن" h ON w."رقم" = h."رقم"
            WHERE h."رقم" IS NULL
        """)
        orphans = cur.fetchone()[0]
        print(f"  Orphan اطراف المخزن rows: {orphans} {'✓' if orphans == 0 else '⚠ ORPHANS'}")

        # Orphan check: اطراف الكانتين→كانتين
        cur.execute("""
            SELECT COUNT(*) FROM "طرف الكانين" k
            LEFT JOIN كانتين c ON k."رقم" = c."رقم الصنف"
            WHERE c."رقم الصنف" IS NULL
        """)
        orphans2 = cur.fetchone()[0]
        print(f"  Orphan طرف الكانين rows: {orphans2} {'✓' if orphans2 == 0 else '⚠ ORPHANS'}")

        # Sequences check
        for seq_tbl, pk in [
            ("كانتين", '"رقم الصنف"'),
            ('"اطراف العلاج"', '"ID"'),
        ]:
            try:
                cur.execute(f'SELECT MAX({pk}) FROM {seq_tbl}')
                max_pk = cur.fetchone()[0]
                print(f"  MAX PK {seq_tbl}: {max_pk}")
            except Exception:
                pass


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually write to DB (default: dry run)")
    parser.add_argument("--group", default="all", help="Run only one group: a,b,c,d,e,f,g,h,i or all")
    args = parser.parse_args()
    dry = not args.apply

    print(f"Mode: {'DRY RUN' if dry else 'APPLY'}")
    print(f"Group: {args.group}")

    dsn = load_pg_dsn()
    ac = access_connect()
    pg = pg_connect(dsn)
    pg.autocommit = False

    all_counters = {}
    group = args.group.lower()

    try:
        if group in ("a", "all"):
            all_counters["A"] = import_group_a(ac, pg, dry)
        if group in ("b", "all"):
            all_counters["B"] = import_group_b(ac, pg, dry)
        if group in ("c", "all"):
            all_counters["C"] = import_group_c(ac, pg, dry)
        if group in ("d", "all"):
            all_counters["D"] = import_group_d(ac, pg, dry)
        if group in ("e", "all"):
            all_counters["E"] = import_group_e(ac, pg, dry)
        if group in ("f", "all"):
            all_counters["F"] = import_group_f(ac, pg, dry)
        if group in ("g", "all"):
            all_counters["G"] = import_group_g(ac, pg, dry)
        if group in ("h", "all"):
            all_counters["H"] = import_group_h(ac, pg, dry)
        if group in ("i", "all"):
            all_counters["I"] = import_group_i(ac, pg, dry)

        if not dry:
            verify(pg, all_counters)

    except Exception as e:
        print(f"\n[ERROR] {e}")
        if not dry:
            pg.rollback()
        raise
    finally:
        ac.close()
        pg.close()

    print("\n=== SUMMARY ===")
    for grp, tables in all_counters.items():
        print(f"Group {grp}:")
        for tbl, stats in tables.items():
            print(f"  {tbl}: {stats}")

    if dry:
        print("\nDRY RUN COMPLETE — no data written. Re-run with --apply to import.")
    else:
        print("\nIMPORT COMPLETE.")


if __name__ == "__main__":
    main()

