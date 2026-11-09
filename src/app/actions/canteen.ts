"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  canteenIssueLines,
  canteenIssueVouchers,
  canteenProducts,
  canteenStockLedger,
  canteenStockMovementLinks,
  canteenStockVoids,
  user,
  userCanteenAccess,
} from "@/db/schema";
import {
  requireAdministrator,
  requireScreenAccess,
} from "@/lib/auth-session";
import type {
  CanteenMovement,
  CanteenProduct,
} from "@/lib/canteen-types";

const itemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  price: z.number().finite().min(0).max(1_000_000_000).default(0),
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

async function requireCanteenAccess() {
  const session = await requireScreenAccess("canteen");
  if (session.user.role === "admin") return session;

  const [grant] = await getDatabase()
    .select({ userId: userCanteenAccess.userId })
    .from(userCanteenAccess)
    .where(eq(userCanteenAccess.userId, session.user.id))
    .limit(1);
  if (!grant) throw new Error("Canteen access is required.");
  return session;
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
      .where(and(eq(user.id, userId.data), ne(user.role, "admin")))
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

  return result
    ? { ok: true, granted: granted.data }
    : { ok: false, error: "لم يتم العثور على حساب الموظف." };
}

export async function saveCanteenProductAction(
  input: unknown,
): Promise<
  { ok: true; product: CanteenProduct } | { ok: false; error: string }
> {
  await requireCanteenAccess();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل اسمًا صحيحًا للصنف." };
  }
  const name = parsed.data.name.normalize("NFC");
  const database = getDatabase();
  const [duplicate] = await database
    .select({ itemNumber: canteenProducts.itemNumber })
    .from(canteenProducts)
    .where(eq(canteenProducts.name, name))
    .limit(1);
  if (duplicate) return { ok: false, error: "اسم الصنف مستخدم بالفعل." };

  const [product] = await database
    .insert(canteenProducts)
    .values({ name, price: parsed.data.price })
    .returning({
      id: canteenProducts.id,
      name: canteenProducts.name,
      price: canteenProducts.price,
      itemNumber: canteenProducts.itemNumber,
    });
  if (!product) {
    return { ok: false, error: "تعذر حفظ صنف الكانتين." };
  }
  return { ok: true, product };
}

export async function recordCanteenMovementAction(
  input: unknown,
): Promise<
  { ok: true; movement: CanteenMovement }
  | { ok: false; error: string }
> {
  const session = await requireCanteenAccess();
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
  return { ok: true };
}
