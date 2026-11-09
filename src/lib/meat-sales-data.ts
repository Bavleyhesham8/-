import "server-only";

import { desc, eq, inArray } from "drizzle-orm";
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
import { requireScreenAccess } from "@/lib/auth-session";
import type {
  MeatSaleInvoice,
  MeatSalePayment,
  MeatSalesBundle,
} from "@/lib/meat-sales-types";

export async function listMeatSalesForAdministrator(): Promise<MeatSalesBundle> {
  await requireScreenAccess("meat-sales");
  const database = getDatabase();
  const [catalog, products, movementRows, invoiceRows] = await Promise.all([
    database
      .select({
        id: refrigeratorItemCatalog.id,
        itemCategory: refrigeratorItemCatalog.itemCategory,
        price: refrigeratorItemCatalog.price,
        quantity: refrigeratorItemCatalog.quantity,
      })
      .from(refrigeratorItemCatalog)
      .orderBy(refrigeratorItemCatalog.itemCategory),
    database
      .select({
        id: refrigeratorItems.id,
        itemNumber: refrigeratorItems.itemNumber,
        catalogId: refrigeratorItems.catalogId,
        itemCategory: refrigeratorItems.itemCategory,
        voucherNumber: refrigeratorItems.voucherNumber,
        beneficiary: refrigeratorItems.beneficiary,
      })
      .from(refrigeratorItems)
      .orderBy(refrigeratorItems.itemNumber),
    database
      .select({
        id: refrigeratorStockLedger.id,
        itemNumber: refrigeratorStockLedger.itemNumber,
        itemCategory: refrigeratorStockLedger.itemCategory,
        direction: refrigeratorStockLedger.direction,
        quantity: refrigeratorStockLedger.quantity,
        price: refrigeratorStockLedger.price,
        total: refrigeratorStockLedger.total,
        outgoing: refrigeratorStockLedger.outgoing,
        receivedDate: refrigeratorStockLedger.receivedDate,
        outgoingDate: refrigeratorStockLedger.outgoingDate,
        issuePermitNumber: refrigeratorStockLedger.issuePermitNumber,
        recipient: refrigeratorStockLedger.recipient,
        voided: refrigeratorStockVoids.movementId,
        voidReason: refrigeratorStockVoids.reason,
      })
      .from(refrigeratorStockLedger)
      .leftJoin(
        refrigeratorStockVoids,
        eq(
          refrigeratorStockVoids.movementId,
          refrigeratorStockLedger.id,
        ),
      )
      .orderBy(desc(refrigeratorStockLedger.id))
      .limit(2000),
    database
      .select({
        invoiceNumber: meatSalesInvoices.invoiceNumber,
        saleDate: meatSalesInvoices.saleDate,
        issuePermitNumber: meatSalesInvoices.issuePermitNumber,
        beneficiary: meatSalesInvoices.beneficiary,
        voided: meatSaleVoids.invoiceNumber,
        voidReason: meatSaleVoids.reason,
      })
      .from(meatSalesInvoices)
      .leftJoin(
        meatSaleVoids,
        eq(meatSaleVoids.invoiceNumber, meatSalesInvoices.invoiceNumber),
      )
      .orderBy(desc(meatSalesInvoices.invoiceNumber))
      .limit(100),
  ]);
  const movements = movementRows.map((movement) => ({
    ...movement,
    voided: movement.voided !== null,
    voidReason: movement.voidReason ?? "",
  }));
  if (!invoiceRows.length) {
    return { catalog, products, movements, invoices: [] };
  }

  const invoiceNumbers = invoiceRows.map((invoice) => invoice.invoiceNumber);
  const [lineRows, paymentRows] = await Promise.all([
    database
      .select({
        id: meatSalesInvoiceLines.id,
        invoiceNumber: meatSalesInvoiceLines.invoiceNumber,
        itemCategory: meatSalesInvoiceLines.itemCategory,
        price: meatSalesInvoiceLines.price,
        quantity: meatSalesInvoiceLines.quantity,
        total: meatSalesInvoiceLines.total,
        refrigeratorItemNumber: meatSalesInvoiceLines.refrigeratorItemNumber,
        movementId: meatSaleStockMovementLinks.movementId,
      })
      .from(meatSalesInvoiceLines)
      .leftJoin(
        meatSaleStockMovementLinks,
        eq(
          meatSaleStockMovementLinks.invoiceLineId,
          meatSalesInvoiceLines.id,
        ),
      )
      .where(inArray(meatSalesInvoiceLines.invoiceNumber, invoiceNumbers))
      .orderBy(meatSalesInvoiceLines.id),
    database
      .select({
        id: meatSalePayments.id,
        invoiceNumber: meatSalePayments.invoiceNumber,
        kind: meatSalePayments.kind,
        amount: meatSalePayments.amount,
        paymentDate: meatSalePayments.paymentDate,
      })
      .from(meatSalePayments)
      .where(inArray(meatSalePayments.invoiceNumber, invoiceNumbers))
      .orderBy(meatSalePayments.id),
  ]);

  const linesByInvoice = new Map<number, MeatSaleInvoice["lines"]>();
  for (const line of lineRows) {
    const lines = linesByInvoice.get(line.invoiceNumber) ?? [];
    lines.push({
      id: line.id,
      itemCategory: line.itemCategory,
      price: line.price,
      quantity: line.quantity,
      total: line.total,
      refrigeratorItemNumber: line.refrigeratorItemNumber,
      movementId: line.movementId,
    });
    linesByInvoice.set(line.invoiceNumber, lines);
  }
  const paymentsByInvoice = new Map<number, MeatSalePayment[]>();
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

  const invoices = invoiceRows.map((invoice): MeatSaleInvoice => {
    const lines = linesByInvoice.get(invoice.invoiceNumber) ?? [];
    const payments = paymentsByInvoice.get(invoice.invoiceNumber) ?? [];
    return {
      invoiceNumber: invoice.invoiceNumber,
      saleDate: invoice.saleDate,
      issuePermitNumber: invoice.issuePermitNumber,
      beneficiary: invoice.beneficiary,
      lines,
      total: lines.reduce((sum, line) => sum + line.total, 0),
      paid: payments.reduce(
        (sum, payment) =>
          sum + (payment.kind === "payment" ? payment.amount : -payment.amount),
        0,
      ),
      voided: invoice.voided !== null,
      voidReason: invoice.voidReason ?? "",
      payments,
    };
  });

  return {
    catalog,
    products,
    movements,
    invoices,
  };
}
