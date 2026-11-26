"use server";

import { and, asc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  canteenIssueLines,
  canteenIssueVouchers,
  canteenProducts,
  canteenStockLedger,
  canteenStockMovementLinks,
  canteenStockVoids,
  invoiceCategories,
  invoiceStockMovementLinks,
  residentPurchases,
  user,
  userCanteenAccess,
} from "@/db/schema";
import {
  requireAdministrator,
  requireScreenAccess,
} from "@/lib/auth-session";
import { recordAuditEvent } from "@/lib/audit-log";
import type {
  CanteenMovement,
  CanteenProduct,
} from "@/lib/canteen-types";
import type { CanteenSalesItem } from "@/lib/canteen-sales-types";

const itemSchema = z.object({
  itemNumber: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  price: z.number().finite().min(0).max(1_000_000_000).default(0),
  quantity: z.number().finite().min(0).max(1_000_000_000).optional(),
  balance: z.number().finite().min(0).max(1_000_000_000).optional(),
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
  itemNumber: z.number().int().positive(),
  direction: z.enum(["in", "out"]),
  quantity: z.number().finite().positive().max(1_000_000_000),
  movementDate: dateSchema,
  recipient: z.string().trim().max(160),
  itemCategory: z.string().trim().max(160),
});

const movementUpdateSchema = z.object({
  movementId: z.number().int().positive(),
  movementDate: dateSchema,
  quantity: z.number().finite().positive().max(1_000_000_000),
  recipient: z.string().trim().max(160),
  itemCategory: z.string().trim().max(160).default(""),
});

function todayValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

async function requireCanteenManagement() {
  const session = await requireScreenAccess("canteen");
  if (
    session.user.role === "admin" ||
    (session.user.role === "staff" &&
      session.user.canManageCanteen === true)
  ) {
    return session;
  }
  throw new Error("Canteen management is required.");
}

export async function grantStaffCanteenAccessAction(
  userIdInput: string,
  grantedInput: boolean,
): Promise<{ ok: true; granted: boolean } | { ok: false; error: string }> {
  const session = await requireAdministrator();
  const userId = z.string().min(1).max(200).safeParse(userIdInput);
  const granted = z.boolean().safeParse(grantedInput);
  if (!userId.success || !granted.success) {
    return { ok: false, error: "بيانات صلاحية الكانتين غير صالحة." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [staff] = await transaction
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, userId.data), eq(user.role, "staff")))
      .limit(1)
      .for("update");
    if (!staff) return false;

    if (granted.data) {
      await transaction
        .insert(userCanteenAccess)
        .values({ userId: userId.data, grantedBy: session.user.id })
        .onConflictDoNothing();
    } else {
      await transaction
        .delete(userCanteenAccess)
        .where(eq(userCanteenAccess.userId, userId.data));
    }
    return true;
  });

  if (result) {
    await recordAuditEvent({
      actorUserId: session.user.id,
      action: "permission-change",
      entity: "userCanteenAccess",
      entityId: userId.data,
      metadata: { fields: "canteenAccess" },
    });
  }
  return result
    ? { ok: true, granted: granted.data }
    : { ok: false, error: "لم يتم العثور على حساب الموظف." };
}

export async function saveCanteenProductAction(
  input: unknown,
): Promise<
  | {
      ok: true;
      product: CanteenProduct;
      movement: CanteenMovement | null;
      salesItem: CanteenSalesItem | null;
    }
  | { ok: false; error: string }
