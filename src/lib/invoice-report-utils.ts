import type {
  InvoiceReportRow,
  InvoiceReportSummary,
  InvoiceReportPeriodTotal,
} from "@/lib/invoice-report-types";

export function summarizeInvoiceReport(
  rows: InvoiceReportRow[],
): InvoiceReportSummary {
  const dailyTotals = new Map<string, InvoiceReportPeriodTotal>();
  const monthlyTotals = new Map<string, InvoiceReportPeriodTotal>();
  const invoiceTotals = new Map<number, { total: number; balance: number }>();

  for (const row of rows) {
    const month = row.invoiceDate.slice(0, 7);
    for (const [period, totals] of [
      [row.invoiceDate, dailyTotals],
      [month, monthlyTotals],
    ] as const) {
      const current = totals.get(period) ?? { period, total: 0, count: 0 };
      current.total += row.total;
      current.count += 1;
      totals.set(period, current);
    }
    const invoice = invoiceTotals.get(row.invoiceNumber) ?? {
      total: 0,
      balance: row.balance,
    };
    invoice.total += row.total;
    invoice.balance = row.balance;
    invoiceTotals.set(row.invoiceNumber, invoice);
  }

  const sortByPeriod = (totals: Map<string, InvoiceReportPeriodTotal>) =>
    [...totals.values()].sort((first, second) =>
      first.period.localeCompare(second.period),
    );

  const invoicesTotal = [...invoiceTotals.values()].reduce(
    (sum, invoice) => sum + invoice.total,
    0,
  );
  const remaining = [...invoiceTotals.values()].reduce(
    (sum, invoice) => sum + invoice.balance,
    0,
  );

  return {
    total: rows.reduce((sum, row) => sum + row.total, 0),
    count: rows.length,
    invoiceCount: invoiceTotals.size,
    invoicesTotal,
    paid: Math.max(0, invoicesTotal - remaining),
    remaining,
    daily: sortByPeriod(dailyTotals),
    monthly: sortByPeriod(monthlyTotals),
  };
}

function safeCsvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function invoiceReportToCsv(rows: InvoiceReportRow[]): string {
  const header = [
    "رقم الحركة",
    "تاريخ الحركة",
    "اسم النزيل (معرف Access)",
    "اسم النزيل (ويب)",
    "نوع البيع (ويب)",
    "الرصيد",
    "الفئه",
    "الفئة",
    "اسم الفئة (ويب)",
    "الصنف",
    "السعر",
    "الكمية",
    "الاجمالى",
    "التاريخ",
    "اليوم",
    "الشهر",
  ];
  const body = rows.map((row) => [
    row.invoiceNumber,
    row.invoiceDate,
    row.residentNumber ?? "",
    row.residentName,
    row.saleType === "cash" ? "نقدي" : "نزيل",
    row.balance,
    row.alternateCategory,
    row.categoryId ?? "",
    row.categoryName,
    row.itemName,
    row.unitPrice,
    row.quantity,
    row.total,
    row.lineDate,
    row.dayName,
    row.monthName,
  ]);
  return `\uFEFF${[header, ...body]
    .map((line) => line.map(safeCsvCell).join(","))
    .join("\r\n")}`;
}
