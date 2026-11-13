import assert from "node:assert/strict";
import test from "node:test";
import {
  filterCanteenInvoices,
  summarizeCanteenInvoices,
} from "@/lib/canteen-sales-utils";
import type { ResidentInvoice } from "@/lib/canteen-sales-types";

function invoice(overrides: Partial<ResidentInvoice> = {}): ResidentInvoice {
  return {
    invoiceNumber: 1,
    invoiceDate: "2026-11-01",
    saleType: "resident",
    residentId: "resident-1",
    residentName: "نزيل تجريبي",
    lines: [
      {
        id: 1,
        itemName: "أرز",
        unitPrice: 50,
        quantity: 2,
        total: 100,
        categoryId: null,
        alternateCategory: "",
        stockMovementId: null,
      },
    ],
    payments: [],
    total: 100,
    paid: 0,
    balance: 100,
    voided: false,
    voidReason: "",
    ...overrides,
  };
}

const residents = [
  {
    id: "resident-1",
    name: "نزيل تجريبي",
    fileNumber: "1001",
    residentNumber: "R-1001",
  },
];

const filters = {
  residentQuery: "",
  itemQuery: "",
  fromDate: "",
  toDate: "",
  saleType: "all" as const,
};

test("summarizes cash and account sales without voided movements", () => {
  const summary = summarizeCanteenInvoices([
    invoice({ invoiceNumber: 1, saleType: "cash", total: 100 }),
    invoice({ invoiceNumber: 2, saleType: "resident", total: 250 }),
    invoice({
      invoiceNumber: 3,
      saleType: "cash",
      total: 70,
      voided: true,
    }),
  ]);

  assert.deepEqual(summary, {
    cash: 100,
    account: 250,
    total: 350,
    count: 2,
    voided: 1,
  });
});

test("filters by resident file number and item name", () => {
  const invoices = [
    invoice(),
    invoice({
      invoiceNumber: 2,
      residentId: "resident-2",
      residentName: "نزيل آخر",
      lines: [
        {
          id: 2,
          itemName: "عدس",
          unitPrice: 20,
          quantity: 1,
          total: 20,
          categoryId: null,
          alternateCategory: "",
          stockMovementId: null,
        },
      ],
      total: 20,
    }),
  ];

  assert.deepEqual(
    filterCanteenInvoices(invoices, { ...filters, residentQuery: "1001" }, residents),
    [invoices[0]],
  );
  assert.deepEqual(
    filterCanteenInvoices(invoices, { ...filters, itemQuery: "عدس" }, residents),
    [invoices[1]],
  );
});

test("filters by date range and sale type", () => {
  const invoices = [
    invoice({ invoiceNumber: 1, invoiceDate: "2026-11-01", saleType: "cash" }),
    invoice({ invoiceNumber: 2, invoiceDate: "2026-11-05", saleType: "resident" }),
    invoice({ invoiceNumber: 3, invoiceDate: "2026-11-10", saleType: "cash" }),
  ];

  assert.deepEqual(
    filterCanteenInvoices(
      invoices,
      { ...filters, fromDate: "2026-11-02", toDate: "2026-11-06" },
      residents,
    ),
    [invoices[1]],
  );
  assert.deepEqual(
    filterCanteenInvoices(
      invoices,
      { ...filters, saleType: "cash" },
      residents,
    ),
    [invoices[0], invoices[2]],
  );
});
