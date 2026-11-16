ALTER TABLE "inventory_movements"
  ADD COLUMN "destination" text NOT NULL DEFAULT '',
  ADD COLUMN "recipient" text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE "inventory_price_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_id" uuid NOT NULL,
  "old_price" double precision NOT NULL,
  "new_price" double precision NOT NULL,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "changed_by" text
);
--> statement-breakpoint
ALTER TABLE "inventory_price_history" ADD CONSTRAINT "inventory_price_history_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_price_history" ADD CONSTRAINT "inventory_price_history_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "inventory_price_history_item_date_idx" ON "inventory_price_history" USING btree ("item_id", "changed_at");
--> statement-breakpoint
DELETE FROM "الكنيسة التابع لها";
--> statement-breakpoint
INSERT INTO "inventory_categories" ("name")
VALUES ('مخزن الأغذية')
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "inventory_items" ("category_id", "name", "unit", "unit_price")
SELECT category."id", header."الصنف", 'وحدة', COALESCE(header."السعر", 0)
FROM "راس المخزن" AS header
JOIN "الاصناف" AS catalog ON catalog."ID" = header."catalog_id"
CROSS JOIN "inventory_categories" AS category
WHERE category."name" = 'مخزن الأغذية'
  AND COALESCE(header."الصنف", catalog."الاصناف") ~ '(بصل|ثوم|توم|أرز|ارز|رز|عدس|فول|زيت|سكر|ملح|دقيق|مكرونة|مكرونه|لحم|لحمة|فراخ|دجاج|جبن|شاي|قهوة|لبن|صلصة|طماطم|بطاطس|خضار|فاكهة|عيش|خبز|كمون|فلفل|بهارات|سمن|بيض|سمك|مطبخ|غذائ)'
ON CONFLICT ("category_id", "name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "inventory_movements" ("item_id", "direction", "quantity", "unit_price", "movement_date", "destination", "recipient", "note")
SELECT item."id", 'in', balance."remaining", item."unit_price", CURRENT_DATE, '', '', 'رصيد افتتاحي مرحل من سجل المخزن السابق'
FROM (
  SELECT detail."رقم" AS item_number,
         SUM(COALESCE(detail."الوارد", 0) - COALESCE(detail."المنصرف", 0)) AS remaining
  FROM "اطراف المخزن" AS detail
  WHERE detail."حذف" = false AND detail."needs_review" = false
  GROUP BY detail."رقم"
) AS balance
JOIN "راس المخزن" AS header ON header."رقم" = balance.item_number
JOIN "inventory_items" AS item ON item."name" = header."الصنف"
JOIN "inventory_categories" AS category ON category."id" = item."category_id" AND category."name" = 'مخزن الأغذية'
WHERE balance.remaining > 0
  AND NOT EXISTS (
    SELECT 1 FROM "inventory_movements" AS movement
    WHERE movement."item_id" = item."id" AND movement."note" = 'رصيد افتتاحي مرحل من سجل المخزن السابق'
  );
