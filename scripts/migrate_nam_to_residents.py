"""
Phase C: Migrate `nam` to `residents`, `resident_stays`, and `resident_legacy_links`.
Then link `راس الفاتورة` and import `اطراف الفاتورة`.
Run with --dry (default) to simulate; use --apply to commit.
"""

import argparse
import sys
import uuid
from datetime import datetime, date
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.import_access_phase_b import load_pg_dsn, pg_connect, access_connect, fetch_all

def coerce_str(v) -> str:
    if v is None:
        return ""
    return str(v).strip()

def coerce_date(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually commit changes")
    args = parser.parse_args()
    dry = not args.apply

    print(f"=== PHASE C: NAM -> RESIDENTS (Mode: {'DRY RUN' if dry else 'APPLY'}) ===")

    dsn = load_pg_dsn()
    pg = pg_connect(dsn)
    pg.autocommit = False

    try:
        cur = pg.cursor()

        # 1. Check existing links (idempotency)
        cur.execute("SELECT legacy_resident_id FROM resident_legacy_links")
        existing_linked_ids = {row[0] for row in cur.fetchall()}
        print(f"Existing linked legacy IDs: {len(existing_linked_ids)}")

        # 2. Fetch all nam rows
        cur.execute("""
            SELECT "ID", num, nam, "Dat_Brth", "Adrres", tal, "num_A", "Con", mar,
                   "Dat_Ent", sak, khn, "no_A", "Mot", "Alt", "ALF", "N-AL", "Dat_AO",
                   "ALm", "Phot", "Num_ROm", "Mon", "ImagePath", mmon, "F_N", "Nom",
                   "Achesh", "Fathr",
                   "المؤهل الدراسى", "الخبرات السابقة", "اماكن العمل السابقة",
                   "دخول النزيل", "صلة القرابة", "من االدرجة", "ساعة الدخول",
                   "طريقة الخروج", "رقم الطبيب المعالج", "عنوان الطبيب المعالج",
                   "فريق التأهل والارشاد", "مرحلة التأهيل والتعافى", "المدرب", "المشرف", "المحاضر"
            FROM nam
            ORDER BY "ID"
        """)
        nam_cols = [desc[0] for desc in cur.description]
        nam_rows = [dict(zip(nam_cols, r)) for r in cur.fetchall()]
        print(f"Total rows in nam: {len(nam_rows)}")

        # 3. Fetch lookup sets for church and governorate
        cur.execute('SELECT "Cont" FROM "المحافظة"')
        valid_govs = {r[0].strip() for r in cur.fetchall() if r[0]}
        cur.execute('SELECT nam FROM "الكنيسة التابع لها"')
        valid_churches = {r[0].strip() for r in cur.fetchall() if r[0]}

        migrated_count = 0
        skipped_count = 0
        stays_count = 0
        unmatched_churches = 0
        unmatched_govs = 0

        # Field-by-field verification counters
        field_matches = {
            "name": 0, "birth_date": 0, "phone": 0, "address": 0,
            "district": 0, "governorate": 0, "national_id": 0,
            "incomplete_stay": 0, "follow_up": 0, "graduated": 0,
            "resident_number": 0, "qualification": 0, "trainer": 0,
            "supervisor": 0, "lecturer": 0
        }

        used_file_numbers = set()
        # Prepopulate with existing file numbers in residents table
        cur.execute("SELECT file_number FROM residents")
        for r in cur.fetchall():
            if r[0]:
                used_file_numbers.add(r[0])

        for r in nam_rows:
            legacy_id = r["ID"]
            if legacy_id in existing_linked_ids:
                skipped_count += 1
                continue

            res_id = str(uuid.uuid4())

            # File number resolution
            raw_num = coerce_str(r.get("num"))
            if raw_num and raw_num not in used_file_numbers:
                file_number = raw_num
            else:
                fn = coerce_str(r.get("F_N"))
                nom = coerce_str(r.get("Nom"))
                if fn and nom:
                    candidate = f"م-{fn}-{nom}"
                else:
                    candidate = f"LEGACY-{legacy_id}"
                if candidate in used_file_numbers:
                    candidate = f"{candidate}-{legacy_id}"
                file_number = candidate
            used_file_numbers.add(file_number)

            name = coerce_str(r.get("nam"))
            birth_date = coerce_date(r.get("Dat_Brth"))
            phone = coerce_str(r.get("tal"))
            address = coerce_str(r.get("Adrres"))
            district = coerce_str(r.get("mar"))       # mar = المركز جوه المحافظة
            governorate = coerce_str(r.get("Con"))   # Con = المحافظة
            resident_num = coerce_str(r.get("Nom"))  # Nom = رقم النزيل
            national_id = coerce_str(r.get("num_A")) # num_A = الرقم القومي

            # Booleans per user confirmation:
            # khn = أتم الـ 6 شهور (graduated)
            # no_A = لم يكمل الـ 6 شهور (incomplete_stay)
            # Mot = متابعة بعد التخرج (follow_up)
            graduated = bool(r.get("khn"))
            incomplete_stay = bool(r.get("no_A"))
            follow_up = bool(r.get("Mot"))

            image_path = coerce_str(r.get("ImagePath"))
            qualification = coerce_str(r.get("المؤهل الدراسى"))
            prev_exp = coerce_str(r.get("الخبرات السابقة"))
            prev_work = coerce_str(r.get("اماكن العمل السابقة"))
            res_entry = coerce_str(r.get("دخول النزيل"))
            rel = coerce_str(r.get("صلة القرابة"))
            rel_deg = coerce_str(r.get("من االدرجة"))
            entry_time = coerce_str(r.get("ساعة الدخول"))
            exit_method = coerce_str(r.get("طريقة الخروج"))
            doc_num = coerce_str(r.get("رقم الطبيب المعالج"))
            doc_addr = coerce_str(r.get("عنوان الطبيب المعالج"))
            rehab_team = coerce_str(r.get("فريق التأهل والارشاد"))
            rehab_stage = coerce_str(r.get("مرحلة التأهيل والتعافى"))
            trainer = coerce_str(r.get("المدرب"))
            supervisor = coerce_str(r.get("المشرف"))
            lecturer = coerce_str(r.get("المحاضر"))

            church = coerce_str(r.get("Achesh"))
            confessor = coerce_str(r.get("Fathr"))

            # Check lookup existence
            if church and church not in valid_churches:
                unmatched_churches += 1
            if governorate and governorate not in valid_govs:
                unmatched_govs += 1

            if not dry:
                # 3a. Insert residents
                cur.execute("""
                    INSERT INTO residents (
                        id, file_number, name, birth_date, phone, address,
                        district, governorate, resident_number, national_id,
                        incomplete_stay, follow_up, graduated,
                        church, confessor, qualification, previous_experience,
                        previous_workplaces, resident_entry, relationship,
                        relationship_degree, entry_time, exit_method,
                        treating_doctor_number, treating_doctor_address,
                        rehabilitation_team, rehabilitation_stage,
                        trainer, supervisor, lecturer, image_path,
                        archived, emergency_contact, emergency_phone, marital_status
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        %s, %s,
                        %s, %s,
                        %s, %s, %s, %s,
                        false, '', '', ''
                    )
                """, (
                    res_id, file_number, name, birth_date, phone, address,
                    district, governorate, resident_num, national_id,
                    incomplete_stay, follow_up, graduated,
                    church, confessor, qualification, prev_exp,
                    prev_work, res_entry, rel,
                    rel_deg, entry_time, exit_method,
                    doc_num, doc_addr,
                    rehab_team, rehab_stage,
                    trainer, supervisor, lecturer, image_path
                ))

                # 3b. Insert resident_legacy_links
                cur.execute("""
                    INSERT INTO resident_legacy_links (resident_id, legacy_resident_id)
                    VALUES (%s, %s)
                """, (res_id, legacy_id))

                # 3c. Insert resident_stays
                adm_date = coerce_date(r.get("Dat_Ent"))
                if adm_date:
                    exit_date = coerce_date(r.get("Dat_AO"))
                    # check constraint: exit_date is null or >= admission_date
                    if exit_date and exit_date < adm_date:
                        exit_date = None
                    room = coerce_str(r.get("Num_ROm"))
                    villa = coerce_str(r.get("sak"))
                    cur.execute("""
                        INSERT INTO resident_stays (resident_id, admission_date, exit_date, villa, room)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (res_id, adm_date, exit_date, villa, room))
                    stays_count += 1

            migrated_count += 1

            # Verification tracking
            if name: field_matches["name"] += 1
            if birth_date: field_matches["birth_date"] += 1
            if phone: field_matches["phone"] += 1
            if address: field_matches["address"] += 1
            if district: field_matches["district"] += 1
            if governorate: field_matches["governorate"] += 1
            if national_id: field_matches["national_id"] += 1
            if incomplete_stay: field_matches["incomplete_stay"] += 1
            if follow_up: field_matches["follow_up"] += 1
            if graduated: field_matches["graduated"] += 1
            if resident_num: field_matches["resident_number"] += 1
            if qualification: field_matches["qualification"] += 1
            if trainer: field_matches["trainer"] += 1
            if supervisor: field_matches["supervisor"] += 1
            if lecturer: field_matches["lecturer"] += 1

        print(f"\nResidents migration: {migrated_count} prepared/migrated, {skipped_count} skipped.")
        if not dry:
            print(f"Resident stays created: {stays_count}")

        # 4. Link راس الفاتورة to resident_id
        if not dry:
            # First check if any invoices exist in Access to import
            ac = access_connect()
            _, acc_inv_headers = fetch_all(ac, "راس الفاتورة", order_by="رقم الفاتورة")
            _, acc_inv_lines = fetch_all(ac, "اطراف الفاتورة")
            ac.close()

            # Import راس الفاتورة
            inv_imported = 0
            for inv in acc_inv_headers:
                inv_num = inv.get("رقم الفاتورة")
                inv_date = coerce_date(inv.get("تاريخ الفاتورة"))
                legacy_res_num = inv.get("اسم النزيل")
                if not inv_num or not inv_date:
                    continue

                # find linked resident_id
                matched_res_id = None
                if legacy_res_num:
                    cur.execute(
                        "SELECT resident_id FROM resident_legacy_links WHERE legacy_resident_id = %s",
                        (legacy_res_num,)
                    )
                    row = cur.fetchone()
                    if row:
                        matched_res_id = row[0]

                sale_type = "resident" if matched_res_id else "cash"
                cur.execute("""
                    INSERT INTO "راس الفاتورة" ("ID", "رقم الفاتورة", "تاريخ الفاتورة", "اسم النزيل", resident_id, sale_type)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT ("رقم الفاتورة") DO UPDATE SET
                      "تاريخ الفاتورة"=EXCLUDED."تاريخ الفاتورة",
                      "اسم النزيل"=EXCLUDED."اسم النزيل",
                      resident_id=EXCLUDED.resident_id,
                      sale_type=EXCLUDED.sale_type
                """, (inv.get("ID"), inv_num, inv_date, legacy_res_num, matched_res_id, sale_type))
                inv_imported += 1
            print(f"راس الفاتورة imported: {inv_imported}")

            # Import اطراف الفاتورة
            lines_imported = 0
            for line in acc_inv_lines:
                lid = line.get("ID")
                inv_num = line.get("رقم")
                item = coerce_str(line.get("الصنف"))
                total = line.get("الاجمالى")
                ldate = coerce_date(line.get("التاريخ"))
                if not inv_num or not item or not total or not ldate or total <= 0:
                    continue
                cur.execute("""
                    INSERT INTO "اطراف الفاتورة" (
                      "ID", "الرصيد", "الفئه", "الفئة", "الصنف", "السعر",
                      "الكمية", "الاجمالى", "التاريخ", "اليوم", "الشهر", "رقم"
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT ("ID") DO UPDATE SET
                      "الصنف"=EXCLUDED."الصنف", "الاجمالى"=EXCLUDED."الاجمالى"
                """, (
                    lid, int(line.get("الرصيد") or 0),
                    coerce_str(line.get("الفئه")),
                    line.get("الفئة"),
                    item,
                    str(line.get("السعر") or "0"),
                    str(line.get("الكمية") or "1"),
                    int(total),
                    ldate,
                    coerce_str(line.get("اليوم")),
                    coerce_str(line.get("الشهر")),
                    inv_num
                ))
                lines_imported += 1
            print(f"اطراف الفاتورة imported: {lines_imported}")

            pg.commit()
            print("Transaction COMMITTED successfully.")

        # 5. Field-by-field verification output
        print("\n=== FIELD-BY-FIELD STATS (Populated Non-empty Fields) ===")
        for field, count in field_matches.items():
            print(f"  {field}: {count}/55 populated")
        print(f"\nUnmatched Church Lookup entries: {unmatched_churches}")
        print(f"Unmatched Governorate Lookup entries: {unmatched_govs}")

    except Exception as e:
        pg.rollback()
        print(f"\n[ERROR] Rollback executed: {e}")
        raise
    finally:
        pg.close()

if __name__ == "__main__":
    main()

