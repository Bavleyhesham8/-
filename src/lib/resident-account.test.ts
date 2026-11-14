import assert from "node:assert/strict";
import test from "node:test";
import { buildResidentAccount, findUnmatchedFinanceRecords } from "@/lib/resident-account";
import type { CanteenSalesBundle, ResidentInvoice } from "@/lib/canteen-sales-types";
import type { Resident } from "@/lib/demo-data";
import type { ResidentFinanceBundle } from "@/lib/resident-finance-types";
import type { TreatmentBundle } from "@/lib/treatment-types";

function resident(overrides: Partial<Resident> = {}): Resident {
  return {
    id: "resident-1",
    fileNumber: "1001",
    name: "نزيل تجريبي",
    birthDate: "",
    phone: "",
    address: "",
    district: "",
    emergencyContact: "",
    emergencyPhone: "",
    relationship: "",
    church: "",
    confessor: "",
    admissionDate: "2026-01-01",
    exitDate: "",
    villa: "",
    room: "",
    status: "current",
    archived: false,
    ...overrides,
  };
}

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
        unitPrice: 100,
        quantity: 1,
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

function financeBundle(
  entries: ResidentFinanceBundle["records"][number]["entries"],
): ResidentFinanceBundle {
  return {
    records: [
      {
        residentNumber: 9001,
        residentName: "نزيل تجريبي",
        residentId: "resident-1",
        matchScore: 1,
        matchAmbiguous: false,
        entries,
      },
    ],
    unassignedEntries: [],
  };
}

function treatmentBundle(total: number): TreatmentBundle {
  return {
    records: [
      {
        residentNumber: 1,
        residentName: "نزيل تجريبي",
        residentId: "resident-1",
        matchScore: 1,
        matchAmbiguous: false,
        totalBilled: total,
        entries: [
          {
            id: 1,
            residentNumber: 1,
            medicationName: "دواء",
            amount: total,
            quantity: 1,
            discount: 0,
            total,
            treatmentDate: "2026-11-03",
            voided: false,
            voidReason: "",
            voidedAt: null,
          },
        ],
      },
    ],
    unassignedEntries: [],
  };
}

test("builds a resident balance from deposits, canteen and treatment", () => {
  const finance = financeBundle([
    {
      id: 1,
      residentNumber: 9001,
      amount: 500,
      transactionDate: "2026-11-01",
      returnDate: null,
      voided: false,
      voidReason: "",
      voidedAt: null,
    },
  ]);
  const sales: CanteenSalesBundle = {
    items: [],
    categories: [],
    invoices: [invoice()],
  };

  const account = buildResidentAccount(resident(), {
    residentFinance: finance,
    sales,
    treatment: treatmentBundle(50),
  });

  assert.equal(account.deposits, 500);
  assert.equal(account.canteenPurchases, 100);
  assert.equal(account.treatment, 50);
  assert.equal(account.balance, 350);
  assert.equal(account.entries.length, 3);
});

test("deducts treatment immediately and allows a negative balance", () => {
  const account = buildResidentAccount(resident(), {
    residentFinance: financeBundle([
      {
        id: 1,
        residentNumber: 9001,
        amount: 20,
        transactionDate: "2026-11-01",
        returnDate: null,
        voided: false,
        voidReason: "",
        voidedAt: null,
      },
    ]),
    treatment: treatmentBundle(50),
  });

  assert.equal(account.treatment, 50);
  assert.equal(account.balance, -30);
});

test("does not deduct voided treatment entries", () => {
  const treatment = treatmentBundle(50);
  treatment.records[0].entries[0].voided = true;
  treatment.records[0].entries[0].voidReason = "خطأ في الصرف";

  const account = buildResidentAccount(resident(), {
    residentFinance: financeBundle([
      {
        id: 1,
        residentNumber: 9001,
        amount: 500,
        transactionDate: "2026-11-01",
        returnDate: null,
        voided: false,
        voidReason: "",
        voidedAt: null,
      },
    ]),
    treatment,
  });

  assert.equal(account.treatment, 0);
  assert.equal(account.balance, 500);
});

test("matches treatment records by resident number when id is missing", () => {
  const treatment = treatmentBundle(80);
  treatment.records[0].residentId = null;

  const account = buildResidentAccount(resident({ residentNumber: "1" }), {
    treatment,
  });

  assert.equal(account.treatment, 80);
  assert.equal(account.balance, -80);
});

test("excludes voided movements and applies canteen payments", () => {
  const finance = financeBundle([
    {
      id: 1,
      residentNumber: 9001,
      amount: 500,
      transactionDate: "2026-11-01",
      returnDate: null,
      voided: false,
      voidReason: "",
      voidedAt: null,
    },
    {
      id: 2,
      residentNumber: 9001,
      amount: 200,
      transactionDate: "2026-11-02",
      returnDate: null,
      voided: true,
      voidReason: "خطأ",
      voidedAt: null,
    },
  ]);
  const sales: CanteenSalesBundle = {
    items: [],
    categories: [],
    invoices: [
      invoice({
        payments: [
          {
            id: 1,
            kind: "payment",
            amount: 20,
            paymentDate: "2026-11-02",
          },
        ],
      }),
      invoice({ invoiceNumber: 2, total: 300, voided: true }),
    ],
  };

  const account = buildResidentAccount(resident(), {
    residentFinance: finance,
    sales,
  });

  assert.equal(account.deposits, 500);
  assert.equal(account.canteenPayments, 20);
  assert.equal(account.canteenPurchases, 100);
  assert.equal(account.balance, 420);
});

test("reports finance records that match no resident", () => {
  const bundle: ResidentFinanceBundle = {
    records: [
      {
        residentNumber: 1,
        residentName: "نزيل تجريبي",
        residentId: "resident-1",
        matchScore: 1,
        matchAmbiguous: false,
        entries: [],
      },
      {
        residentNumber: 2,
        residentName: "اسم غير موجود",
        residentId: null,
        matchScore: null,
        matchAmbiguous: false,
        entries: [],
      },
    ],
    unassignedEntries: [],
  };

  assert.deepEqual(
    findUnmatchedFinanceRecords(bundle, [resident()]).map(
      (record) => record.residentNumber,
    ),
    [2],
  );
});
