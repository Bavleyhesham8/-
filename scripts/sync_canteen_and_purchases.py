import os
import sys
from pathlib import Path

# Load dotenv if available
env_path = Path(__file__).parent.parent / ".env"
local_env = Path(__file__).parent.parent / ".env.local"

dsn = None
for p in [local_env, env_path]:
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val:
                    dsn = val
                    break
    if dsn:
        break

if not dsn:
    print("DATABASE_URL not found!")
    sys.exit(1)

import psycopg2

print("Connecting to Neon PostgreSQL...")
conn = psycopg2.connect(dsn)
conn.autocommit = False

with conn.cursor() as cur:
    # 1. Update canteen_item_number by matching trimmed name
    cur.execute("""
        UPDATE "مشتريات النزلاء" p
        SET canteen_item_number = c."رقم الصنف"
        FROM كانتين c
        WHERE lower(trim(p."الصنف")) = lower(trim(c."اسم الصنف"))
          AND (p.canteen_item_number IS NULL OR p.canteen_item_number != c."رقم الصنف");
    """)
    updated_links = cur.rowcount
    print(f"Updated canteen_item_number links: {updated_links}")

    # 2. Update price in مشتريات النزلاء to match كانتين price
    cur.execute("""
        UPDATE "مشتريات النزلاء" p
        SET "السعر" = c."السعر"
        FROM كانتين c
        WHERE p.canteen_item_number = c."رقم الصنف"
          AND c."السعر" > 0
          AND p."السعر" != c."السعر";
    """)
    updated_prices = cur.rowcount
    print(f"Updated prices in مشتريات النزلاء to match كانتين: {updated_prices}")

    # 3. Insert any missing products from كانتين into مشتريات النزلاء
    # First get default category id
    cur.execute("SELECT id FROM invoice_categories ORDER BY id LIMIT 1;")
    cat_row = cur.fetchone()
    default_cat_id = cat_row[0] if cat_row else None

    if default_cat_id is not None:
        cur.execute("""
            INSERT INTO "مشتريات النزلاء" ("الصنف", "السعر", "اضافة", canteen_item_number, invoice_category_id)
            SELECT c."اسم الصنف", c."السعر", false, c."رقم الصنف", %s
            FROM كانتين c
            WHERE NOT EXISTS (
                SELECT 1 FROM "مشتريات النزلاء" p 
                WHERE p.canteen_item_number = c."رقم الصنف" 
                   OR lower(trim(p."الصنف")) = lower(trim(c."اسم الصنف"))
            );
        """, (default_cat_id,))
        inserted_items = cur.rowcount
        print(f"Inserted missing items into مشتريات النزلاء: {inserted_items}")

    conn.commit()

    # 4. Verify match
    cur.execute("""
        SELECT c."رقم الصنف", c."اسم الصنف", c."السعر" as canteen_price, p."الصنف", p."السعر" as purchase_price
        FROM كانتين c
        JOIN "مشتريات النزلاء" p ON c."رقم الصنف" = p.canteen_item_number
        ORDER BY c."رقم الصنف"
        LIMIT 15;
    """)
    rows = cur.fetchall()
    print("\nSample synced items:")
    for r in rows:
        print(f"  Item #{r[0]}: {r[1]} -> Canteen: {r[2]} ج.م | Sales: {r[4]} ج.م")

conn.close()
print("\nSync completed successfully!")

