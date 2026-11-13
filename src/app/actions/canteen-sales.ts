"use server";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  canteenIssueLines,
  canteenIssueVouchers,
  canteenProducts,
  canteenStockLedger,
  canteenStockMovementLinks,
  canteenStockVoids,
  alternateInvoiceCategories,
  invoiceCategories,
  invoiceStockMovementLinks,
  residentInvoiceLines,
  residentInvoicePayments,
  residentInvoiceVoids,
  residentInvoices,
  residentPurchases,
  residents,
} from "@/db/schema";
import { requireStaffPermission } from "@/lib/auth-session";
import { recordAuditEvent } from "@/lib/audit-log";
import type { CanteenMovement } from "@/lib/canteen-types";
import type {
  CanteenSalesItem,
  InvoiceCategory,
  InvoicePayment,
  ResidentInvoice,
} from "@/lib/canteen-sales-types";

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

const purchaseSchema = z.object({
  id: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  price: z.number().finite().min(0).max(1_000_000_000),
  addToResidentAccount: z.boolean(),
  canteenItemNumber: z.number().int().positive().nullable(),
});

const categorySchema = z.object({
  id: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(120),
});

const invoiceSchema = z.object({
  saleType: z.enum(["resident", "cash"]),
  residentId: z.string().uuid().nullable(),
  invoiceDate: dateSchema,
  initialPayment: z.number().int().min(0).max(1_000_000_000),
  items: z
    .array(
      z.object({
        catalogId: z.number().int().positive(),
        quantity: z.number().finite().positive().max(1_000_000),
        categoryId: z.number().int().positive().nullable(),
        alternateCategory: z.string().trim().max(120),
      }),
    )
    .min(1)
    .max(100),
});

class CanteenSalesActionError extends Error {}

function dayAndMonth(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return {
    day: new Intl.DateTimeFormat("ar-EG", {
      weekday: "long",
      timeZone: "UTC",
    }).format(date),
    month: new Intl.DateTimeFormat("ar-EG", {
      month: "long",
      timeZone: "UTC",
    }).format(date),
  };
}

export async function saveCanteenSalesItemAction(
  input: unknown,
): Promise<
  { ok: true; item: CanteenSalesItem }
  | { ok: false; error: string }
> {
  const session = await requireStaffPermission("canIssueInvoices");
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع اسم الصنف والسعر وبيانات المخزون." };
  }
  const name = parsed.data.name.normalize("NFC");
  const database = getDatabase();
  if (parsed.data.canteenItemNumber !== null) {
    const [product] = await database
      .select({ itemNumber: canteenProducts.itemNumber })
      .from(canteenProducts)
      .where(eq(canteenProducts.itemNumber, parsed.data.canteenItemNumber))
      .limit(1);
    if (!product) {
      return { ok: false, error: "لم يتم العثور على صنف المخزون المحدد." };
    }
  }
  const id = parsed.data.id ?? null;
  const [duplicate] = await database
    .select({ id: residentPurchases.id })
    .from(residentPurchases)
    .where(id === null
      ? eq(residentPurchases.itemName, name)
      : and(eq(residentPurchases.itemName, name), ne(residentPurchases.id, id)))
    .limit(1);
  if (duplicate) {
    return { ok: false, error: "Duplicate item name." };
  }
  const values = {
    itemName: name,
    price: parsed.data.price,
    addToResidentAccount: parsed.data.addToResidentAccount,
    canteenItemNumber: parsed.data.canteenItemNumber,
    needsReview: false,
  };
  const [saved] = id === null
    ? await database.insert(residentPurchases)
        .values({ ...values, createdBy: session.user.id })
        .returning({
          id: residentPurchases.id,
          name: residentPurchases.itemName,
          price: residentPurchases.price,
          addToResidentAccount: residentPurchases.addToResidentAccount,
          canteenItemNumber: residentPurchases.canteenItemNumber,
          needsReview: residentPurchases.needsReview,
        })
    : await database.update(residentPurchases)
        .set(values)
        .where(eq(residentPurchases.id, id))
        .returning({
          id: residentPurchases.id,
          name: residentPurchases.itemName,
          price: residentPurchases.price,
          addToResidentAccount: residentPurchases.addToResidentAccount,
          canteenItemNumber: residentPurchases.canteenItemNumber,
          needsReview: residentPurchases.needsReview,
        });
  if (!saved) {
    return { ok: false, error: "اسم الصنف مستخدم بالفعل." };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: id === null ? "create" : "update",
    entity: "residentPurchases",
    entityId: saved.id,
    metadata: { fields: "itemName,price,addToResidentAccount,canteenItemNumber" },
  });
  return { ok: true, item: saved };
}

