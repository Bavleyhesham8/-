"use client";

import { useMemo, useState, type FormEvent } from "react";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
import type { Resident } from "@/lib/demo-data";
import type { CanteenBundle } from "@/lib/canteen-types";
import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";
import type { CustodyBundle } from "@/lib/custody-types";
import type { InventoryBundle } from "@/lib/inventory-types";
import type { MeatSalesBundle } from "@/lib/meat-sales-types";
import type { ResidentFinanceBundle } from "@/lib/resident-finance-types";
import type { TreatmentBundle } from "@/lib/treatment-types";

type TrackingModule =
  | "inventory"
  | "custody"
  | "canteen"
  | "sales"
  | "meat"
  | "finance"
  | "treatment"
  | "residents";

type TrackingDirection = "in" | "out" | "neutral";

type AmountKind = "stock" | "revenue" | "payment" | "refund" | "deposit" | "charge";

type TrackingEvent = {
  id: string;
  date: string;
  module: TrackingModule;
  moduleLabel: string;
  direction: TrackingDirection;
  typeLabel: string;
  title: string;
  category?: string;
  detail: string;
  quantity: number | null;
  unit: string;
  amount: number | null;
  amountKind: AmountKind | null;
  outstanding: number | null;
  balanceAfter: number | null;
  status: "active" | "voided" | "needs_review";
  reference: string;
};

type TrackingFilters = {
  startDate: string;
  endDate: string;
  module: TrackingModule | "all";
  direction: TrackingDirection | "all";
  search: string;
};

const moduleLabels: Record<TrackingModule, string> = {
  inventory: "المخزون",
  custody: "العهدة والمخزن",
  canteen: "الكانتين",
  sales: "فواتير الكانتين",
  meat: "مبيعات اللحوم",
  finance: "حسابات النزلاء",
  treatment: "العيادة والعلاج",
  residents: "الإقامة والنزلاء",
};

const moduleOrder: TrackingModule[] = [
  "inventory",
  "custody",
  "canteen",
  "sales",
  "meat",
  "finance",
  "treatment",
  "residents",
];

const directionLabels: Record<TrackingDirection, string> = {
  in: "وارد",
  out: "منصرف",
  neutral: "تسوية",
};

const custodyKindLabels: Record<string, string> = {
  receipt: "استلام مخزن",
  custody_issue: "صرف عهدة",
  custody_return: "مرتجع عهدة",
  custody_void: "إلغاء حركة عهدة",
};

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

const moneyFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialFilters(): TrackingFilters {
  const today = new Date();
  return {
    startDate: `${today.getFullYear()}-01-01`,
    endDate: localDate(today),
    module: "all",
    direction: "all",
    search: "",
  };
}

function displayDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatQuantity(value: number, unit: string) {
  return `${numberFormatter.format(value)}${unit ? ` ${unit}` : ""}`;
}

function formatMoney(value: number) {
  return `${moneyFormatter.format(value)} ج.م`;
}

