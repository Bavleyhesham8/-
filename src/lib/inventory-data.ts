import "server-only";

import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  inventoryCategories,
  inventoryItems,
  inventoryMovements,
  userInventoryCategories,
} from "@/db/schema";
import { requireAnyScreenAccess, requireCurrentSession } from "@/lib/auth-session";
import type { InventoryBundle } from "@/lib/inventory-types";

const excludedInventoryCategoryNames = [
  "الكانتين",
  "كانتين",
  "الثلاجة",
  "ثلاجة",
];

export async function listInventoryForCurrentUser(): Promise<InventoryBundle> {
  const session = await requireCurrentSession();
  await requireAnyScreenAccess("inventory", "tracking");
  const database = getDatabase();
  const canManageWarehouse =
    session.user.role === "admin" ||
    session.user.canManageWarehouse === true;

  const [allCategories, grantedCategoryRows] = await Promise.all([
    database
      .select({
        id: inventoryCategories.id,
        name: inventoryCategories.name,
        active: inventoryCategories.active,
      })
      .from(inventoryCategories)
      .where(
        notInArray(inventoryCategories.name, excludedInventoryCategoryNames),
      )
      .orderBy(inventoryCategories.name),
    database
      .select({ categoryId: userInventoryCategories.categoryId })
      .from(userInventoryCategories)
      .where(eq(userInventoryCategories.userId, session.user.id)),
  ]);

  // شاشة المخزن تمنح قراءة كل الفئات افتراضيًا. إذا حدد المدير فئات
  // بعينها لهذا الموظف تصبح هي نطاق العرض المسموح.
  const grantedCategoryIds = new Set(
    grantedCategoryRows.map((row) => row.categoryId),
  );
  const restrictToGranted =
    !canManageWarehouse && grantedCategoryIds.size > 0;
  const categories = restrictToGranted
    ? allCategories.filter(
        (category) => category.active && grantedCategoryIds.has(category.id),
      )
    : allCategories;

  const categoryIds = categories.map((category) => category.id);
  if (!categoryIds.length) return { categories, items: [], movements: [] };

  const itemsQuery = database
      .select({
        id: inventoryItems.id,
        categoryId: inventoryItems.categoryId,
        name: inventoryItems.name,
        unit: inventoryItems.unit,
        unitPrice: inventoryItems.unitPrice,
        active: inventoryItems.active,
      })
      .from(inventoryItems)
      .orderBy(inventoryItems.name);
  const items = restrictToGranted
    ? await itemsQuery.where(
        and(
          inArray(inventoryItems.categoryId, categoryIds),
          eq(inventoryItems.active, true),
        ),
      )
    : await itemsQuery.where(inArray(inventoryItems.categoryId, categoryIds));

  const movements = await database
      .select({
        id: inventoryMovements.id,
        itemId: inventoryMovements.itemId,
        itemName: inventoryItems.name,
        categoryId: inventoryItems.categoryId,
        direction: inventoryMovements.direction,
        quantity: inventoryMovements.quantity,
        unitPrice: inventoryMovements.unitPrice,
        movementDate: inventoryMovements.movementDate,
        destination: inventoryMovements.destination,
        recipient: inventoryMovements.recipient,
        note: inventoryMovements.note,
        voided: inventoryMovements.voided,
      })
      .from(inventoryMovements)
      .innerJoin(
        inventoryItems,
        eq(inventoryMovements.itemId, inventoryItems.id),
      )
      .where(inArray(inventoryItems.categoryId, categoryIds))
      .orderBy(
        asc(inventoryMovements.movementDate),
        asc(inventoryMovements.createdAt),
      );

  return { categories, items, movements };
}
