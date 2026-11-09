import "server-only";

import { desc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  invoiceCategories,
  residentInvoiceLines,
  residentInvoicePayments,
  residentInvoiceVoids,
  residentInvoices,
  residentPurchases,
  residents,
  invoiceStockMovementLinks,
} from "@/db/schema";
import { requireAnyScreenAccess } from "@/lib/auth-session";
import type {
  CanteenSalesBundle,
  InvoicePayment,
  ResidentInvoice,
} from "@/lib/canteen-sales-types";

export async function listCanteenSalesForAdministrator(): Promise<CanteenSalesBundle> {
  await requireAnyScreenAccess("sales", "invoice-reports");
  const database = getDatabase();
  const [items, categories, invoiceRows] = await Promise.all([
    database
      .select({
        id: residentPurchases.id,
        name: residentPurchases.itemName,
        price: residentPurchases.price,
        addToResidentAccount: residentPurchases.addToResidentAccount,
        canteenItemNumber: residentPurchases.canteenItemNumber,
      })
      .from(residentPurchases)
      .orderBy(residentPurchases.itemName),
    database
      .select({ id: invoiceCategories.id, name: invoiceCategories.name })
      .from(invoiceCategories)
      .orderBy(invoiceCategories.name),
    database
      .select({
        invoiceNumber: residentInvoices.invoiceNumber,
        invoiceDate: residentInvoices.invoiceDate,
        saleType: residentInvoices.saleType,
        residentId: residentInvoices.residentId,
        residentName: residents.name,
        voided: residentInvoiceVoids.invoiceNumber,
        voidReason: residentInvoiceVoids.reason,
      })
      .from(residentInvoices)
      .leftJoin(residents, eq(residents.id, residentInvoices.residentId))
      .leftJoin(
        residentInvoiceVoids,
        eq(residentInvoiceVoids.invoiceNumber, residentInvoices.invoiceNumber),
      )
      .orderBy(desc(residentInvoices.invoiceNumber))
      .limit(100),
  ]);

  if (!invoiceRows.length) return { items, categories, invoices: [] };
  const invoiceNumbers = invoiceRows.map((invoice) => invoice.invoiceNumber);
  const [lineRows, paymentRows] = await Promise.all([
    database
      .select({
        id: residentInvoiceLines.id,
        invoiceNumber: residentInvoiceLines.invoiceNumber,
        itemName: residentInvoiceLines.itemName,
        unitPrice: residentInvoiceLines.unitPrice,
        quantity: residentInvoiceLines.quantity,
        total: residentInvoiceLines.total,
        categoryId: residentInvoiceLines.categoryId,
        alternateCategory: residentInvoiceLines.alternateCategory,
        stockMovementId: invoiceStockMovementLinks.movementId,
      })
      .from(residentInvoiceLines)
      .leftJoin(
        invoiceStockMovementLinks,
        eq(invoiceStockMovementLinks.invoiceLineId, residentInvoiceLines.id),
      )
      .where(inArray(residentInvoiceLines.invoiceNumber, invoiceNumbers))
      .orderBy(residentInvoiceLines.id),
    database
      .select({
        id: residentInvoicePayments.id,
        invoiceNumber: residentInvoicePayments.invoiceNumber,
        kind: residentInvoicePayments.kind,
        amount: residentInvoicePayments.amount,
        paymentDate: residentInvoicePayments.paymentDate,
      })
      .from(residentInvoicePayments)
      .where(inArray(residentInvoicePayments.invoiceNumber, invoiceNumbers))
      .orderBy(residentInvoicePayments.id),
  ]);

  const linesByInvoice = new Map<number, ResidentInvoice["lines"]>();
  for (const line of lineRows) {
    const lines = linesByInvoice.get(line.invoiceNumber) ?? [];
    lines.push({
      id: line.id,
      itemName: line.itemName,
      unitPrice: Number(line.unitPrice),
      quantity: Number(line.quantity),
      total: line.total,
      categoryId: line.categoryId,
      alternateCategory: line.alternateCategory,
      stockMovementId: line.stockMovementId,
    });
    linesByInvoice.set(line.invoiceNumber, lines);
  }

  const paymentsByInvoice = new Map<number, InvoicePayment[]>();
  for (const payment of paymentRows) {
    const payments = paymentsByInvoice.get(payment.invoiceNumber) ?? [];
    payments.push({
      id: payment.id,
      kind: payment.kind,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
    });
    paymentsByInvoice.set(payment.invoiceNumber, payments);
  }

  const invoices = invoiceRows.map((invoice): ResidentInvoice => {
    const lines = linesByInvoice.get(invoice.invoiceNumber) ?? [];
    const payments = paymentsByInvoice.get(invoice.invoiceNumber) ?? [];
    const total = lines.reduce((sum, line) => sum + line.total, 0);
    const paid = payments.reduce(
      (sum, payment) =>
        sum + (payment.kind === "payment" ? payment.amount : -payment.amount),
      0,
    );
    const voided = invoice.voided !== null;
    return {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      saleType: invoice.saleType === "cash" ? "cash" : "resident",
      residentId: invoice.residentId,
      residentName: invoice.residentName ?? "",
      lines,
      payments,
      total,
      paid,
      balance: voided ? 0 : Math.max(0, total - paid),
      voided,
      voidReason: invoice.voidReason ?? "",
    };
  });

  return { items, categories, invoices };
}