function safeCsvCell(value: string): string {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function runningBalance<T>(
  movements: T[],
  keyOf: (movement: T) => string,
  idOf: (movement: T) => string,
  dateOf: (movement: T) => string,
  incomingOf: (movement: T) => number,
  outgoingOf: (movement: T) => number,
  voidedOf: (movement: T) => boolean,
) {
  const balances = new Map<string, number>();
  const totals = new Map<string, number>();
  const active = movements
    .filter((movement) => !voidedOf(movement))
    .sort(
      (left, right) =>
        dateOf(left).localeCompare(dateOf(right)) ||
        idOf(left).localeCompare(idOf(right), "en", { numeric: true }),
    );
  for (const movement of active) {
    const key = keyOf(movement);
    const balance =
      (totals.get(key) ?? 0) + incomingOf(movement) - outgoingOf(movement);
    totals.set(key, balance);
    balances.set(idOf(movement), balance);
  }
  return balances;
}

export default function GlobalTrackingPanel({
  residents,
  inventory,
  custody,
  canteen,
  sales,
  meatSales,
  residentFinance,
  treatment,
  persistent,
}: {
  residents: Resident[];
  inventory: InventoryBundle;
  custody: CustodyBundle;
  canteen: CanteenBundle;
  sales: CanteenSalesBundle;
  meatSales: MeatSalesBundle;
  residentFinance: ResidentFinanceBundle;
  treatment: TreatmentBundle;
  persistent: boolean;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);

  const events = useMemo(() => {
    const result: TrackingEvent[] = [];

    const inventoryBalances = runningBalance(
      inventory.movements,
      (movement) => movement.itemId,
      (movement) => movement.id,
      (movement) => movement.movementDate,
      (movement) => (movement.direction === "in" ? movement.quantity : 0),
      (movement) => (movement.direction === "out" ? movement.quantity : 0),
      (movement) => movement.voided,
    );
    const inventoryUnits = new Map(
      inventory.items.map((item) => [item.id, item.unit]),
    );
    const inventoryCategories = new Map(
      inventory.categories.map((category) => [category.id, category.name]),
    );
    const inventoryItemCategories = new Map(
      inventory.items.map((item) => [item.id, inventoryCategories.get(item.categoryId) ?? ""]),
    );

    for (const movement of inventory.movements) {
      result.push({
        id: `inventory-${movement.id}`,
        date: movement.movementDate,
        module: "inventory",
        moduleLabel: moduleLabels.inventory,
        direction: movement.direction === "in" ? "in" : "out",
        typeLabel:
          movement.direction === "in" ? "توريد مخزون" : "صرف مخزون",
        title: movement.itemName,
        category: inventoryItemCategories.get(movement.itemId),
        detail: movement.note,
        quantity: movement.quantity,
        unit: inventoryUnits.get(movement.itemId) ?? "",
        amount: movement.quantity * movement.unitPrice,
        amountKind: "stock",
        outstanding: null,
        balanceAfter: inventoryBalances.get(movement.id) ?? null,
        status: movement.voided ? "voided" : "active",
        reference: movement.id,
      });
    }

    const custodyItems = new Map(
      custody.items.map((item) => [item.itemNumber, item]),
    );
    for (const movement of custody.warehouseMovements) {
      const item = custodyItems.get(movement.itemNumber);
      const incoming = movement.incoming ?? 0;
      const outgoing = movement.outgoing ?? 0;
      const quantity = incoming || outgoing;
      const direction: TrackingDirection =
        movement.kind === "receipt" || movement.kind === "custody_return"
          ? "in"
          : movement.kind === "custody_issue"
            ? "out"
            : "neutral";
      result.push({
        id: `custody-${movement.id}`,
        date: movement.incomingDate ?? movement.outgoingDate ?? "",
        module: "custody",
        moduleLabel: moduleLabels.custody,
        direction,
        typeLabel: custodyKindLabels[movement.kind] ?? "حركة عهدة",
        title: item?.itemName ?? `صنف رقم ${movement.itemNumber}`,
        detail: item?.responsible ? `المسؤول: ${item.responsible}` : "",
        quantity,
        unit: "",
        amount: quantity * (item?.price ?? 0),
        amountKind: "stock",
        outstanding: null,
        balanceAfter: movement.needsReview
          ? null
          : movement.remaining ?? movement.balance,
        status: movement.needsReview
          ? "needs_review"
          : movement.deleted
            ? "voided"
            : "active",
        reference: String(movement.id),
      });
    }

    const canteenBalances = runningBalance(
      canteen.movements,
      (movement) => String(movement.itemNumber),
      (movement) => String(movement.id),
      (movement) => movement.incomingDate ?? movement.outgoingDate ?? "",
      (movement) => movement.incoming ?? 0,
      (movement) => movement.outgoing ?? 0,
      (movement) => movement.voided,
    );
    const canteenPrices = new Map(
      canteen.products.map((product) => [product.itemNumber, product.price]),
    );
    for (const movement of canteen.movements) {
      const isIncoming = movement.incoming !== null;
      const quantity = movement.incoming ?? movement.outgoing ?? 0;
      result.push({
        id: `canteen-${movement.id}`,
        date: movement.incomingDate ?? movement.outgoingDate ?? "",
        module: "canteen",
        moduleLabel: moduleLabels.canteen,
        direction: isIncoming ? "in" : "out",
        typeLabel: isIncoming ? "وارد كانتين" : "منصرف كانتين",
        title: movement.itemName,
        detail: [movement.recipient, movement.issueCategory].filter(Boolean).join(" · "),
        quantity,
        unit: "",
        amount: quantity * (canteenPrices.get(movement.itemNumber) ?? 0),
        amountKind: "stock",
        outstanding: null,
        balanceAfter: canteenBalances.get(String(movement.id)) ?? null,
        status: movement.voided ? "voided" : "active",
        reference: movement.voucherId ? `سند ${movement.voucherId}` : "",
      });
    }

    for (const invoice of sales.invoices) {
      result.push({
        id: `sale-invoice-${invoice.invoiceNumber}`,
        date: invoice.invoiceDate,
        module: "sales",
        moduleLabel: moduleLabels.sales,
        direction: "in",
        typeLabel: "فاتورة مبيعات كانتين",
        title: `فاتورة رقم ${invoice.invoiceNumber}`,
        detail: `${invoice.residentName || "بيع نقدي"} — ${invoice.lines.length} بند`,
        quantity: null,
        unit: "",
        amount: invoice.total,
        amountKind: "revenue",
        outstanding: invoice.balance,
        balanceAfter: null,
        status: invoice.voided ? "voided" : "active",
        reference: String(invoice.invoiceNumber),
      });
      if (!invoice.voided) {
        for (const payment of invoice.payments) {
          result.push({
            id: `sale-payment-${payment.id}`,
            date: payment.paymentDate,
            module: "sales",
            moduleLabel: moduleLabels.sales,
            direction: payment.kind === "payment" ? "in" : "out",
            typeLabel:
              payment.kind === "payment" ? "تحصيل دفعة" : "مرتجع دفعة",
            title: `فاتورة رقم ${invoice.invoiceNumber}`,
            detail: invoice.residentName || "بيع نقدي",
            quantity: null,
            unit: "",
            amount: payment.amount,
            amountKind: payment.kind === "payment" ? "payment" : "refund",
            outstanding: null,
            balanceAfter: null,
            status: "active",
            reference: String(invoice.invoiceNumber),
          });
        }
      }
    }

    const meatBalances = runningBalance(
      meatSales.movements.filter((movement) => !movement.needsReview),
      (movement) => String(movement.itemNumber),
      (movement) => String(movement.id),
      (movement) =>
        movement.receivedDate ?? movement.outgoingDate ?? "",
      (movement) =>
        movement.direction === "in" ? (movement.quantity ?? 0) : 0,
      (movement) => movement.direction === "out" ? (movement.outgoing ?? 0) : 0,
      (movement) => movement.voided,
    );
    for (const movement of meatSales.movements) {
      result.push({
        id: `meat-${movement.id}`,
        date: movement.receivedDate ?? movement.outgoingDate ?? "",
        module: "meat",
        moduleLabel: moduleLabels.meat,
        direction: movement.direction === "in" ? "in" : "out",
        typeLabel:
          movement.direction === "in" ? "وارد ثلاجة" : "صرف ثلاجة",
        title: movement.itemCategory,
        detail: movement.recipient ?? "",
        quantity:
          movement.direction === "in"
            ? movement.quantity ?? 0
            : movement.outgoing ?? 0,
        unit: "كجم",
        amount:
          (movement.direction === "in"
            ? movement.quantity ?? 0
            : movement.outgoing ?? 0) * (movement.price ?? 0),
        amountKind: "stock",
        outstanding: null,
        balanceAfter: movement.needsReview
          ? null
          : meatBalances.get(String(movement.id)) ?? null,
        status: movement.needsReview
          ? "needs_review"
          : movement.voided
            ? "voided"
            : "active",
        reference:
          movement.issuePermitNumber !== null
            ? `تصريح ${movement.issuePermitNumber}`
            : String(movement.id),
      });
    }

    for (const invoice of meatSales.invoices) {
      result.push({
        id: `meat-invoice-${invoice.invoiceNumber}`,
        date: invoice.saleDate,
        module: "meat",
        moduleLabel: moduleLabels.meat,
        direction: "in",
        typeLabel: "فاتورة مبيعات لحوم",
        title: `فاتورة رقم ${invoice.invoiceNumber}`,
        detail: `${invoice.beneficiary || "بيع نقدي"} — ${invoice.lines.length} بند`,
        quantity: null,
        unit: "",
        amount: invoice.total,
        amountKind: "revenue",
        outstanding:
          invoice.total === null ? null : invoice.total - invoice.paid,
        balanceAfter: null,
        status: invoice.voided ? "voided" : "active",
        reference: String(invoice.invoiceNumber),
      });
      if (!invoice.voided) {
        for (const payment of invoice.payments) {
          result.push({
            id: `meat-payment-${payment.id}`,
            date: payment.paymentDate,
            module: "meat",
            moduleLabel: moduleLabels.meat,
            direction: payment.kind === "payment" ? "in" : "out",
            typeLabel:
              payment.kind === "payment" ? "تحصيل دفعة" : "مرتجع دفعة",
            title: `فاتورة رقم ${invoice.invoiceNumber}`,
            detail: invoice.beneficiary || "بيع نقدي",
            quantity: null,
            unit: "",
            amount: payment.amount,
            amountKind: payment.kind === "payment" ? "payment" : "refund",
            outstanding: null,
            balanceAfter: null,
            status: "active",
            reference: String(invoice.invoiceNumber),
          });
        }
      }
    }

    const financeNames = new Map(
      residentFinance.records.map((record) => [
        String(record.residentNumber),
        record.residentName ?? "",
      ]),
    );
    const financeEntries = [
      ...residentFinance.records.flatMap((record) => record.entries),
      ...residentFinance.unassignedEntries,
    ];
    for (const entry of financeEntries) {
      if (!entry.amount) continue;
      result.push({
        id: `finance-${entry.id}`,
        date: entry.transactionDate ?? "",
        module: "finance",
        moduleLabel: moduleLabels.finance,
        direction: "in",
        typeLabel: "إيداع / أمانة",
        title:
          financeNames.get(String(entry.residentNumber)) ||
          (entry.residentNumber
            ? `نزيل رقم ${entry.residentNumber}`
            : "غير مرتبط بنزيل"),
        detail: entry.returnDate
          ? `تاريخ الاستحقاق: ${displayDate(entry.returnDate)}`
          : "",
        quantity: null,
        unit: "",
        amount: entry.amount,
        amountKind: "deposit",
        outstanding: null,
        balanceAfter: null,
        status: entry.voided ? "voided" : "active",
        reference: String(entry.id),
      });
    }

    const treatmentNames = new Map(
      treatment.records.map((record) => [
        String(record.residentNumber),
        record.residentName ?? "",
      ]),
    );
    const treatmentEntries = [
      ...treatment.records.flatMap((record) => record.entries),
      ...treatment.unassignedEntries,
    ];
    for (const entry of treatmentEntries) {
      result.push({
        id: `treatment-${entry.id}`,
        date: entry.treatmentDate ?? "",
        module: "treatment",
        moduleLabel: moduleLabels.treatment,
        direction: "out",
        typeLabel: "مستحق علاج",
        title:
          treatmentNames.get(String(entry.residentNumber)) ||
          (entry.residentNumber
            ? `نزيل رقم ${entry.residentNumber}`
            : "غير مرتبط بنزيل"),
        detail: `${entry.medicationName} — كمية ${entry.quantity}${entry.discount > 0 ? ` — خصم ${formatMoney(entry.discount)}` : ""}`,
        quantity: null,
        unit: "",
        amount: entry.total,
        amountKind: "charge",
        outstanding: null,
        balanceAfter: null,
        status: entry.voided ? "voided" : "active",
        reference: String(entry.id),
      });
    }

    for (const resident of residents) {
      if (resident.admissionDate) {
        result.push({
          id: `resident-in-${resident.id}`,
          date: resident.admissionDate,
          module: "residents",
          moduleLabel: moduleLabels.residents,
          direction: "in",
          typeLabel: "دخول نزيل",
          title: resident.name,
          detail: `ملف ${resident.fileNumber}${resident.villa ? ` — فيلا ${resident.villa}` : ""}${resident.room ? ` — غرفة ${resident.room}` : ""}`,
          quantity: null,
          unit: "",
          amount: null,
          amountKind: null,
          outstanding: null,
          balanceAfter: null,
          status: "active",
          reference: resident.fileNumber,
        });
      }
      if (resident.exitDate) {
        result.push({
          id: `resident-out-${resident.id}`,
          date: resident.exitDate,
          module: "residents",
          moduleLabel: moduleLabels.residents,
          direction: "out",
          typeLabel: "خروج نزيل",
          title: resident.name,
          detail: `ملف ${resident.fileNumber}`,
          quantity: null,
          unit: "",
          amount: null,
          amountKind: null,
          outstanding: null,
          balanceAfter: null,
          status: "active",
          reference: resident.fileNumber,
        });
      }
    }

    return result;
  }, [canteen, custody, inventory, meatSales, residentFinance, residents, sales, treatment]);

  const filteredEvents = useMemo(() => {
    const search = appliedFilters.search.trim().toLocaleLowerCase();
    return events
      .filter((event) => {
        if (
          appliedFilters.startDate &&
          event.date &&
          event.date < appliedFilters.startDate
        ) {
          return false;
        }
        if (
          appliedFilters.endDate &&
          event.date &&
          event.date > appliedFilters.endDate
        ) {
          return false;
        }
        if (
          appliedFilters.module !== "all" &&
          event.module !== appliedFilters.module
        ) {
          return false;
        }
        if (
          appliedFilters.direction !== "all" &&
          event.direction !== appliedFilters.direction
        ) {
          return false;
        }
        if (
          search &&
          !`${event.moduleLabel} ${event.typeLabel} ${event.title} ${event.category ?? ""} ${event.detail} ${event.reference}`
            .toLocaleLowerCase()
            .includes(search)
        ) {
          return false;
        }
        return true;
      })
      .sort(
        (left, right) =>
          right.date.localeCompare(left.date) ||
          right.id.localeCompare(left.id, "en", { numeric: true }),
      );
  }, [appliedFilters, events]);

  const summary = useMemo(() => {
    let incomingMovementCount = 0;
    let outgoingMovementCount = 0;
    let incomingValue = 0;
    let outgoingValue = 0;
    let revenue = 0;
    let payments = 0;
    let outstanding = 0;
    let deposits = 0;
    let charges = 0;
    let refunds = 0;
    let voided = 0;
    let needsReview = 0;

    for (const event of filteredEvents) {
      if (event.status === "needs_review") {
        needsReview += 1;
        continue;
      }
      if (event.status === "voided") {
        voided += 1;
        continue;
      }
      if (event.quantity !== null) {
        if (event.direction === "in") {
          incomingMovementCount += 1;
          incomingValue += event.amount ?? 0;
        } else if (event.direction === "out") {
          outgoingMovementCount += 1;
          outgoingValue += event.amount ?? 0;
        }
      }
      switch (event.amountKind) {
        case "revenue":
          revenue += event.amount ?? 0;
          outstanding += event.outstanding ?? 0;
          break;
        case "payment":
          payments += event.amount ?? 0;
          break;
        case "refund":
          refunds += event.amount ?? 0;
          break;
        case "deposit":
          deposits += event.amount ?? 0;
          break;
        case "charge":
          charges += event.amount ?? 0;
          break;
        default:
          break;
      }
    }

    return {
      count: filteredEvents.length,
      incomingMovementCount,
      outgoingMovementCount,
      incomingValue,
      outgoingValue,
      revenue,
      payments,
      outstanding,
      deposits,
      charges,
      refunds,
      voided,
      needsReview,
    };
  }, [filteredEvents]);

  const visibleEvents = filteredEvents.slice(0, 500);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      filters.startDate &&
      filters.endDate &&
      filters.startDate > filters.endDate
    ) {
      setAppliedFilters((current) => ({ ...current }));
      return;
    }
    setAppliedFilters({ ...filters });
  }

  function resetFilters() {
    setFilters(initialFilters());
    setAppliedFilters(initialFilters());
  }

  function showAllDates() {
    const today = localDate(new Date());
    const next = {
      ...filters,
      startDate: "1900-01-01",
      endDate: today,
    };
    setFilters(next);
    setAppliedFilters(next);
  }

  function downloadCsv() {
    const header = [
      "التاريخ",
      "الوحدة",
      "نوع الحركة",
      "البيان",
      "الفئة / البند",
      "التفاصيل",
      "وحدة القياس",
      "الوارد",
      "المنصرف",
      "الرصيد بعد",
      "القيمة",
      "الحالة",
      "المرجع",
    ];
    const body = filteredEvents.map((event) => [
      event.date,
      event.moduleLabel,
      event.typeLabel,
      event.title,
      event.category ?? "",
      event.detail,
      event.unit,
      event.quantity !== null && event.direction === "in"
        ? String(event.quantity)
        : event.quantity === null && event.amount !== null && event.direction === "in"
          ? String(event.amount)
          : "",
      event.quantity !== null && event.direction === "out"
        ? String(event.quantity)
        : event.quantity === null && event.amount !== null && event.direction === "out"
          ? String(event.amount)
          : "",
      event.balanceAfter === null ? "" : String(event.balanceAfter),
      event.quantity !== null && event.amount !== null
        ? String(event.amount)
        : "",
      event.status === "voided" ? "ملغاة" : "نشطة",
      event.reference,
    ]);
    const csv = `\uFEFF${[header, ...body]
      .map((line) => line.map(safeCsvCell).join(","))
      .join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `global-tracking-${appliedFilters.startDate}-${appliedFilters.endDate}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="content-panel tracking-panel" dir="rtl">
      <PrintBrand
        title="التتبع العام والحركات"
        subtitle="سجل موحد لكل الوارد والمنصرف والرصيد المتبقي في جميع وحدات النظام"
        meta={[
          {
            label: "الفترة",
            value: `${displayDate(appliedFilters.startDate)} — ${displayDate(appliedFilters.endDate)}`,
          },
        ]}
      />

      <div className="panel-heading tracking-actions">
        <div>
          <h3>التتبع العام والحركات</h3>
          <p>
            ابحث عن أي صنف أو حركة أو مبلغ واعرف متى دخل ومتى صُرف والرصيد
            المتبقي، مع تجميع كل الوحدات في كشف واحد.
          </p>
        </div>
        <div className="resident-report-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={downloadCsv}
            disabled={!filteredEvents.length}
          >
            تنزيل CSV
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={printCurrentView}
          >
            طباعة / حفظ PDF
          </button>
        </div>
      </div>

      <form className="resident-report-filters tracking-filters" onSubmit={applyFilters}>
        <label>
          من تاريخ
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                startDate: event.target.value,
              }))
            }
          />
        </label>
        <label>
          إلى تاريخ
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                endDate: event.target.value,
              }))
            }
          />
        </label>
        <label>
          الوحدة
          <select
            value={filters.module}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                module: event.target.value as TrackingFilters["module"],
              }))
            }
          >
            <option value="all">كل الوحدات</option>
            {moduleOrder.map((module) => (
              <option key={module} value={module}>
                {moduleLabels[module]}
              </option>
            ))}
          </select>
        </label>
        <label>
          نوع الحركة
          <select
            value={filters.direction}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                direction: event.target.value as TrackingFilters["direction"],
              }))
            }
          >
            <option value="all">الكل</option>
            <option value="in">وارد</option>
            <option value="out">منصرف</option>
            <option value="neutral">تسوية</option>
          </select>
        </label>
        <label>
          بحث بالصنف أو البيان
          <input
            type="search"
            value={filters.search}
            maxLength={120}
            placeholder="مثال: بسكوت، أرز، فاتورة، اسم نزيل..."
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                search: event.target.value,
              }))
            }
          />
        </label>
        <button className="primary-button" type="submit">
          عرض الحركات
        </button>
        <button className="secondary-button" type="button" onClick={resetFilters}>
          إعادة ضبط
        </button>
        <button className="secondary-button" type="button" onClick={showAllDates}>
          كل الفترات
        </button>
      </form>

      {custody.needsReviewCount + meatSales.needsReviewCount > 0 && (
        <p className="review-warning" role="status">
          حركات قيد المراجعة لا تدخل في حسابات الأرصدة. المخزن:{" "}
          {numberFormatter.format(custody.needsReviewCount)}، الثلاجة:{" "}
          {numberFormatter.format(meatSales.needsReviewCount)}.
        </p>
      )}

      <div className="tracking-summary report-summary">
        <article>
          <span>إجمالي الحركات</span>
          <strong>{numberFormatter.format(summary.count)}</strong>
        </article>
        <article>
          <span>عدد حركات المخزون الواردة</span>
          <strong>{numberFormatter.format(summary.incomingMovementCount)}</strong>
        </article>
        <article>
          <span>عدد حركات المخزون المنصرفة</span>
          <strong>{numberFormatter.format(summary.outgoingMovementCount)}</strong>
        </article>
        <article>
          <span>قيمة الوارد المخزني</span>
          <strong>{formatMoney(summary.incomingValue)}</strong>
        </article>
        <article>
          <span>قيمة المنصرف المخزني</span>
          <strong>{formatMoney(summary.outgoingValue)}</strong>
        </article>
        <article>
          <span>إيرادات الفواتير</span>
          <strong>{formatMoney(summary.revenue)}</strong>
        </article>
        <article>
          <span>المدفوعات المحصلة</span>
          <strong>{formatMoney(summary.payments)}</strong>
        </article>
        <article>
          <span>المتبقي على النزلاء</span>
          <strong>{formatMoney(summary.outstanding)}</strong>
        </article>
        <article>
          <span>إيداعات / أمانات</span>
          <strong>{formatMoney(summary.deposits)}</strong>
        </article>
        <article>
          <span>مستحقات العلاج</span>
          <strong>{formatMoney(summary.charges)}</strong>
        </article>
        <article>
          <span>مرتجعات</span>
          <strong>{formatMoney(summary.refunds)}</strong>
        </article>
        <article>
          <span>حركات قيد المراجعة</span>
          <strong>{numberFormatter.format(summary.needsReview)}</strong>
        </article>
      </div>

      <div className="table-wrap tracking-table-wrap report-detail">
        <table className="resident-table tracking-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الوحدة</th>
              <th>نوع الحركة</th>
              <th>البيان / الصنف</th>
              <th>الفئة / البند</th>
              <th>التفاصيل</th>
              <th>الوارد</th>
              <th>المنصرف</th>
              <th>الرصيد بعد</th>
              <th>القيمة</th>
              <th>الحالة</th>
              <th>المرجع</th>
            </tr>
          </thead>
          <tbody>
            {visibleEvents.map((event) => (
              <tr
                key={event.id}
                className={
                  event.status === "voided"
                    ? "tracking-row-voided"
                    : event.status === "needs_review"
                      ? "tracking-row-review"
                      : ""
                }
              >
                <td>{displayDate(event.date)}</td>
                <td>
                  <span className={`tracking-module tracking-module-${event.module}`}>
                    {event.moduleLabel}
                  </span>
                </td>
                <td>
                  <span className={`tracking-direction tracking-direction-${event.direction}`}>
                    {directionLabels[event.direction]}
                  </span>
                  <small className="tracking-type-label">{event.typeLabel}</small>
                </td>
                <td>{event.title}</td>
                <td>{event.category || "—"}</td>
                <td>{event.detail || "—"}</td>
                <td className="tracking-number">
                  {event.quantity !== null && event.direction === "in"
                    ? formatQuantity(event.quantity, event.unit)
                    : event.quantity === null &&
                        event.amount !== null &&
                        event.direction === "in"
                      ? formatMoney(event.amount)
                      : "—"}
                </td>
                <td className="tracking-number">
                  {event.quantity !== null && event.direction === "out"
                    ? formatQuantity(event.quantity, event.unit)
                    : event.quantity === null &&
                        event.amount !== null &&
                        event.direction === "out"
                      ? formatMoney(event.amount)
                      : "—"}
                </td>
                <td className="tracking-number">
                  {event.balanceAfter === null
                    ? "—"
                    : formatQuantity(event.balanceAfter, event.unit)}
                </td>
                <td className="tracking-number">
                  {event.quantity !== null && event.amount !== null
                    ? formatMoney(event.amount)
                    : "—"}
                </td>
                <td>
                  <span
                    className={`tracking-status tracking-status-${event.status}`}
                  >
                    {event.status === "voided"
                      ? "ملغاة"
                      : event.status === "needs_review"
                        ? "قيد المراجعة"
                        : "نشطة"}
                  </span>
                </td>
                <td>{event.reference || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filteredEvents.length && (
          <div className="empty-state">
            لا توجد حركات مطابقة للفترة أو عوامل التصفية المحددة.
          </div>
        )}
        {filteredEvents.length > visibleEvents.length && (
          <p className="tracking-limit-note">
            يتم عرض أول {numberFormatter.format(visibleEvents.length)} حركة من
            إجمالي {numberFormatter.format(filteredEvents.length)}. ضيّق الفترة أو
            استخدم البحث لعرض نتائج أقل، أو نزّل CSV لكل النتائج.
          </p>
        )}
      </div>

      {!persistent && (
        <p className="tracking-demo-note resident-report-demo-note">
          هذه بيانات تجريبية فقط ولا تُحفظ في قاعدة البيانات.
        </p>
      )}
    </section>
  );
}
