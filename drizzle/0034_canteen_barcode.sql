-- إضافة عمود الباركود لأصناف مخزون الكانتين وأصناف مبيعات الكانتين
ALTER TABLE "كانتين"
  ADD COLUMN IF NOT EXISTS "barcode" text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS "canteen_products_barcode_unique"
  ON "كانتين" ("barcode")
  WHERE "barcode" <> '';

ALTER TABLE "مشتريات النزلاء"
  ADD COLUMN IF NOT EXISTS "barcode" text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "resident_purchases_barcode_idx"
  ON "مشتريات النزلاء" ("barcode")
  WHERE "barcode" <> '';