> {
  const session = await requireCanteenManagement();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل اسمًا وسعرًا وكمية صحيحة للصنف." };
  }
  const name = parsed.data.name.normalize("NFC");
  const database = getDatabase();
  const [duplicate] = await database
    .select({ itemNumber: canteenProducts.itemNumber })
    .from(canteenProducts)
    .where(parsed.data.itemNumber == null
      ? eq(canteenProducts.name, name)
      : and(eq(canteenProducts.name, name), ne(canteenProducts.itemNumber, parsed.data.itemNumber)))
    .limit(1);
  if (duplicate) return { ok: false, error: "اسم الصنف مستخدم بالفعل." };

  if (parsed.data.itemNumber != null) {
    const [salesItemConflict] = await database
      .select({ id: residentPurchases.id })
      .from(residentPurchases)
      .where(
        and(
          eq(residentPurchases.itemName, name),
          isNotNull(residentPurchases.canteenItemNumber),
          ne(residentPurchases.canteenItemNumber, parsed.data.itemNumber),
        ),
      )
      .limit(1);
    if (salesItemConflict) {
      return {
        ok: false,
        error:
          "اسم الصنف مستخدم في صنف مبيعات مرتبط بصنف مخزون آخر. اختر اسمًا مختلفًا أولًا.",
      };
    }
  }

  const values = { name, price: parsed.data.price, needsReview: false };
  const result = await database.transaction(async (transaction) => {
    if (parsed.data.itemNumber == null) {
      const [product] = await transaction
        .insert(canteenProducts)
        .values(values)
        .returning({
          id: canteenProducts.id,
          name: canteenProducts.name,
          price: canteenProducts.price,
          itemNumber: canteenProducts.itemNumber,
          needsReview: canteenProducts.needsReview,
        });
      if (!product) return null;

      // صنف بيع قديم بنفس الاسم وغير مرتبط بمخزون: نربطه بالصنف الجديد
      // ونوحّد الاسم والسعر بدلًا من بقاء نسختين مختلفتين.
      const [matchingPurchase] = await transaction
        .select({ id: residentPurchases.id })
        .from(residentPurchases)
        .where(
          and(
            eq(residentPurchases.itemName, name),
            isNull(residentPurchases.canteenItemNumber),
          ),
        )
        .orderBy(asc(residentPurchases.id))
        .limit(1)
        .for("update");
      if (matchingPurchase) {
        await transaction
          .update(residentPurchases)
          .set({ canteenItemNumber: product.itemNumber })
          .where(eq(residentPurchases.id, matchingPurchase.id));
      } else {
        // كل صنف مخزون جديد يصبح صنف بيع متاحًا في شاشة الكانتين،
        // حتى تبقى قائمة الأصناف واحدة في التسجيل والبيع والمخزون.
        await transaction.insert(residentPurchases).values({
          itemName: product.name,
          price: product.price,
          canteenItemNumber: product.itemNumber,
          addToResidentAccount: false,
          createdBy: session.user.id,
        });
      }
      // كل الصفوف التي تحمل الاسم نفسه (بما فيها الصف المرتبط للتو)
      // تعرض اسم وسعر صنف المخزون الجديد.
      await transaction
        .update(residentPurchases)
        .set({ itemName: product.name, price: product.price })
        .where(
          or(
            eq(residentPurchases.canteenItemNumber, product.itemNumber),
            and(
              isNull(residentPurchases.canteenItemNumber),
              sql`lower(trim(${residentPurchases.itemName})) = lower(trim(${name}))`,
            ),
          ),
        );

      const openingQuantity = parsed.data.quantity ?? 0;
      let openingMovement: CanteenMovement | null = null;
      if (openingQuantity > 0) {
        const [movement] = await transaction
          .insert(canteenStockLedger)
          .values({
            itemNumber: product.itemNumber,
            balance: openingQuantity,
            incoming: openingQuantity,
            incomingDate: todayValue(),
          })
          .returning({
            id: canteenStockLedger.id,
            balance: canteenStockLedger.balance,
            incoming: canteenStockLedger.incoming,
            incomingDate: canteenStockLedger.incomingDate,
          });
        if (movement) {
          openingMovement = {
            id: movement.id,
            itemNumber: product.itemNumber,
            itemName: product.name,
            balance: movement.balance,
            incoming: movement.incoming,
            incomingDate: movement.incomingDate,
            outgoing: null,
            outgoingDate: null,
            recipient: "",
            issueCategory: "",
            voucherId: null,
            voided: false,
            voidReason: "",
          };
        }
      }
      const [salesItemRow] = await transaction
        .select({
          id: residentPurchases.id,
          name: residentPurchases.itemName,
          price: residentPurchases.price,
          addToResidentAccount: residentPurchases.addToResidentAccount,
          canteenItemNumber: residentPurchases.canteenItemNumber,
          categoryId: residentPurchases.categoryId,
          categoryName: invoiceCategories.name,
        })
        .from(residentPurchases)
        .leftJoin(
          invoiceCategories,
          eq(invoiceCategories.id, residentPurchases.categoryId),
        )
        .where(eq(residentPurchases.canteenItemNumber, product.itemNumber))
        .orderBy(asc(residentPurchases.id))
        .limit(1);
      const salesItem: CanteenSalesItem | null = salesItemRow
        ? {
            ...salesItemRow,
            categoryName: salesItemRow.categoryName ?? "",
          }
        : null;
      return {
        product,
        balance: openingQuantity,
        movement: openingMovement,
        salesItem,
      };
    }

    const [previousProduct] = await transaction
      .select({ name: canteenProducts.name })
      .from(canteenProducts)
      .where(eq(canteenProducts.itemNumber, parsed.data.itemNumber))
      .limit(1)
      .for("update");
    if (!previousProduct) return null;
    const [product] = await transaction
      .update(canteenProducts)
      .set(values)
      .where(eq(canteenProducts.itemNumber, parsed.data.itemNumber))
      .returning({
        id: canteenProducts.id,
        name: canteenProducts.name,
        price: canteenProducts.price,
        itemNumber: canteenProducts.itemNumber,
        needsReview: canteenProducts.needsReview,
      });
    if (!product) return null;

    // أي تعديل على اسم أو سعر صنف المخزون ينعكس على صنف البيع المرتبط.
    // إن لم يكن هناك ارتباط بعد نربط أقدم صف بيع يحمل الاسم نفسه، ثم
    // نوحّد كل الصفوف المكررة حتى تعرض الشاشات القيمة نفسها.
    const [linkedPurchase] = await transaction
      .select({ id: residentPurchases.id })
      .from(residentPurchases)
      .where(eq(residentPurchases.canteenItemNumber, product.itemNumber))
      .limit(1)
      .for("update");
    if (!linkedPurchase) {
      const [candidate] = await transaction
        .select({ id: residentPurchases.id })
        .from(residentPurchases)
        .where(
          and(
            isNull(residentPurchases.canteenItemNumber),
            sql`lower(trim(${residentPurchases.itemName})) = lower(trim(${product.name}))`,
          ),
        )
        .orderBy(asc(residentPurchases.id))
        .limit(1)
        .for("update");
      if (candidate) {
        await transaction
          .update(residentPurchases)
          .set({ canteenItemNumber: product.itemNumber })
          .where(eq(residentPurchases.id, candidate.id));
      } else {
        await transaction.insert(residentPurchases).values({
          itemName: product.name,
          price: product.price,
          canteenItemNumber: product.itemNumber,
          addToResidentAccount: false,
          createdBy: session.user.id,
        });
      }
    }
    await transaction
      .update(residentPurchases)
      .set({ itemName: product.name, price: product.price })
      .where(
        or(
          eq(residentPurchases.canteenItemNumber, product.itemNumber),
          and(
            isNull(residentPurchases.canteenItemNumber),
            or(
              sql`lower(trim(${residentPurchases.itemName})) = lower(trim(${previousProduct.name}))`,
              sql`lower(trim(${residentPurchases.itemName})) = lower(trim(${product.name}))`,
            ),
          ),
        ),
      );

    let nextBalance: number | undefined;
    let adjustmentMovement: CanteenMovement | null = null;
    if (parsed.data.balance !== undefined) {
      const ledger = await transaction
        .select({
          incoming: canteenStockLedger.incoming,
          outgoing: canteenStockLedger.outgoing,
        })
        .from(canteenStockLedger)
        .leftJoin(
          canteenStockVoids,
          eq(canteenStockVoids.movementId, canteenStockLedger.id),
        )
        .where(
          and(
            eq(canteenStockLedger.itemNumber, product.itemNumber),
            isNull(canteenStockVoids.movementId),
          ),
        );
      const currentBalance = ledger.reduce(
        (total, entry) =>
          total + (entry.incoming ?? 0) - (entry.outgoing ?? 0),
        0,
      );
      const difference = parsed.data.balance - currentBalance;
      if (Math.abs(difference) > 1e-9) {
        const [movement] = await transaction
          .insert(canteenStockLedger)
          .values({
            itemNumber: product.itemNumber,
            balance: parsed.data.balance,
            incoming: difference > 0 ? difference : null,
            incomingDate: difference > 0 ? todayValue() : null,
            outgoing: difference < 0 ? -difference : null,
            outgoingDate: difference < 0 ? todayValue() : null,
          })
          .returning({
            id: canteenStockLedger.id,
            balance: canteenStockLedger.balance,
            incoming: canteenStockLedger.incoming,
            incomingDate: canteenStockLedger.incomingDate,
            outgoing: canteenStockLedger.outgoing,
            outgoingDate: canteenStockLedger.outgoingDate,
          });
        if (movement) {
          adjustmentMovement = {
            id: movement.id,
            itemNumber: product.itemNumber,
            itemName: product.name,
            balance: movement.balance,
            incoming: movement.incoming,
            incomingDate: movement.incomingDate,
            outgoing: movement.outgoing,
            outgoingDate: movement.outgoingDate,
            recipient: "",
            issueCategory: "تسوية رصيد",
            voucherId: null,
            voided: false,
            voidReason: "",
          };
        }
      }
      nextBalance = parsed.data.balance;
    }
    const [salesItemRow] = await transaction
      .select({
        id: residentPurchases.id,
        name: residentPurchases.itemName,
        price: residentPurchases.price,
        addToResidentAccount: residentPurchases.addToResidentAccount,
        canteenItemNumber: residentPurchases.canteenItemNumber,
        categoryId: residentPurchases.categoryId,
        categoryName: invoiceCategories.name,
      })
      .from(residentPurchases)
      .leftJoin(
        invoiceCategories,
        eq(invoiceCategories.id, residentPurchases.categoryId),
      )
      .where(eq(residentPurchases.canteenItemNumber, product.itemNumber))
      .orderBy(asc(residentPurchases.id))
      .limit(1);
    const salesItem: CanteenSalesItem | null = salesItemRow
      ? {
          ...salesItemRow,
          categoryName: salesItemRow.categoryName ?? "",
        }
      : null;
    return {
      product,
      balance: nextBalance,
      movement: adjustmentMovement,
      salesItem,
    };
  });

  if (!result) {
    return { ok: false, error: "تعذر حفظ صنف الكانتين." };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: parsed.data.itemNumber == null ? "create" : "update",
    entity: "canteenProducts",
    entityId: result.product.itemNumber,
    metadata: { fields: "name,price,quantity,balance" },
  });
  return {
    ok: true,
    product: { ...result.product, balance: result.balance },
    movement: result.movement ?? null,
    salesItem: result.salesItem,
  };
}

