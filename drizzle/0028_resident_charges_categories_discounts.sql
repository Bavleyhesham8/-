-- Canteen item categories
ALTER TABLE "مشتريات النزلاء"
  ADD COLUMN IF NOT EXISTS "invoice_category_id" integer;

DO $$ BEGIN
  ALTER TABLE "مشتريات النزلاء"
    ADD CONSTRAINT "resident_purchases_category_id_fk"
    FOREIGN KEY ("invoice_category_id") REFERENCES "الفئة"("ID")
    ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "resident_purchases_category_id_idx"
  ON "مشتريات النزلاء" ("invoice_category_id");

-- Refrigerator invoice-level discount
ALTER TABLE "فواتير بيع اللحوم"
  ADD COLUMN IF NOT EXISTS "discount" double precision NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE "فواتير بيع اللحوم"
    ADD CONSTRAINT "meat_sales_invoices_discount_check"
    CHECK ("discount" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Center custody charges linked to a resident account
ALTER TABLE "center_custody_transactions"
  ADD COLUMN IF NOT EXISTS "resident_id" uuid;

DO $$ BEGIN
  ALTER TABLE "center_custody_transactions"
    ADD CONSTRAINT "center_custody_transactions_resident_id_fk"
    FOREIGN KEY ("resident_id") REFERENCES "residents"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "center_custody_transactions_resident_id_idx"
  ON "center_custody_transactions" ("resident_id");
