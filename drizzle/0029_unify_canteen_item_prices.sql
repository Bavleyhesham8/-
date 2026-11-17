-- توحيد أصناف الكانتين: صنف المخزون وصنف البيع المرتبط به يمثلان الصنف نفسه.
-- الاسم يُؤخذ من صنف المخزون، وسعر البيع يُعكس على سعر المخزون حتى تتفق
-- كل الشاشات والفواتير الجديدة على قيمة واحدة. الفواتير القديمة تبقى كما هي.

UPDATE "مشتريات النزلاء" AS p
SET "الصنف" = c."اسم الصنف"
FROM "كانتين" AS c
WHERE p.canteen_item_number = c."رقم الصنف"
  AND p."الصنف" <> c."اسم الصنف";

UPDATE "كانتين" AS c
SET "السعر" = p."السعر"
FROM "مشتريات النزلاء" AS p
WHERE p.canteen_item_number = c."رقم الصنف"
  AND p."السعر" IS DISTINCT FROM c."السعر";

CREATE UNIQUE INDEX IF NOT EXISTS "resident_purchases_canteen_item_number_key"
  ON "مشتريات النزلاء" (canteen_item_number)
  WHERE canteen_item_number IS NOT NULL;