export async function recordCanteenMovementAction(
  input: unknown,
): Promise<
  { ok: true; movement: CanteenMovement }
  | { ok: false; error: string }
> {
  const session = await requireCanteenManagement();
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع الصنف والكمية والتاريخ وبيانات المستلم." };
  }
  if (parsed.data.direction === "out" && !parsed.data.recipient) {
    return { ok: false, error: "أدخل اسم المستلم للصرف." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [product] = await transaction
      .select({
        itemNumber: canteenProducts.itemNumber,
        name: canteenProducts.name,
      })
      .from(canteenProducts)
      .where(eq(canteenProducts.itemNumber, parsed.data.itemNumber))
      .limit(1)
      .for("update");
    if (!product) {
      return { error: "لم يتم العثور على صنف الكانتين." } as const;
    }

    const ledger = await transaction
      .select({
        incoming: canteenStockLedger.incoming,
        outgoing: canteenStockLedger.outgoing,
      })
      .from(canteenStockLedger)
      .leftJoin(
        canteenStockVoids,
        eq(canteenStockVoids.movementId, canteenStockLedger.id),
      )
      .where(
        and(
          eq(canteenStockLedger.itemNumber, product.itemNumber),
          isNull(canteenStockVoids.movementId),
        ),
      );
    const balance = ledger.reduce(
      (total, movement) =>
        total + (movement.incoming ?? 0) - (movement.outgoing ?? 0),
      0,
    );
    if (
      parsed.data.direction === "out" &&
      parsed.data.quantity > balance + 1e-9
    ) {
      return { error: "الكمية المنصرفة أكبر من الرصيد المتاح." } as const;
    }
    const nextBalance =
      balance +
      (parsed.data.direction === "in"
        ? parsed.data.quantity
        : -parsed.data.quantity);

    let voucherId: number | null = null;
    if (parsed.data.direction === "out") {
      const [voucher] = await transaction
        .insert(canteenIssueVouchers)
        .values({
          itemNumber: product.itemNumber,
          recipient: parsed.data.recipient,
          itemCategory: parsed.data.itemCategory,
          createdBy: session.user.id,
        })
        .returning({ id: canteenIssueVouchers.id });
      if (!voucher) {
        return { error: "تعذر إنشاء سند صرف الكانتين." } as const;
      }
      voucherId = voucher.id;
    }

    const [created] = await transaction
      .insert(canteenStockLedger)
      .values({
        balance: nextBalance,
        incoming:
          parsed.data.direction === "in" ? parsed.data.quantity : null,
        incomingDate:
          parsed.data.direction === "in" ? parsed.data.movementDate : null,
        outgoing:
          parsed.data.direction === "out" ? parsed.data.quantity : null,
        outgoingDate:
          parsed.data.direction === "out" ? parsed.data.movementDate : null,
        itemNumber: product.itemNumber,
      })
      .returning({
        id: canteenStockLedger.id,
        balance: canteenStockLedger.balance,
        incoming: canteenStockLedger.incoming,
        incomingDate: canteenStockLedger.incomingDate,
        outgoing: canteenStockLedger.outgoing,
        outgoingDate: canteenStockLedger.outgoingDate,
      });
    if (!created) {
      return { error: "تعذر تسجيل حركة مخزون الكانتين." } as const;
    }

    if (voucherId !== null) {
      await transaction.insert(canteenIssueLines).values({
        itemName: product.name,
        balance: nextBalance,
        outgoing: parsed.data.quantity,
        outgoingDate: parsed.data.movementDate,
        itemNumber: product.itemNumber,
        voucherId,
      });
      await transaction
        .insert(canteenStockMovementLinks)
        .values({ movementId: created.id, voucherId });
    }

    return {
      movement: {
        ...created,
        itemNumber: product.itemNumber,
        itemName: product.name,
        recipient:
          parsed.data.direction === "out" ? parsed.data.recipient : "",
        issueCategory:
          parsed.data.direction === "out" ? parsed.data.itemCategory : "",
        voucherId,
        voided: false,
        voidReason: "",
      },
    } as const;
  });

  if ("error" in result && typeof result.error === "string") {
    return { ok: false, error: result.error };
  }
  if (!("movement" in result) || !result.movement) {
    return { ok: false, error: "تعذر تسجيل حركة مخزون الكانتين." };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "create",
    entity: "canteenStockLedger",
    entityId: result.movement.id,
    metadata: { fields: "itemNumber,direction,quantity,movementDate" },
  });
  return { ok: true, movement: result.movement };
}

