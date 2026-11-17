-- ربط أصناف البيع القديمة بأصناف المخزون التي تحمل الاسم نفسه.
-- عند وجود أكثر من صنف بيع بالاسم نفسه نربط الأقدم فقط، لأن الفهرس الفريد
-- يسمح بارتباط واحد لكل صنف مخزون، ثم نوحّد الاسم والسعر على كل الصفوف
-- المكررة حتى تعرض كل الشاشات القيمة نفسها.

WITH exact_matches AS (
  SELECT DISTINCT ON (p."ID")
    p."ID" AS purchase_id,
    c."رقم الصنف" AS item_number
  FROM "مشتريات النزلاء" p
  JOIN "كانتين" c
    ON lower(trim(p."الصنف")) = lower(trim(c."اسم الصنف"))
  WHERE p.canteen_item_number IS NULL
  ORDER BY p."ID", c."رقم الصنف"
),
ranked AS (
  SELECT
    purchase_id,
    item_number,
    row_number() OVER (PARTITION BY item_number ORDER BY purchase_id) AS rn
  FROM exact_matches
)
UPDATE "مشتريات النزلاء" p
SET canteen_item_number = ranked.item_number
FROM ranked
WHERE p."ID" = ranked.purchase_id
  AND ranked.rn = 1;

-- الاسم من صنف المخزون، والسعر من صنف البيع المرتبط (سعر البيع الفعلي).
UPDATE "مشتريات النزلاء" AS p
SET "الصنف" = c."اسم الصنف"
FROM "كانتين" AS c
WHERE p.canteen_item_number = c."رقم الصنف"
  AND p."الصنف" <> c."اسم الصنف";

UPDATE "كانتين" AS c
SET "السعر" = p."السعر"
FROM "مشتريات النزلاء" AS p
WHERE p.canteen_item_number = c."رقم الصنف"
  AND c."السعر" IS DISTINCT FROM p."السعر";

-- الصفوف المكررة غير المرتبطة تبقى في السجل التاريخي، لكنها تعرض نفس
-- اسم وسعر الصنف المرتبط بدلًا من قيمة قديمة مختلفة.
UPDATE "مشتريات النزلاء" AS p
SET "الصنف" = c."اسم الصنف",
    "السعر" = c."السعر"
FROM "كانتين" AS c
WHERE p.canteen_item_number IS NULL
  AND lower(trim(p."الصنف")) = lower(trim(c."اسم الصنف"))
  AND (
    p."الصنف" <> c."اسم الصنف"
    OR p."السعر" IS DISTINCT FROM c."السعر"
  );
