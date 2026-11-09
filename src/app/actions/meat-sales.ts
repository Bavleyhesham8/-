"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  meatSalePayments,
  meatSaleStockMovementLinks,
  meatSaleVoids,
  meatSalesInvoiceLines,
  meatSalesInvoices,
  refrigeratorItemCatalog,
  refrigeratorItems,
  refrigeratorStockLedger,
  refrigeratorStockVoids,
} from "@/db/schema";
import { requireStaffPermission } from "@/lib/auth-session";
import type {
  MeatSaleInvoice,
  MeatSaleLine,
  MeatSalePayment,
  RefrigeratorCatalogItem,
  RefrigeratorMovement,
  RefrigeratorProduct,
} from "@/lib/meat-sales-types";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  });

const productSchema = z.object({
  itemCategory: z.string().trim().min(1).max(160),
  price: z.number().finite().min(0).max(1_000_000_000),
  quantity: z.number().finite().min(0).max(1_000_000_000),
});

const receiptSchema = z.object({
  itemNumber: z.number().int().positive(),
  quantity: z.number().finite().positive().max(1_000_000),
  price: z.number().finite().min(0).max(1_000_000_000),
  receivedDate: dateSchema,
});

const saleSchema = z.object({
  saleDate: dateSchema,
  issuePermitNumber: z.number().finite().positive().nullable(),
  beneficiary: z.string().trim().min(1).max(160),
  items: z
    .array(
      z.object({
        itemNumber: z.number().int().positive(),
        price: z.number().finite().min(0).max(1_000_000_000),
        quantity: z.number().finite().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(100),
});

class MeatSalesActionError extends Error {}

export async function saveRefrigeratorProductAction(
  input: unknown,
): Promise<
  | {
      ok: true;
      catalogItem: RefrigeratorCatalogItem;
      product: RefrigeratorProduct;
    }
  | { ok: false; error: string }
> {
  await requireStaffPermission("canManageMeatSales");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل اسم الصنف والسعر والكمية بصورة صحيحة." };
  }
  const itemCategory = parsed.data.itemCategory.normalize("NFC");
  const database = getDatabase();
  try {
    const result = await database.transaction(async (transaction) => {
      const [catalogItem] = await transaction
        .insert(refrigeratorItemCatalog)
        .values({
          itemCategory,
          price: parsed.data.price,
          quantity: parsed.data.quantity,
        })
        .onConflictDoNothing()
        .returning({
          id: refrigeratorItemCatalog.id,
          itemCategory: refrigeratorItemCatalog.itemCategory,
          price: refrigeratorItemCatalog.price,
          quantity: refrigeratorItemCatalog.quantity,
        });
      if (!catalogItem) {
        return { error: "اسم الصنف مستخدم بالفعل في دليل الأصناف." } as const;
      }

      const [product] = await transaction
        .insert(refrigeratorItems)
        .values({
          itemCategory,
          catalogId: catalogItem.id,
        })
        .returning({
          id: refrigeratorItems.id,
          itemNumber: refrigeratorItems.itemNumber,
          catalogId: refrigeratorItems.catalogId,
          itemCategory: refrigeratorItems.itemCategory,
          voucherNumber: refrigeratorItems.voucherNumber,
          beneficiary: refrigeratorItems.beneficiary,
        });
      if (!product) {
        throw new MeatSalesActionError("تعذر تسجيل صنف الثلاجة.");
      }
      return { catalogItem, product } as const;
    });
    if ("error" in result && typeof result.error === "string") {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      catalogItem: result.catalogItem,
      product: {
        ...result.product,
        voucherNumber: result.product.voucherNumber ?? null,
        beneficiary: result.product.beneficiary,
      },
    };
  } catch (error) {
    if (error instanceof MeatSalesActionError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function recordRefrigeratorReceiptAction(
  input: unknown,
): Promise<
  { ok: true; movement: RefrigeratorMovement }
  | { ok: false; error: string }
> {
  const session = await requireStaffPermission("canManageMeatSales");
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع صنف الثلاجة والكمية والسعر والتاريخ." };
  }
  const database = getDatabase();
  try {
    const result = await database.transaction(async (transaction) => {
      const [product] = await transaction
        .select({
          itemNumber: refrigeratorItems.itemNumber,
          itemCategory: refrigeratorItems.itemCategory,
        })
        .from(refrigeratorItems)
        .where(eq(refrigeratorItems.itemNumber, parsed.data.itemNumber))
        .limit(1)
        .for("update");
      if (!product) return { error: "لم يتم العثور على صنف الثلاجة." } as const;

      const [movement] = await transaction
        .insert(refrigeratorStockLedger)
        .values({
          itemCategory: product.itemCategory,
          quantity: parsed.data.quantity,
          price: parsed.data.price,
          total: parsed.data.quantity * parsed.data.price,
          itemNumber: product.itemNumber,
          direction: "in",
          receivedDate: parsed.data.receivedDate,
          createdBy: session.user.id,
        })
        .returning({ id: refrigeratorStockLedger.id });
      if (!movement) {
        throw new MeatSalesActionError("تعذر تسجيل وارد الثلاجة.");
      }
      return {
        movement: {
          id: movement.id,
          itemNumber: product.itemNumber,
          itemCategory: product.itemCategory,
          direction: "in" as const,
          quantity: parsed.data.quantity,
          price: parsed.data.price,
          total: parsed.data.quantity * parsed.data.price,
          outgoing: null,
          receivedDate: parsed.data.receivedDate,
          outgoingDate: null,
          issuePermitNumber: null,
          recipient: "",
          voided: false,
          voidReason: "",
        },
      } as const;
    });
    if ("error" in result && typeof result.error === "string") {
      return { ok: false, error: result.error };
    }
    return { ok: true, movement: result.movement };
  } catch (error) {
    if (error instanceof MeatSalesActionError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function createMeatSaleAction(
  input: unknown,
): Promise<
  { ok: true; invoice: MeatSaleInvoice; movements: RefrigeratorMovement[] }
  | { ok: false; error: string }
> {
  const session = await requireStaffPermission("canManageMeatSales");
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع التاريخ والمستفيد وبنود الفاتورة." };
  }

  const database = getDatabase();
  try {
    const result = await database.transaction(async (transaction) => {
      const itemNumbers = [
        ...new Set(parsed.data.items.map((item) => item.itemNumber)),
      ].sort((a, b) => a - b);
      const products = await transaction
        .select({
          id: refrigeratorItems.id,
          itemNumber: refrigeratorItems.itemNumber,
          itemCategory: refrigeratorItems.itemCategory,
          catalogId: refrigeratorItems.catalogId,
          price: refrigeratorItemCatalog.price,
        })
        .from(refrigeratorItems)
        .innerJoin(
          refrigeratorItemCatalog,
          eq(refrigeratorItemCatalog.id, refrigeratorItems.catalogId),
        )
        .where(inArray(refrigeratorItems.itemNumber, itemNumbers))
        .orderBy(refrigeratorItems.itemNumber)
        .for("update");
      if (products.length !== itemNumbers.length) {
        return { error: "لم يتم العثور على أحد أصناف الثلاجة." } as const;
      }
      const productByNumber = new Map(
        products.map((product) => [product.itemNumber, product]),
      );
      const total = parsed.data.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );
      if (!Number.isFinite(total) || total <= 0) {
        return { error: "إجمالي الفاتورة غير صالح." } as const;
      }

      const ledger = await transaction
        .select({
          id: refrigeratorStockLedger.id,
          itemNumber: refrigeratorStockLedger.itemNumber,
          quantity: refrigeratorStockLedger.quantity,
          outgoing: refrigeratorStockLedger.outgoing,
        })
        .from(refrigeratorStockLedger)
        .leftJoin(
          refrigeratorStockVoids,
          eq(
            refrigeratorStockVoids.movementId,
            refrigeratorStockLedger.id,
          ),
        )
        .where(
          and(
            inArray(refrigeratorStockLedger.itemNumber, itemNumbers),
            isNull(refrigeratorStockVoids.movementId),
          ),
        );
      const balances = new Map<number, number>();
      for (const movement of ledger) {
        balances.set(
          movement.itemNumber,
          (balances.get(movement.itemNumber) ?? 0) +
            (movement.quantity ?? 0) -
            (movement.outgoing ?? 0),
        );
      }
      const requested = new Map<number, number>();
      for (const item of parsed.data.items) {
        requested.set(
          item.itemNumber,
          (requested.get(item.itemNumber) ?? 0) + item.quantity,
        );
      }
      for (const [itemNumber, quantity] of requested) {
        if (quantity > (balances.get(itemNumber) ?? 0) + 1e-9) {
          return {
            error: `الرصيد المتاح غير كافٍ للصنف ${productByNumber.get(itemNumber)?.itemCategory ?? itemNumber}.`,
          } as const;
        }
      }

      const [header] = await transaction
        .insert(meatSalesInvoices)
        .values({
          saleDate: parsed.data.saleDate,
          issuePermitNumber: parsed.data.issuePermitNumber,
          beneficiary: parsed.data.beneficiary,
          createdBy: session.user.id,
        })
        .returning({ invoiceNumber: meatSalesInvoices.invoiceNumber });
      if (!header) {
        throw new MeatSalesActionError("تعذر إنشاء فاتورة بيع اللحوم.");
      }

      const movements: RefrigeratorMovement[] = [];
      const lines: MeatSaleLine[] = [];
      for (const item of parsed.data.items) {
        const product = productByNumber.get(item.itemNumber);
        if (!product) {
          throw new MeatSalesActionError("تعذر العثور على صنف الفاتورة.");
        }
        const lineTotal = item.price * item.quantity;
        const balanceAfter =
          (balances.get(item.itemNumber) ?? 0) - item.quantity;
        balances.set(item.itemNumber, balanceAfter);
        const [line] = await transaction
          .insert(meatSalesInvoiceLines)
          .values({
            itemCategory: product.itemCategory,
            price: item.price,
            quantity: item.quantity,
            total: lineTotal,
            saleDate: parsed.data.saleDate,
            invoiceNumber: header.invoiceNumber,
            refrigeratorItemNumber: item.itemNumber,
          })
          .returning({ id: meatSalesInvoiceLines.id });
        if (!line) {
          throw new MeatSalesActionError("تعذر حفظ أحد بنود فاتورة اللحوم.");
        }

        const [stockMovement] = await transaction
          .insert(refrigeratorStockLedger)
          .values({
            itemCategory: product.itemCategory,
            price: item.price,
            total: lineTotal,
            outgoing: item.quantity,
            outgoingDate: parsed.data.saleDate,
            issuePermitNumber: parsed.data.issuePermitNumber,
            recipient: parsed.data.beneficiary,
            itemNumber: item.itemNumber,
            direction: "out",
            createdBy: session.user.id,
          })
          .returning({ id: refrigeratorStockLedger.id });
        if (!stockMovement) {
          throw new MeatSalesActionError("تعذر خصم الصنف من مخزون الثلاجة.");
        }
        await transaction
          .insert(meatSaleStockMovementLinks)
          .values({ invoiceLineId: line.id, movementId: stockMovement.id });
        movements.push({
          id: stockMovement.id,
          itemNumber: item.itemNumber,
          itemCategory: product.itemCategory,
          direction: "out",
          quantity: null,
          price: item.price,
          total: lineTotal,
          outgoing: item.quantity,
          receivedDate: null,
          outgoingDate: parsed.data.saleDate,
          issuePermitNumber: parsed.data.issuePermitNumber,
          recipient: parsed.data.beneficiary,
          voided: false,
          voidReason: "",
        });
        lines.push({
          id: line.id,
          itemCategory: product.itemCategory,
          price: item.price,
          quantity: item.quantity,
          total: lineTotal,
          refrigeratorItemNumber: item.itemNumber,
          movementId: stockMovement.id,
        });
      }

      const [payment] = await transaction
        .insert(meatSalePayments)
        .values({
          invoiceNumber: header.invoiceNumber,
          amount: total,
          paymentDate: parsed.data.saleDate,
          createdBy: session.user.id,
        })
        .returning({
          id: meatSalePayments.id,
          kind: meatSalePayments.kind,
          amount: meatSalePayments.amount,
          paymentDate: meatSalePayments.paymentDate,
        });
      if (!payment) {
        throw new MeatSalesActionError("تعذر تسجيل سداد فاتورة اللحوم.");
      }
      const invoice: MeatSaleInvoice = {
        invoiceNumber: header.invoiceNumber,
        saleDate: parsed.data.saleDate,
        issuePermitNumber: parsed.data.issuePermitNumber,
        beneficiary: parsed.data.beneficiary,
        lines,
        total,
        paid: total,
        voided: false,
        voidReason: "",
        payments: [payment],
      };
      return { invoice, movements } as const;
    });
    if ("error" in result && typeof result.error === "string") {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      invoice: result.invoice,
      movements: result.movements,
    };
  } catch (error) {
    if (error instanceof MeatSalesActionError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function voidMeatSaleAction(
  invoiceNumberInput: number,
  reasonInput: string,
  confirmRefundInput: boolean,
): Promise<
  { ok: true; refund: MeatSalePayment | null; movementIds: number[] }
  | { ok: false; error: string }
> {
  const session = await requireStaffPermission("canManageMeatSales");
  const invoiceNumber = z.number().int().positive().safeParse(invoiceNumberInput);
  const reason = z.string().trim().min(1).max(500).safeParse(reasonInput);
  const confirmRefund = z.boolean().safeParse(confirmRefundInput);
  if (!invoiceNumber.success || !reason.success || !confirmRefund.success) {
    return { ok: false, error: "أدخل سبب إلغاء صحيحًا." };
  }

  const database = getDatabase();
  try {
    const result = await database.transaction(async (transaction) => {
      const [invoice] = await transaction
        .select({ invoiceNumber: meatSalesInvoices.invoiceNumber })
        .from(meatSalesInvoices)
        .where(eq(meatSalesInvoices.invoiceNumber, invoiceNumber.data))
        .limit(1)
        .for("update");
      if (!invoice) return { error: "لم يتم العثور على الفاتورة." } as const;

      const [existingVoid] = await transaction
        .select({ invoiceNumber: meatSaleVoids.invoiceNumber })
        .from(meatSaleVoids)
        .where(eq(meatSaleVoids.invoiceNumber, invoice.invoiceNumber))
        .limit(1);
      if (existingVoid) {
        return { error: "تم إلغاء هذه الفاتورة بالفعل." } as const;
      }

      const payments = await transaction
        .select({
          kind: meatSalePayments.kind,
          amount: meatSalePayments.amount,
        })
        .from(meatSalePayments)
        .where(eq(meatSalePayments.invoiceNumber, invoice.invoiceNumber));
      const netPaid = payments.reduce(
        (sum, payment) =>
          sum + (payment.kind === "payment" ? payment.amount : -payment.amount),
        0,
      );
      if (netPaid > 0 && !confirmRefund.data) {
        return {
          error: "أكد رد المبلغ المسدد قبل إلغاء الفاتورة.",
        } as const;
      }

      const movements = await transaction
        .select({
          movementId: meatSaleStockMovementLinks.movementId,
          itemNumber: refrigeratorStockLedger.itemNumber,
        })
        .from(meatSaleStockMovementLinks)
        .innerJoin(
          refrigeratorStockLedger,
          eq(refrigeratorStockLedger.id, meatSaleStockMovementLinks.movementId),
        )
        .innerJoin(
          meatSalesInvoiceLines,
          eq(meatSalesInvoiceLines.id, meatSaleStockMovementLinks.invoiceLineId),
        )
        .where(eq(meatSalesInvoiceLines.invoiceNumber, invoice.invoiceNumber));
      const itemNumbers = [
        ...new Set(movements.map((movement) => movement.itemNumber)),
      ].sort((a, b) => a - b);
      if (itemNumbers.length) {
        const lockedProducts = await transaction
          .select({ itemNumber: refrigeratorItems.itemNumber })
          .from(refrigeratorItems)
          .where(inArray(refrigeratorItems.itemNumber, itemNumbers))
          .orderBy(refrigeratorItems.itemNumber)
          .for("update");
        if (lockedProducts.length !== itemNumbers.length) {
          return {
            error: "تعذر قفل أصناف الثلاجة المرتبطة بالفاتورة.",
          } as const;
        }
      }

      let refund: MeatSalePayment | null = null;
      if (netPaid > 0) {
        const [createdRefund] = await transaction
          .insert(meatSalePayments)
          .values({
            invoiceNumber: invoice.invoiceNumber,
            kind: "refund",
            amount: netPaid,
            paymentDate: new Date().toISOString().slice(0, 10),
            createdBy: session.user.id,
          })
          .returning({
            id: meatSalePayments.id,
            kind: meatSalePayments.kind,
            amount: meatSalePayments.amount,
            paymentDate: meatSalePayments.paymentDate,
          });
        if (!createdRefund) {
          throw new MeatSalesActionError("تعذر تسجيل رد المبلغ.");
        }
        refund = createdRefund;
      }

      const movementIds: number[] = [];
      for (const movement of movements) {
        movementIds.push(movement.movementId);
        const [existingMovementVoid] = await transaction
          .select({ movementId: refrigeratorStockVoids.movementId })
          .from(refrigeratorStockVoids)
          .where(
            eq(refrigeratorStockVoids.movementId, movement.movementId),
          )
          .limit(1);
        if (existingMovementVoid) continue;
        await transaction.insert(refrigeratorStockVoids).values({
          movementId: movement.movementId,
          reason: reason.data,
          voidedBy: session.user.id,
        });
      }
      await transaction.insert(meatSaleVoids).values({
        invoiceNumber: invoice.invoiceNumber,
        reason: reason.data,
        voidedBy: session.user.id,
      });
      return { refund, movementIds } as const;
    });
    if ("error" in result && typeof result.error === "string") {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      refund: result.refund,
      movementIds: result.movementIds,
    };
  } catch (error) {
    if (error instanceof MeatSalesActionError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
