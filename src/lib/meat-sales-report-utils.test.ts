import assert from "node:assert/strict";
import test from "node:test";
import {
  filterRefrigeratorInvoices,
  filterRefrigeratorMovements,
  meatSaleRemaining,
  meatSaleStatus,
  summarizeRefrigeratorReport,
} from "@/lib/meat-sales-report-utils";
import type {
  MeatSaleInvoice,
  RefrigeratorMovement,
} from "@/lib/meat-sales-types";

function movement(
  overrides: Partial<RefrigeratorMovement> = {},
): RefrigeratorMovement {
  return {
    id: 1,
    itemNumber: 2001,
    itemCategory: "لحم بقري",
    direction: "in",
    quantity: 10,
    price: 100,
    total: 1000,
    outgoing: null,
    receivedDate: "2026-11-01",
    outgoingDate: null,
    issuePermitNumber: null,
    recipient: "",
    needsReview: false,
    voided: false,
    voidReason: "",
    ...overrides,
  };
}

function invoice(
  overrides: Partial<MeatSaleInvoice> = {},
): MeatSaleInvoice {
  return {
    invoiceNumber: 1,
    saleDate: "2026-11-06",
    issuePermitNumber: null,
    beneficiary: "مستفيد تجريبي",
    lines: [
      {
        id: 1,
        itemCategory: "لحم بقري",
        price: 120,
        quantity: 2,
        total: 240,
        refrigeratorItemNumber: 2001,
        movementId: null,
      },
    ],
    total: 240,
    paid: 240,
    voided: false,
    voidReason: "",
    payments: [],
    ...overrides,
  };
}

const movements = [
  movement(),
  movement({
    id: 2,
    direction: "out",
    quantity: null,
    outgoing: 3,
    price: 120,
    total: 360,
    receivedDate: null,
    outgoingDate: "2026-11-05",
    recipient: "مستفيد",
  }),
  movement({
    id: 3,
    itemNumber: 2002,
    itemCategory: "دجاج",
    quantity: 5,
    price: 200,
    total: 1000,
    receivedDate: "2026-11-07",
  }),
  movement({ id: 4, quantity: 2, voided: true, voidReason: "ملغى" }),
];

const invoices = [
  invoice(),
  invoice({
    invoiceNumber: 2,
    saleDate: "2026-11-08",
    lines: [
      {
        id: 2,
        itemCategory: "دجاج",
        price: 200,
        quantity: 1,
        total: 200,
        refrigeratorItemNumber: 2002,
        movementId: null,
      },
    ],
    total: 200,
    paid: 100,
  }),
  invoice({
    invoiceNumber: 3,
    saleDate: "2026-11-09",
    total: 999,
    paid: 0,
    voided: true,
    voidReason: "خطأ",
  }),
];

test("filters refrigerator movements by item only, period only and both", () => {
  assert.deepEqual(
    filterRefrigeratorMovements(movements, {
      startDate: "",
      endDate: "",
      itemNumber: "2001",
    }).map((row) => row.id),
    [1, 2, 4],
  );

  assert.deepEqual(
    filterRefrigeratorMovements(movements, {
      startDate: "2026-11-05",
      endDate: "2026-11-07",
      itemNumber: "all",
    }).map((row) => row.id),
    [2, 3],
  );

  assert.deepEqual(
    filterRefrigeratorMovements(movements, {
      startDate: "2026-11-05",
      endDate: "2026-11-07",
      itemNumber: "2002",
    }).map((row) => row.id),
    [3],
  );

  assert.deepEqual(
    filterRefrigeratorMovements(movements, {
      startDate: "",
      endDate: "",
      itemNumber: "all",
    }).map((row) => row.id),
    [1, 2, 3, 4],
  );
});

test("filters refrigerator invoices by item and period", () => {
  assert.deepEqual(
    filterRefrigeratorInvoices(invoices, {
      startDate: "",
      endDate: "",
      itemNumber: "2002",
    }).map((row) => row.invoiceNumber),
    [2],
  );

  assert.deepEqual(
    filterRefrigeratorInvoices(invoices, {
      startDate: "2026-11-07",
      endDate: "2026-11-09",
      itemNumber: "all",
    }).map((row) => row.invoiceNumber),
    [2, 3],
  );
});

test("summarizes quantities, values and invoice totals for all items", () => {
  const summary = summarizeRefrigeratorReport(movements, invoices);

  assert.equal(summary.incomingQuantity, 15);
  assert.equal(summary.incomingValue, 2000);
  assert.equal(summary.outgoingQuantity, 3);
  assert.equal(summary.outgoingValue, 360);
  assert.equal(summary.remainingQuantity, 12);
  assert.equal(summary.remainingValue, 1640);
  assert.equal(summary.invoiceCount, 2);
  assert.equal(summary.invoiceTotal, 440);
  assert.equal(summary.invoicePaid, 340);
  assert.equal(summary.invoiceOutstanding, 100);
});

test("summarizes a single item and allocates paid amounts to its lines", () => {
  const summary = summarizeRefrigeratorReport(movements, invoices, {
    startDate: "",
    endDate: "",
    itemNumber: "2002",
  });

  assert.equal(summary.incomingQuantity, 5);
  assert.equal(summary.incomingValue, 1000);
  assert.equal(summary.outgoingQuantity, 0);
  assert.equal(summary.remainingQuantity, 5);
  assert.equal(summary.remainingValue, 1000);
  assert.equal(summary.invoiceCount, 1);
  assert.equal(summary.invoiceTotal, 200);
  assert.equal(summary.invoicePaid, 100);
  assert.equal(summary.invoiceOutstanding, 100);
});

test("returns null monetary totals when a movement price is missing", () => {
  const summary = summarizeRefrigeratorReport(
    [movement({ price: null, total: null })],
    [],
  );

  assert.equal(summary.incomingQuantity, 10);
  assert.equal(summary.incomingValue, null);
  assert.equal(summary.remainingValue, null);
});

test("describes invoice remaining amounts and status", () => {
  const partial = invoice({ total: 240, paid: 100 });
  const overpaid = invoice({ total: 240, paid: 300 });
  const voided = invoice({ voided: true });
  const undefinedTotal = invoice({ total: null });

  assert.equal(meatSaleRemaining(partial), 140);
  assert.equal(meatSaleStatus(partial), "مسددة جزئيًا");
  assert.equal(meatSaleRemaining(overpaid), 0);
  assert.equal(meatSaleStatus(overpaid), "مسددة");
  assert.equal(meatSaleStatus(voided), "ملغاة");
  assert.equal(meatSaleRemaining(undefinedTotal), null);
  assert.equal(meatSaleStatus(undefinedTotal), "غير محددة");
});
