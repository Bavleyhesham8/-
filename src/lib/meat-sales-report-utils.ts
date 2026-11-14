import type {
  MeatSaleInvoice,
  MeatSaleLine,
  RefrigeratorMovement,
} from "@/lib/meat-sales-types";

export type RefrigeratorReportFilter = {
  startDate: string;
  endDate: string;
  /** "all" أو رقم الصنف بالثلاجة. */
  itemNumber: string;
};

/** فلترة حركات الثلاجة بالتاريخ والصنف. التاريخ الفارغ يعني بلا حد. */
export function filterRefrigeratorMovements(
  movements: RefrigeratorMovement[],
  filter: RefrigeratorReportFilter,
): RefrigeratorMovement[] {
  return movements.filter((movement) => {
    const date = movement.receivedDate ?? movement.outgoingDate ?? "";
    return (
      (!filter.startDate || date >= filter.startDate) &&
      (!filter.endDate || date <= filter.endDate) &&
      (filter.itemNumber === "all" ||
        String(movement.itemNumber) === filter.itemNumber)
    );
  });
}

/** فلترة فواتير الثلاجة بالتاريخ والصنف. التاريخ الفارغ يعني بلا حد. */
export function filterRefrigeratorInvoices(
  invoices: MeatSaleInvoice[],
  filter: RefrigeratorReportFilter,
): MeatSaleInvoice[] {
  return invoices.filter(
    (invoice) =>
      (!filter.startDate || invoice.saleDate >= filter.startDate) &&
      (!filter.endDate || invoice.saleDate <= filter.endDate) &&
      (filter.itemNumber === "all" ||
        invoice.lines.some(
          (line) => String(line.refrigeratorItemNumber) === filter.itemNumber,
        )),
  );
}

export function meatSaleLineTotal(line: MeatSaleLine) {
  return line.total ?? line.price * line.quantity;
}

/** المتبقي على الفاتورة، أو null إذا كان إجمالي الفاتورة غير محدد. */
export function meatSaleRemaining(invoice: MeatSaleInvoice): number | null {
  if (invoice.total === null) return null;
  return Math.max(0, invoice.total - invoice.paid);
}

export function meatSaleStatus(invoice: MeatSaleInvoice) {
  if (invoice.voided) return "ملغاة";
  const remaining = meatSaleRemaining(invoice);
  if (remaining === null) return "غير محددة";
  if (remaining <= 0) return "مسددة";
  return invoice.paid > 0 ? "مسددة جزئيًا" : "غير مسددة";
}

export type RefrigeratorReportSummary = {
  incomingQuantity: number;
  incomingValue: number | null;
  outgoingQuantity: number;
  outgoingValue: number | null;
  remainingQuantity: number;
  remainingValue: number | null;
  invoiceCount: number;
  invoiceTotal: number | null;
  invoicePaid: number;
  invoiceOutstanding: number | null;
};

/**
 * إجماليات تقرير الثلاجة بعد تطبيق فلتر التاريخ/الصنف.
 * عند اختيار صنف تُحسب الفواتير من بنود الصنف فقط، ويُوزَّع المسدد نسبيًا
 * على إجمالي الفاتورة كي يظهر المتبقي الصحيح للصنف.
 */
export function summarizeRefrigeratorReport(
  movements: RefrigeratorMovement[],
  invoices: MeatSaleInvoice[],
  filter: RefrigeratorReportFilter = {
    startDate: "",
    endDate: "",
    itemNumber: "all",
  },
): RefrigeratorReportSummary {
  const scopedMovements = filterRefrigeratorMovements(movements, filter);
  const scopedInvoices = filterRefrigeratorInvoices(invoices, filter);
  const { itemNumber } = filter;

  let incomingQuantity = 0;
  let incomingValue = 0;
  let incomingValueComplete = true;
  let outgoingQuantity = 0;
  let outgoingValue = 0;
  let outgoingValueComplete = true;

  for (const movement of scopedMovements) {
    if (movement.voided) continue;
    if (movement.quantity !== null) {
      incomingQuantity += movement.quantity;
      if (movement.price === null) incomingValueComplete = false;
      else incomingValue += movement.quantity * movement.price;
    }
    if (movement.outgoing !== null) {
      outgoingQuantity += movement.outgoing;
      if (movement.price === null) outgoingValueComplete = false;
      else outgoingValue += movement.outgoing * movement.price;
    }
  }

  const activeInvoices = scopedInvoices.filter((invoice) => !invoice.voided);
  const selectedTotal = (invoice: MeatSaleInvoice) =>
    itemNumber === "all"
      ? invoice.total
      : invoice.lines
          .filter(
            (line) => String(line.refrigeratorItemNumber) === itemNumber,
          )
          .reduce((sum, line) => sum + meatSaleLineTotal(line), 0);

  const totalComplete = activeInvoices.every(
    (invoice) => selectedTotal(invoice) !== null,
  );
  const invoiceTotal = totalComplete
    ? activeInvoices.reduce(
        (sum, invoice) => sum + (selectedTotal(invoice) ?? 0),
        0,
      )
    : null;

  const invoicePaid = activeInvoices.reduce((sum, invoice) => {
    if (itemNumber === "all") return sum + invoice.paid;
    if (!invoice.total) return sum;
    const total = selectedTotal(invoice) ?? 0;
    return sum + (invoice.paid * total) / invoice.total;
  }, 0);

  const invoiceOutstanding = totalComplete
    ? activeInvoices.reduce((sum, invoice) => {
        const total = selectedTotal(invoice) ?? 0;
        const paid =
          itemNumber === "all"
            ? invoice.paid
            : invoice.total
              ? (invoice.paid * total) / invoice.total
              : 0;
        return sum + Math.max(0, total - paid);
      }, 0)
    : null;

  return {
    incomingQuantity,
    incomingValue: incomingValueComplete ? incomingValue : null,
    outgoingQuantity,
    outgoingValue: outgoingValueComplete ? outgoingValue : null,
    remainingQuantity: incomingQuantity - outgoingQuantity,
    remainingValue:
      incomingValueComplete && outgoingValueComplete
        ? incomingValue - outgoingValue
        : null,
    invoiceCount: activeInvoices.length,
    invoiceTotal,
    invoicePaid,
    invoiceOutstanding,
  };
}
