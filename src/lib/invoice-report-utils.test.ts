import assert from "node:assert/strict";
import test from "node:test";
import { summarizeInvoiceReport } from "@/lib/invoice-report-utils";
import type { InvoiceReportRow } from "@/lib/invoice-report-types";

function row(overrides: Partial<InvoiceReportRow> = {}): InvoiceReportRow {
  return {
    invoiceNumber: 1,
    invoiceDate: "2026-11-01",
    saleType: "resident",
    residentNumber: 10,
    residentName: "نزيل تجريبي",
    balance: 120,
    alternateCategory: "",
    categoryId: 1,
    itemName: "صنف",
    unitPrice: "10",
    quantity: "10",
    categoryName: "فئة",
    total: 100,
    lineDate: "2026-11-01",
    dayName: "الأحد",
    monthName: "نوفمبر",
    ...overrides,
  };
}

test("summarizes invoice totals, paid and remaining once per invoice", () => {
  const summary = summarizeInvoiceReport([
    row(),
    row({ itemName: "صنف ٢", total: 50 }),
    row({
      invoiceNumber: 2,
      invoiceDate: "2026-11-02",
      total: 200,
      balance: 0,
    }),
  ]);

  assert.equal(summary.count, 3);
  assert.equal(summary.invoiceCount, 2);
  assert.equal(summary.invoicesTotal, 350);
  assert.equal(summary.remaining, 120);
  assert.equal(summary.paid, 230);
  assert.equal(summary.total, 350);
  assert.deepEqual(summary.daily, [
    { period: "2026-11-01", total: 150, count: 2 },
    { period: "2026-11-02", total: 200, count: 1 },
  ]);
});
