"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  inventoryCategories,
  inventoryItems,
  inventoryMovements,
  user,
  userInventoryCategories,
} from "@/db/schema";
import {
  requireAdministrator,
  requireAnyStaffPermission,
} from "@/lib/auth-session";
import type {
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
} from "@/lib/inventory-types";

const idSchema = z.string().uuid();
const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
});
const itemSchema = z.object({
  categoryId: idSchema,
  name: z.string().trim().min(1).max(160),
  unit: z.string().trim().min(1).max(40),
  unitPrice: z.number().finite().min(0).max(1_000_000_000),
});
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
const movementSchema = z.object({
  itemId: idSchema,
  direction: z.enum(["in", "out"]),
  quantity: z.number().finite().positive().max(1_000_000_000),
  movementDate: dateSchema,
  note: z.string().trim().max(500),
});

export async function saveInventoryCategoryAction(
  idInput: string | null,
  input: unknown,
): Promise<
  | { ok: true; category: InventoryCategory }
  | { ok: false; error: string }
> {
  await requireAnyStaffPermission("canManageWarehouse", "canManageCustody");
  const parsed = categorySchema.safeParse(input);
  const id = idInput ? idSchema.safeParse(idInput) : null;
  if (!parsed.success || (idInput && !id?.success)) {
    return { ok: false, error: "أدخل اسمًا صحيحًا للفئة." };
  }

  const name = parsed.data.name.normalize("NFC");
  const database = getDatabase();
  const [duplicate] = await database
    .select({ id: inventoryCategories.id })
    .from(inventoryCategories)
    .where(
      id?.success
        ? and(
            eq(inventoryCategories.name, name),
            ne(inventoryCategories.id, id.data),
          )
        : eq(inventoryCategories.name, name),
    )
    .limit(1);
  if (duplicate) return { ok: false, error: "اسم الفئة مستخدم بالفعل." };

  const [category] = id?.success
    ? await database
        .update(inventoryCategories)
        .set({ name, updatedAt: new Date() })
        .where(eq(inventoryCategories.id, id.data))
        .returning({
          id: inventoryCategories.id,
          name: inventoryCategories.name,
          active: inventoryCategories.active,
        })
    : await database
        .insert(inventoryCategories)
        .values({ name })
        .returning({
          id: inventoryCategories.id,
          name: inventoryCategories.name,
          active: inventoryCategories.active,
        });

  if (!category) return { ok: false, error: "لم يتم العثور على الفئة." };
  return { ok: true, category };
}

export async function setInventoryCategoryActiveAction(
  idInput: string,
  activeInput: boolean,
): Promise<
  | { ok: true; category: InventoryCategory }
  | { ok: false; error: string }
> {
  await requireAnyStaffPermission("canManageWarehouse", "canManageCustody");
  const id = idSchema.safeParse(idInput);
  const active = z.boolean().safeParse(activeInput);
  if (!id.success || !active.success) {
    return { ok: false, error: "بيانات الفئة غير صالحة." };
  }

  const database = getDatabase();
  const category = await database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: inventoryCategories.id })
      .from(inventoryCategories)
      .where(eq(inventoryCategories.id, id.data))
      .limit(1)
      .for("update");
    if (!existing) return null;

    const [updated] = await transaction
      .update(inventoryCategories)
      .set({ active: active.data, updatedAt: new Date() })
      .where(eq(inventoryCategories.id, id.data))
      .returning({
        id: inventoryCategories.id,
        name: inventoryCategories.name,
        active: inventoryCategories.active,
      });

    if (!active.data) {
      await transaction
        .delete(userInventoryCategories)
        .where(eq(userInventoryCategories.categoryId, id.data));
    }
    return updated ?? null;
  });

  return category
    ? { ok: true, category }
    : { ok: false, error: "لم يتم العثور على الفئة." };
}

export async function saveInventoryItemAction(
  idInput: string | null,
  input: unknown,
): Promise<
  { ok: true; item: InventoryItem } | { ok: false; error: string }
