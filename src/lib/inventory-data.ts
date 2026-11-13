import "server-only";

import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
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
  const canViewAll =
    session.user.role === "admin" ||
    session.user.role === "viewer" ||
    session.user.canManageWarehouse === true;

  const categories = canViewAll
      ? await database
          .select({
            id: inventoryCategories.id,
            name: inventoryCategories.name,
            active: inventoryCategories.active,
          })
          .from(inventoryCategories)
          .where(
            notInArray(inventoryCategories.name, excludedInventoryCategoryNames),
          )
          .orderBy(inventoryCategories.name)
      : await database
          .select({
            id: inventoryCategories.id,
            name: inventoryCategories.name,
            active: inventoryCategories.active,
          })
          .from(userInventoryCategories)
          .innerJoin(
            inventoryCategories,
            eq(userInventoryCategories.categoryId, inventoryCategories.id),
          )
          .where(
            and(
              eq(userInventoryCategories.userId, session.user.id),
              eq(inventoryCategories.active, true),
              notInArray(inventoryCategories.name, excludedInventoryCategoryNames),
            ),
          )
          .orderBy(inventoryCategories.name);

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
  const items =
    canViewAll
      ? await itemsQuery.where(inArray(inventoryItems.categoryId, categoryIds))
      : await itemsQuery.where(
          and(
            inArray(inventoryItems.categoryId, categoryIds),
            eq(inventoryItems.active, true),
          ),
        );

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
        desc(inventoryMovements.movementDate),
        desc(inventoryMovements.createdAt),
      );

  return { categories, items, movements };
}