export async function voidCanteenMovementAction(
  movementIdInput: number,
  reasonInput: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdministrator();
  const movementId = z.number().int().positive().safeParse(movementIdInput);
  const reason = z.string().trim().min(1).max(500).safeParse(reasonInput);
  if (!movementId.success || !reason.success) {
    return { ok: false, error: "أدخل سببًا صحيحًا لإلغاء الحركة." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [movement] = await transaction
      .select({
        id: canteenStockLedger.id,
        itemNumber: canteenStockLedger.itemNumber,
        incoming: canteenStockLedger.incoming,
        outgoing: canteenStockLedger.outgoing,
      })
      .from(canteenStockLedger)
      .where(eq(canteenStockLedger.id, movementId.data))
      .limit(1);
    if (!movement) return { error: "حركة الكانتين غير موجودة." } as const;

    await transaction
      .select({ itemNumber: canteenProducts.itemNumber })
      .from(canteenProducts)
      .where(eq(canteenProducts.itemNumber, movement.itemNumber))
      .limit(1)
      .for("update");
    const [existingVoid] = await transaction
      .select({ movementId: canteenStockVoids.movementId })
      .from(canteenStockVoids)
      .where(eq(canteenStockVoids.movementId, movement.id))
      .limit(1);
    if (existingVoid) {
      return { error: "تم إلغاء هذه الحركة بالفعل." } as const;
    }

    const ledger = await transaction
      .select({
        incoming: canteenStockLedger.incoming,
        outgoing: canteenStockLedger.outgoing,
      })
      .from(canteenStockLedger)
      .leftJoin(
        canteenStockVoids,
        eq(canteenStockVoids.movementId, canteenStockLedger.id),
      )
      .where(
        and(
          eq(canteenStockLedger.itemNumber, movement.itemNumber),
          isNull(canteenStockVoids.movementId),
        ),
      );
    const balance = ledger.reduce(
      (total, entry) =>
        total + (entry.incoming ?? 0) - (entry.outgoing ?? 0),
      0,
    );
    const balanceAfterVoid =
      balance - (movement.incoming ?? 0) + (movement.outgoing ?? 0);
    if (balanceAfterVoid < -1e-9) {
      return {
        error: "لا يمكن إلغاء وارد استُخدم رصيده في عمليات صرف لاحقة.",
      } as const;
    }

    await transaction.insert(canteenStockVoids).values({
      movementId: movement.id,
      reason: reason.data,
      voidedBy: session.user.id,
    });
    return { ok: true } as const;
  });

  if ("error" in result && typeof result.error === "string") {
    return { ok: false, error: result.error };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "delete",
    entity: "canteenStockLedger",
    entityId: movementId.data,
    metadata: { fields: "voided,reason" },
  });
  return { ok: true };
}