> {
  await requireAnyStaffPermission("canManageWarehouse", "canManageCustody");
  const parsed = itemSchema.safeParse(input);
  const id = idInput ? idSchema.safeParse(idInput) : null;
  if (!parsed.success || (idInput && !id?.success)) {
    return { ok: false, error: "راجع بيانات الصنف والسعر والفئة." };
  }

  const draft = {
    ...parsed.data,
    name: parsed.data.name.normalize("NFC"),
    unit: parsed.data.unit.normalize("NFC"),
  };
  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [existing] = id?.success
      ? await transaction
          .select({
            id: inventoryItems.id,
            categoryId: inventoryItems.categoryId,
          })
          .from(inventoryItems)
          .where(eq(inventoryItems.id, id.data))
          .limit(1)
          .for("update")
      : [];
    if (id?.success && !existing) {
      return { error: "لم يتم العثور على الصنف." } as const;
    }

    const [category] = await transaction
      .select({
        id: inventoryCategories.id,
        active: inventoryCategories.active,
      })
      .from(inventoryCategories)
      .where(eq(inventoryCategories.id, draft.categoryId))
      .limit(1)
      .for("update");
    if (
      !category ||
      (!category.active && existing?.categoryId !== draft.categoryId)
    ) {
      return { error: "اختر فئة مخزون صالحة." } as const;
    }

    if (existing && existing.categoryId !== draft.categoryId) {
      const [movement] = await transaction
        .select({ id: inventoryMovements.id })
        .from(inventoryMovements)
        .where(eq(inventoryMovements.itemId, existing.id))
        .limit(1);
      if (movement) {
        return {
          error: "لا يمكن نقل صنف له حركات مسجلة إلى فئة أخرى.",
        } as const;
      }
    }

    const [duplicate] = await transaction
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .where(
        existing
          ? and(
              eq(inventoryItems.categoryId, draft.categoryId),
              eq(inventoryItems.name, draft.name),
              ne(inventoryItems.id, existing.id),
            )
          : and(
              eq(inventoryItems.categoryId, draft.categoryId),
              eq(inventoryItems.name, draft.name),
            ),
      )
      .limit(1);
    if (duplicate) {
      return { error: "يوجد صنف بهذا الاسم في الفئة المحددة." } as const;
    }

    const [item] = existing
      ? await transaction
          .update(inventoryItems)
          .set({ ...draft, updatedAt: new Date() })
          .where(eq(inventoryItems.id, existing.id))
          .returning({
            id: inventoryItems.id,
            categoryId: inventoryItems.categoryId,
            name: inventoryItems.name,
            unit: inventoryItems.unit,
            unitPrice: inventoryItems.unitPrice,
            active: inventoryItems.active,
          })
      : await transaction
          .insert(inventoryItems)
          .values(draft)
          .returning({
            id: inventoryItems.id,
            categoryId: inventoryItems.categoryId,
            name: inventoryItems.name,
            unit: inventoryItems.unit,
            unitPrice: inventoryItems.unitPrice,
            active: inventoryItems.active,
          });
    return { item } as const;
  });

  if ("error" in result && result.error) {
    return { ok: false, error: result.error };
  }
  if (!("item" in result) || !result.item) {
    return { ok: false, error: "تعذر حفظ الصنف." };
  }
  return { ok: true, item: result.item };
}

export async function setInventoryItemActiveAction(
  idInput: string,
  activeInput: boolean,
): Promise<
  { ok: true; item: InventoryItem } | { ok: false; error: string }
> {
  await requireAnyStaffPermission("canManageWarehouse", "canManageCustody");
  const id = idSchema.safeParse(idInput);
  const active = z.boolean().safeParse(activeInput);
  if (!id.success || !active.success) {
    return { ok: false, error: "بيانات الصنف غير صالحة." };
  }

  const [item] = await getDatabase()
    .update(inventoryItems)
    .set({ active: active.data, updatedAt: new Date() })
    .where(eq(inventoryItems.id, id.data))
    .returning({
      id: inventoryItems.id,
      categoryId: inventoryItems.categoryId,
      name: inventoryItems.name,
      unit: inventoryItems.unit,
      unitPrice: inventoryItems.unitPrice,
      active: inventoryItems.active,
    });

  return item
    ? { ok: true, item }
    : { ok: false, error: "لم يتم العثور على الصنف." };
}

export async function recordInventoryMovementAction(
  input: unknown,
): Promise<
  { ok: true; movement: InventoryMovement }
  | { ok: false; error: string }