export async function saveInvoiceCategoryAction(
  input: unknown,
): Promise<
  { ok: true; category: InvoiceCategory }
  | { ok: false; error: string }
> {
  const session = await requireStaffPermission("canIssueInvoices");
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل اسمًا صحيحًا للفئة." };
  }
  const name = parsed.data.name.normalize("NFC");
  const database = getDatabase();
  const id = parsed.data.id ?? null;
  const [created] = id === null ? await database
    .insert(invoiceCategories)
    .values({ name })
    .onConflictDoNothing()
    .returning({ id: invoiceCategories.id, name: invoiceCategories.name })
    : await database.update(invoiceCategories).set({ name })
      .where(eq(invoiceCategories.id, id))
      .returning({ id: invoiceCategories.id, name: invoiceCategories.name });
  if (!created) {
    return { ok: false, error: "اسم الفئة مستخدم بالفعل." };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: id === null ? "create" : "update",
    entity: "invoiceCategories",
    entityId: created.id,
    metadata: { fields: "name" },
  });
  return { ok: true, category: created };
}

export async function createResidentInvoiceAction(
  input: unknown,
): Promise<
  { ok: true; invoice: ResidentInvoice; stockMovements: CanteenMovement[] }
  | { ok: false; error: string }
> {
  const session = await requireStaffPermission("canIssueInvoices");
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع نوع الحركة والتاريخ والأصناف." };
  }
  if (
    (parsed.data.saleType === "resident" && !parsed.data.residentId) ||
    (parsed.data.saleType === "cash" && parsed.data.residentId)
  ) {
    return { ok: false, error: "اختيار النزيل لا يطابق نوع الحركة." };
  }

  const database = getDatabase();
  try {
    const result = await database.transaction(async (transaction) => {
    const catalogRows = await transaction
      .select({
        id: residentPurchases.id,
        name: residentPurchases.itemName,
        price: sql<number>`case when ${residentPurchases.price} > 0 then ${residentPurchases.price} else coalesce(${canteenProducts.price}, ${residentPurchases.price}) end`,
        canteenItemNumber: residentPurchases.canteenItemNumber,
      })
      .from(residentPurchases)
      .leftJoin(
        canteenProducts,
        eq(canteenProducts.itemNumber, residentPurchases.canteenItemNumber),
      )
      .where(
        inArray(
          residentPurchases.id,
          parsed.data.items.map((item) => item.catalogId),
        ),
      )
      .orderBy(residentPurchases.id)
      .for("update");
    const catalogById = new Map(catalogRows.map((item) => [item.id, item]));
    if (catalogById.size !== new Set(parsed.data.items.map((item) => item.catalogId)).size) {
      return { error: "لم يتم العثور على أحد أصناف الحركة." } as const;
    }

    const items = parsed.data.items.map((inputItem) => {
      const catalog = catalogById.get(inputItem.catalogId)!;
      const rawTotal = catalog.price * inputItem.quantity;
      const total = Math.round(rawTotal);
      return {
        ...inputItem,
        name: catalog.name,
        unitPrice: catalog.price,
        total,
        canteenItemNumber: catalog.canteenItemNumber,
        categoryText: inputItem.alternateCategory,
        validTotal:
          Number.isFinite(rawTotal) &&
          total > 0 &&
          Math.abs(rawTotal - total) <= 1e-8,
      };
    });
    if (items.some((item) => !item.validTotal)) {
      return {
        error:
          "إجمالي كل بند يجب أن يكون عددًا صحيحًا كما في حقل الاجمالى الأصلي.",
      } as const;
    }
    const total = items.reduce((sum, item) => sum + item.total, 0);
    if (parsed.data.initialPayment > total) {
      return { error: "الدفعة الأولى أكبر من إجمالي الحركة." } as const;
    }
    if (
      parsed.data.saleType === "cash" &&
      parsed.data.initialPayment !== total
    ) {
      return { error: "يجب تسجيل قيمة الحركة النقدية كاملة عند البيع." } as const;
    }

    let residentName = "";
    if (parsed.data.residentId) {
      const [resident] = await transaction
        .select({ id: residents.id, name: residents.name })
        .from(residents)
        .where(eq(residents.id, parsed.data.residentId))
        .limit(1);
      if (!resident) return { error: "لم يتم العثور على النزيل." } as const;
      residentName = resident.name;
    }

    const categoryIds = [
      ...new Set(
        items.flatMap((item) => (item.categoryId ? [item.categoryId] : [])),
      ),
    ];
    if (categoryIds.length) {
      const foundCategories = await transaction
        .select({ id: invoiceCategories.id })
        .from(invoiceCategories)
        .where(inArray(invoiceCategories.id, categoryIds));
      if (foundCategories.length !== categoryIds.length) {
        return { error: "تعذر العثور على فئة أحد بنود الحركة." } as const;
      }
    }

    const alternateCategoryNames = [
      ...new Set(
        items.flatMap((item) =>
          item.alternateCategory ? [item.alternateCategory] : [],
        ),
      ),
    ];
    if (alternateCategoryNames.length) {
      const foundAlternateCategories = await transaction
        .select({ name: alternateInvoiceCategories.name })
        .from(alternateInvoiceCategories)
        .where(
          inArray(
            alternateInvoiceCategories.name,
            alternateCategoryNames,
          ),
        )
        .for("update");
      const foundNames = new Set(
        foundAlternateCategories.flatMap((category) =>
          category.name ? [category.name] : [],
        ),
      );
      if (alternateCategoryNames.some((name) => !foundNames.has(name))) {
        return {
          error: "اختر الفئه من قائمة البيانات المرجعية.",
        } as const;
      }
    }

    const stockItemNumbers = [
      ...new Set(
        items.flatMap((item) =>
          item.canteenItemNumber === null ? [] : [item.canteenItemNumber],
        ),
      ),
    ].sort((a, b) => a - b);
    const stockBalances = new Map<number, number>();
    if (stockItemNumbers.length) {
      const lockedProducts = await transaction
        .select({ itemNumber: canteenProducts.itemNumber })
        .from(canteenProducts)
        .where(inArray(canteenProducts.itemNumber, stockItemNumbers))
        .orderBy(canteenProducts.itemNumber)
        .for("update");
      if (lockedProducts.length !== stockItemNumbers.length) {
        return { error: "أحد أصناف البيع غير مرتبط بصنف مخزون صالح." } as const;
      }

      const ledger = await transaction
        .select({
          itemNumber: canteenStockLedger.itemNumber,
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
            inArray(canteenStockLedger.itemNumber, stockItemNumbers),
            isNull(canteenStockVoids.movementId),
          ),
        );
      for (const movement of ledger) {
        stockBalances.set(
          movement.itemNumber,
          (stockBalances.get(movement.itemNumber) ?? 0) +
            (movement.incoming ?? 0) -
            (movement.outgoing ?? 0),
        );
      }
      const quantities = new Map<number, number>();
      for (const item of items) {
        if (item.canteenItemNumber === null) continue;
        quantities.set(
          item.canteenItemNumber,
          (quantities.get(item.canteenItemNumber) ?? 0) + item.quantity,
        );
      }
      for (const [itemNumber, quantity] of quantities) {
        if (quantity > (stockBalances.get(itemNumber) ?? 0) + 1e-9) {
          return {
            error: `الرصيد المتاح غير كافٍ للصنف رقم ${itemNumber}.`,
          } as const;
        }
      }
    }

    const [header] = await transaction
      .insert(residentInvoices)
      .values({
        invoiceDate: parsed.data.invoiceDate,
        residentId: parsed.data.residentId,
        saleType: parsed.data.saleType,
        createdBy: session.user.id,
      })
      .returning({ invoiceNumber: residentInvoices.invoiceNumber });
    if (!header) throw new CanteenSalesActionError("تعذر إنشاء الحركة.");

    const dateLabels = dayAndMonth(parsed.data.invoiceDate);
    const outstanding = total - parsed.data.initialPayment;
    const lines: ResidentInvoice["lines"] = [];
    const stockMovements: CanteenMovement[] = [];
    for (const item of items) {
      const [line] = await transaction
        .insert(residentInvoiceLines)
        .values({
          balance: outstanding,
          alternateCategory: item.alternateCategory,
          categoryId: item.categoryId,
          itemName: item.name,
          unitPrice: String(item.unitPrice),
          quantity: String(item.quantity),
          total: item.total,
          invoiceDate: parsed.data.invoiceDate,
          dayName: dateLabels.day,
          monthName: dateLabels.month,
          invoiceNumber: header.invoiceNumber,
          purchaseId: item.catalogId,
        })
        .returning({ id: residentInvoiceLines.id });
      if (!line) throw new CanteenSalesActionError("تعذر حفظ أحد بنود الحركة.");
      let stockMovementId: number | null = null;
      if (item.canteenItemNumber !== null) {
        const balanceAfter =
          (stockBalances.get(item.canteenItemNumber) ?? 0) - item.quantity;
        stockBalances.set(item.canteenItemNumber, balanceAfter);
        const [voucher] = await transaction
          .insert(canteenIssueVouchers)
          .values({
            itemNumber: item.canteenItemNumber,
            recipient: residentName || "بيع نقدي",
            itemCategory: item.alternateCategory,
            createdBy: session.user.id,
          })
          .returning({ id: canteenIssueVouchers.id });
        if (!voucher) {
          throw new CanteenSalesActionError("تعذر إنشاء سند صرف للمبيعات.");
        }

        const [movement] = await transaction
          .insert(canteenStockLedger)
          .values({
            balance: balanceAfter,
            outgoing: item.quantity,
            outgoingDate: parsed.data.invoiceDate,
            itemNumber: item.canteenItemNumber,
          })
          .returning({ id: canteenStockLedger.id });
        if (!movement) {
          throw new CanteenSalesActionError("تعذر خصم الصنف من المخزون.");
        }
        stockMovementId = movement.id;

        await transaction.insert(canteenIssueLines).values({
          itemName: item.name,
          balance: balanceAfter,
          outgoing: item.quantity,
          outgoingDate: parsed.data.invoiceDate,
          itemNumber: item.canteenItemNumber,
          voucherId: voucher.id,
        });
        await transaction
          .insert(canteenStockMovementLinks)
          .values({ movementId: movement.id, voucherId: voucher.id });
        await transaction
          .insert(invoiceStockMovementLinks)
          .values({ invoiceLineId: line.id, movementId: movement.id });
        stockMovements.push({
          id: movement.id,
          itemNumber: item.canteenItemNumber,
          itemName: item.name,
          balance: balanceAfter,
          incoming: null,
          incomingDate: null,
          outgoing: item.quantity,
          outgoingDate: parsed.data.invoiceDate,
          recipient: residentName || "بيع نقدي",
          voucherId: voucher.id,
          voided: false,
          voidReason: "",
        });
      }
      lines.push({
        id: line.id,
        itemName: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        total: item.total,
        categoryId: item.categoryId,
        alternateCategory: item.alternateCategory,
        stockMovementId,
      });
    }

    const payments: InvoicePayment[] = [];
    if (parsed.data.initialPayment > 0) {
      const [payment] = await transaction
        .insert(residentInvoicePayments)
        .values({
          invoiceNumber: header.invoiceNumber,
          amount: parsed.data.initialPayment,
          paymentDate: parsed.data.invoiceDate,
          createdBy: session.user.id,
        })
        .returning({
          id: residentInvoicePayments.id,
          kind: residentInvoicePayments.kind,
          amount: residentInvoicePayments.amount,
          paymentDate: residentInvoicePayments.paymentDate,
        });
      if (!payment) {
        throw new CanteenSalesActionError("تعذر تسجيل الدفعة الأولى.");
      }
      payments.push(payment);
    }

    return {
      invoice: {
        invoiceNumber: header.invoiceNumber,
        invoiceDate: parsed.data.invoiceDate,
        saleType: parsed.data.saleType,
        residentId: parsed.data.residentId,
        residentName,
        lines,
        payments,
        total,
        paid: parsed.data.initialPayment,
        balance: outstanding,
        voided: false,
        voidReason: "",
      } satisfies ResidentInvoice,
      stockMovements,
    } as const;
    });
    if ("error" in result && typeof result.error === "string") {
      return { ok: false, error: result.error };
    }
    if (!("invoice" in result)) {
      return { ok: false, error: "تعذر إنشاء الحركة." };
    }
    await recordAuditEvent({
      actorUserId: session.user.id,
      action: "create",
      entity: "residentInvoices",
      entityId: result.invoice.invoiceNumber,
      metadata: { fields: "saleType,invoiceDate,items,initialPayment" },
    });
    return {
      ok: true,
      invoice: result.invoice,
      stockMovements: result.stockMovements,
    };
  } catch (error) {
    if (error instanceof CanteenSalesActionError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function recordInvoicePaymentAction(
  invoiceNumberInput: number,
  amountInput: number,
  paymentDateInput: string,
): Promise<
  { ok: true; payment: InvoicePayment; balance: number }
  | { ok: false; error: string }
> {
  const session = await requireStaffPermission("canIssueInvoices");
  const invoiceNumber = z.number().int().positive().safeParse(invoiceNumberInput);
  const amount = z.number().int().positive().safeParse(amountInput);
  const paymentDate = dateSchema.safeParse(paymentDateInput);
  if (!invoiceNumber.success || !amount.success || !paymentDate.success) {
    return { ok: false, error: "أدخل رقم حركة ومبلغًا وتاريخًا صحيحًا." };
  }

  const database = getDatabase();
  try {
    const result = await database.transaction(async (transaction) => {
    const [invoice] = await transaction
      .select({ invoiceNumber: residentInvoices.invoiceNumber })
      .from(residentInvoices)
      .where(eq(residentInvoices.invoiceNumber, invoiceNumber.data))
      .limit(1)
      .for("update");
    if (!invoice) return { error: "لم يتم العثور على الحركة." } as const;

    const [voided] = await transaction
      .select({ invoiceNumber: residentInvoiceVoids.invoiceNumber })
      .from(residentInvoiceVoids)
      .where(eq(residentInvoiceVoids.invoiceNumber, invoice.invoiceNumber))
      .limit(1);
    if (voided) return { error: "لا يمكن السداد على حركة ملغاة." } as const;

    const lines = await transaction
      .select({ total: residentInvoiceLines.total })
      .from(residentInvoiceLines)
      .where(eq(residentInvoiceLines.invoiceNumber, invoice.invoiceNumber));
    const invoiceTotal = lines.reduce((sum, line) => sum + line.total, 0);
    if (!lines.length || invoiceTotal <= 0) {
      return { error: "الحركة لا تحتوي على بنود قابلة للسداد." } as const;
    }
    const payments = await transaction
      .select({
        kind: residentInvoicePayments.kind,
        amount: residentInvoicePayments.amount,
      })
      .from(residentInvoicePayments)
      .where(eq(residentInvoicePayments.invoiceNumber, invoice.invoiceNumber));
    const paid = payments.reduce(
      (sum, payment) =>
        sum + (payment.kind === "payment" ? payment.amount : -payment.amount),
      0,
    );
    const balance = invoiceTotal - paid;
    if (amount.data > balance) {
      return { error: "المبلغ أكبر من الرصيد المستحق." } as const;
    }
    const [payment] = await transaction
      .insert(residentInvoicePayments)
      .values({
        invoiceNumber: invoice.invoiceNumber,
        amount: amount.data,
        paymentDate: paymentDate.data,
        createdBy: session.user.id,
      })
      .returning({
        id: residentInvoicePayments.id,
        kind: residentInvoicePayments.kind,
        amount: residentInvoicePayments.amount,
        paymentDate: residentInvoicePayments.paymentDate,
      });
    if (!payment) {
      throw new CanteenSalesActionError("تعذر تسجيل الدفعة.");
    }

    const nextBalance = balance - amount.data;
    await transaction
      .update(residentInvoiceLines)
      .set({ balance: nextBalance })
      .where(eq(residentInvoiceLines.invoiceNumber, invoice.invoiceNumber));
    return { payment, balance: nextBalance } as const;
  });
  if ("error" in result && typeof result.error === "string") {
    return { ok: false, error: result.error };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "create",
    entity: "residentInvoicePayments",
    entityId: result.payment.id,
    metadata: { fields: "invoiceNumber,amount,paymentDate" },
  });
  return { ok: true, payment: result.payment, balance: result.balance };
  } catch (error) {
  if (error instanceof CanteenSalesActionError) {
    return { ok: false, error: error.message };
  }
  throw error;
  }
}

export async function voidResidentInvoiceAction(
  invoiceNumberInput: number,
  reasonInput: string,
  confirmRefundInput: boolean,
): Promise<
  { ok: true; refund: InvoicePayment | null; movementIds: number[] }
  | { ok: false; error: string }
> {
  const session = await requireStaffPermission("canIssueInvoices");
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
      .select({ invoiceNumber: residentInvoices.invoiceNumber })
      .from(residentInvoices)
      .where(eq(residentInvoices.invoiceNumber, invoiceNumber.data))
      .limit(1)
      .for("update");
    if (!invoice) return { error: "لم يتم العثور على الحركة." } as const;

    const [existingVoid] = await transaction
      .select({ invoiceNumber: residentInvoiceVoids.invoiceNumber })
      .from(residentInvoiceVoids)
      .where(eq(residentInvoiceVoids.invoiceNumber, invoice.invoiceNumber))
      .limit(1);
    if (existingVoid) return { error: "تم إلغاء هذه الحركة بالفعل." } as const;

    const payments = await transaction
      .select({
        kind: residentInvoicePayments.kind,
        amount: residentInvoicePayments.amount,
      })
      .from(residentInvoicePayments)
      .where(eq(residentInvoicePayments.invoiceNumber, invoice.invoiceNumber));
    const netPaid = payments.reduce(
      (sum, payment) =>
        sum + (payment.kind === "payment" ? payment.amount : -payment.amount),
      0,
    );
    if (netPaid > 0 && !confirmRefund.data) {
      return {
        error: "أكد رد المبالغ المسددة قبل إلغاء الحركة.",
      } as const;
    }

    const movements = await transaction
      .select({
        movementId: invoiceStockMovementLinks.movementId,
        itemNumber: canteenStockLedger.itemNumber,
      })
      .from(invoiceStockMovementLinks)
      .innerJoin(
        canteenStockLedger,
        eq(canteenStockLedger.id, invoiceStockMovementLinks.movementId),
      )
      .innerJoin(
        residentInvoiceLines,
        eq(residentInvoiceLines.id, invoiceStockMovementLinks.invoiceLineId),
      )
      .where(eq(residentInvoiceLines.invoiceNumber, invoice.invoiceNumber));
    const itemNumbers = [...new Set(movements.map((movement) => movement.itemNumber))].sort(
      (a, b) => a - b,
    );
    if (itemNumbers.length) {
      const lockedProducts = await transaction
        .select({ itemNumber: canteenProducts.itemNumber })
        .from(canteenProducts)
        .where(inArray(canteenProducts.itemNumber, itemNumbers))
        .orderBy(canteenProducts.itemNumber)
        .for("update");
      if (lockedProducts.length !== itemNumbers.length) {
        return { error: "تعذر قفل أصناف المخزون المرتبطة بالحركة." } as const;
      }
    }

    let refund: InvoicePayment | null = null;
    if (netPaid > 0) {
      const [createdRefund] = await transaction
        .insert(residentInvoicePayments)
        .values({
          invoiceNumber: invoice.invoiceNumber,
          kind: "refund",
          amount: netPaid,
          paymentDate: new Date().toISOString().slice(0, 10),
          createdBy: session.user.id,
        })
        .returning({
          id: residentInvoicePayments.id,
          kind: residentInvoicePayments.kind,
          amount: residentInvoicePayments.amount,
          paymentDate: residentInvoicePayments.paymentDate,
        });
      if (!createdRefund) {
        throw new CanteenSalesActionError("تعذر تسجيل رد المبلغ.");
      }
      refund = createdRefund;
    }

    const movementIds: number[] = [];
    for (const movement of movements) {
      movementIds.push(movement.movementId);
      const [existingMovementVoid] = await transaction
        .select({ movementId: canteenStockVoids.movementId })
        .from(canteenStockVoids)
        .where(eq(canteenStockVoids.movementId, movement.movementId))
        .limit(1);
      if (existingMovementVoid) continue;
      await transaction.insert(canteenStockVoids).values({
        movementId: movement.movementId,
        reason: reason.data,
        voidedBy: session.user.id,
      });
    }

    await transaction.insert(residentInvoiceVoids).values({
      invoiceNumber: invoice.invoiceNumber,
      reason: reason.data,
      voidedBy: session.user.id,
    });
    await transaction
      .update(residentInvoiceLines)
      .set({ balance: 0 })
      .where(eq(residentInvoiceLines.invoiceNumber, invoice.invoiceNumber));
    return { refund, movementIds } as const;
    });
    if ("error" in result && typeof result.error === "string") {
      return { ok: false, error: result.error };
    }
    await recordAuditEvent({
      actorUserId: session.user.id,
      action: "delete",
      entity: "residentInvoices",
      entityId: invoiceNumber.data,
      metadata: { fields: "voided,reason" },
    });
    return {
      ok: true,
      refund: result.refund,
      movementIds: result.movementIds,
    };
  } catch (error) {
    if (error instanceof CanteenSalesActionError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