/**
 * تعديل حركة مخزون الكانتين مع إعادة حساب الرصيد بعد الحركة
 * لكل الحركات اللاحقة لنفس الصنف، حتى لا تختل الأرصدة.
 */
export async function updateCanteenMovementAction(
  input: unknown,
): Promise<
  { ok: true; movement: CanteenMovement } | { ok: false; error: string }
> {
  const session = await requireCanteenManagement();
  const parsed = movementUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع الكمية والتاريخ وبيانات المستلم." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [movement] = await transaction
      .select({
        id: canteenStockLedger.id,
        itemNumber: canteenStockLedger.itemNumber,
        incoming: canteenStockLedger.incoming,
        incomingDate: canteenStockLedger.incomingDate,
        outgoing: canteenStockLedger.outgoing,
        outgoingDate: canteenStockLedger.outgoingDate,
      })
      .from(canteenStockLedger)
      .where(eq(canteenStockLedger.id, parsed.data.movementId))
      .limit(1)
      .for("update");
    if (!movement) {
      return { error: "حركة الكانتين غير موجودة." } as const;
    }

    const [existingVoid] = await transaction
      .select({ movementId: canteenStockVoids.movementId })
      .from(canteenStockVoids)
      .where(eq(canteenStockVoids.movementId, movement.id))
      .limit(1);
    if (existingVoid) {
      return { error: "لا يمكن تعديل حركة ملغاة." } as const;
    }

    // حركة ناتجة عن بيع: تعديل المخزون وحده يفصل الرصيد عن الفاتورة وحساب
    // النزيل، لذلك نطلب إلغاء البيع وإعادة إصداره بدل التعديل الجزئي.
    const [saleLink] = await transaction
      .select({ invoiceLineId: invoiceStockMovementLinks.invoiceLineId })
      .from(invoiceStockMovementLinks)
      .where(eq(invoiceStockMovementLinks.movementId, movement.id))
      .limit(1);
    if (saleLink) {
      return {
        error:
          "هذه الحركة مرتبطة بحركة بيع في الكانتين. ألغِ حركة البيع وأعد إصدارها بدل تعديل المخزون وحده.",
      } as const;
    }

    const [product] = await transaction
      .select({
        itemNumber: canteenProducts.itemNumber,
        name: canteenProducts.name,
      })
      .from(canteenProducts)
      .where(eq(canteenProducts.itemNumber, movement.itemNumber))
      .limit(1)
      .for("update");
    if (!product) {
      return { error: "لم يتم العثور على صنف الكانتين." } as const;
    }

    const direction = movement.incoming !== null ? "in" : "out";
    if (direction === "out" && !parsed.data.recipient) {
      return { error: "أدخل اسم المستلم للصرف." } as const;
    }

    const rows = await transaction
      .select({
        id: canteenStockLedger.id,
        incoming: canteenStockLedger.incoming,
        incomingDate: canteenStockLedger.incomingDate,
        outgoing: canteenStockLedger.outgoing,
        outgoingDate: canteenStockLedger.outgoingDate,
        balance: canteenStockLedger.balance,
      })
      .from(canteenStockLedger)
      .leftJoin(
        canteenStockVoids,
        eq(canteenStockVoids.movementId, canteenStockLedger.id),
      )
      .where(
        and(
          eq(canteenStockLedger.itemNumber, product.itemNumber),
          isNull(canteenStockVoids.movementId),
        ),
      )
      .orderBy(
        asc(
          sql`coalesce(${canteenStockLedger.incomingDate}, ${canteenStockLedger.outgoingDate})`,
        ),
        asc(canteenStockLedger.id),
      );

    const editedRows = rows
      .map((row) =>
        row.id === movement.id
          ? {
              ...row,
              incoming: direction === "in" ? parsed.data.quantity : null,
              incomingDate:
                direction === "in" ? parsed.data.movementDate : null,
              outgoing: direction === "out" ? parsed.data.quantity : null,
              outgoingDate:
                direction === "out" ? parsed.data.movementDate : null,
            }
          : row,
      )
      .sort((left, right) => {
        const leftDate =
          left.incomingDate ?? left.outgoingDate ?? "";
        const rightDate =
          right.incomingDate ?? right.outgoingDate ?? "";
        return leftDate === rightDate
          ? left.id - right.id
          : leftDate.localeCompare(rightDate);
      });

    let runningBalance = 0;
    const balanceUpdates: { id: number; balance: number }[] = [];
    let editedBalance = 0;
    for (const row of editedRows) {
      runningBalance += (row.incoming ?? 0) - (row.outgoing ?? 0);
      if (runningBalance < -1e-9) {
        return {
          error:
            "هذا التعديل يجعل رصيد الصنف سالبًا في تاريخ لاحق. راجع الكميات.",
        } as const;
      }
      if (row.id === movement.id) editedBalance = runningBalance;
      if (Math.abs(runningBalance - row.balance) > 1e-9) {
        balanceUpdates.push({ id: row.id, balance: runningBalance });
      }
    }

    for (const update of balanceUpdates) {
      await transaction
        .update(canteenStockLedger)
        .set({ balance: update.balance })
        .where(eq(canteenStockLedger.id, update.id));
    }

    const [link] = await transaction
      .select({ voucherId: canteenStockMovementLinks.voucherId })
      .from(canteenStockMovementLinks)
      .where(eq(canteenStockMovementLinks.movementId, movement.id))
      .limit(1);
    if (link) {
      await transaction
        .update(canteenIssueVouchers)
        .set({
          recipient: parsed.data.recipient,
          itemCategory: parsed.data.itemCategory,
        })
        .where(eq(canteenIssueVouchers.id, link.voucherId));
      await transaction
        .update(canteenIssueLines)
        .set({
          outgoing: parsed.data.quantity,
          outgoingDate: parsed.data.movementDate,
          balance: editedBalance,
        })
        .where(eq(canteenIssueLines.voucherId, link.voucherId));
    }

    return {
      movement: {
        id: movement.id,
        itemNumber: product.itemNumber,
        itemName: product.name,
        balance: editedBalance,
        incoming: direction === "in" ? parsed.data.quantity : null,
        incomingDate:
          direction === "in" ? parsed.data.movementDate : null,
        outgoing: direction === "out" ? parsed.data.quantity : null,
        outgoingDate:
          direction === "out" ? parsed.data.movementDate : null,
        recipient: parsed.data.recipient,
        issueCategory: parsed.data.itemCategory,
        voucherId: link?.voucherId ?? null,
        voided: false,
        voidReason: "",
      },
    } as const;
  });

  if ("error" in result && typeof result.error === "string") {
    return { ok: false, error: result.error };
  }
  if (!("movement" in result) || !result.movement) {
    return { ok: false, error: "تعذر تعديل حركة الكانتين." };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "update",
    entity: "canteenStockLedger",
    entityId: result.movement.id,
    metadata: {
      fields: "quantity,movementDate,recipient,itemCategory,balances",
    },
  });
  return { ok: true, movement: result.movement };
}