> {
  const session = await requireAnyStaffPermission("canManageWarehouse", "canManageCustody");
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع نوع الحركة والكمية والتاريخ." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [item] = await transaction
      .select({
        id: inventoryItems.id,
        categoryId: inventoryItems.categoryId,
        name: inventoryItems.name,
        unitPrice: inventoryItems.unitPrice,
        active: inventoryItems.active,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, parsed.data.itemId))
      .limit(1)
      .for("update");
    if (!item || !item.active) {
      return { error: "لم يتم العثور على الصنف أو أنه غير نشط." } as const;
    }

    const movements = await transaction
      .select({
        direction: inventoryMovements.direction,
        quantity: inventoryMovements.quantity,
      })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.itemId, item.id),
          eq(inventoryMovements.voided, false),
        ),
      );
    const balance = movements.reduce(
      (total, movement) =>
        total +
        (movement.direction === "in" ? movement.quantity : -movement.quantity),
      0,
    );
    if (
      parsed.data.direction === "out" &&
      parsed.data.quantity > balance + 1e-9
    ) {
      return { error: "الكمية المنصرفة أكبر من الرصيد المتاح." } as const;
    }

    const [created] = await transaction
      .insert(inventoryMovements)
      .values({
        ...parsed.data,
        unitPrice: item.unitPrice,
        createdBy: session.user.id,
      })
      .returning({
        id: inventoryMovements.id,
        itemId: inventoryMovements.itemId,
        direction: inventoryMovements.direction,
        quantity: inventoryMovements.quantity,
        unitPrice: inventoryMovements.unitPrice,
        movementDate: inventoryMovements.movementDate,
        note: inventoryMovements.note,
        voided: inventoryMovements.voided,
      });

    return {
      movement: {
        ...created,
        categoryId: item.categoryId,
        itemName: item.name,
      },
    } as const;
  });

  if ("error" in result && result.error) {
    return { ok: false, error: result.error };
  }
  if (!("movement" in result) || !result.movement) {
    return { ok: false, error: "تعذر تسجيل حركة المخزون." };
  }
  return { ok: true, movement: result.movement };
}

export async function voidInventoryMovementAction(
  idInput: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAnyStaffPermission("canManageWarehouse", "canManageCustody");
  const id = idSchema.safeParse(idInput);
  if (!id.success) {
    return { ok: false, error: "معرّف حركة المخزون غير صالح." };
  }

  const [movement] = await getDatabase()
    .update(inventoryMovements)
    .set({
      voided: true,
      voidedAt: new Date(),
      voidedBy: session.user.id,
    })
    .where(
      and(
        eq(inventoryMovements.id, id.data),
        eq(inventoryMovements.voided, false),
      ),
    )
    .returning({ id: inventoryMovements.id });

  return movement
    ? { ok: true }
    : { ok: false, error: "الحركة غير موجودة أو ملغاة بالفعل." };
}

export async function updateStaffInventoryAccessAction(
  userIdInput: string,
  categoryIdsInput: unknown,
): Promise<
  | { ok: true; categoryIds: string[] }
  | { ok: false; error: string }
> {
  const session = await requireAdministrator();
  const userId = z.string().min(1).max(200).safeParse(userIdInput);
  const categoryIds = z.array(idSchema).max(100).safeParse(categoryIdsInput);
  if (!userId.success || !categoryIds.success) {
    return { ok: false, error: "بيانات صلاحيات المخزون غير صالحة." };
  }

  const uniqueCategoryIds = [...new Set(categoryIds.data)];
  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [staff] = await transaction
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, userId.data), ne(user.role, "admin")))
      .limit(1)
      .for("update");
    if (!staff) return false;

    if (uniqueCategoryIds.length) {
      const foundCategories = await transaction
        .select({ id: inventoryCategories.id })
        .from(inventoryCategories)
        .where(
          and(
            inArray(inventoryCategories.id, uniqueCategoryIds),
            eq(inventoryCategories.active, true),
          ),
        );
      if (foundCategories.length !== uniqueCategoryIds.length) return false;
    }

    await transaction
      .delete(userInventoryCategories)
      .where(eq(userInventoryCategories.userId, userId.data));

    if (uniqueCategoryIds.length) {
      await transaction.insert(userInventoryCategories).values(
        uniqueCategoryIds.map((categoryId) => ({
          userId: userId.data,
          categoryId,
          grantedBy: session.user.id,
        })),
      );
    }
    return true;
  });

  return result
    ? { ok: true, categoryIds: uniqueCategoryIds }
    : { ok: false, error: "لم يتم العثور على الموظف أو إحدى فئات المخزون." };
}
