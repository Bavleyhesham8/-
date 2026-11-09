export type InvoiceReportCategory = {
  id: number;
  name: string;
};

export type InvoiceReportRow = {
  invoiceNumber: number;
  invoiceDate: string;
  saleType: "resident" | "cash";
  residentNumber: number | null;
  residentName: string;
  balance: number;
  alternateCategory: string;
  categoryId: number | null;
  itemName: string;
  unitPrice: string;
  quantity: string;
  categoryName: string;
  total: number;
  lineDate: string;
  dayName: string;
  monthName: string;
};

export type InvoiceReportData = {
  categories: InvoiceReportCategory[];
  rows: InvoiceReportRow[];
};

export type InvoiceReportFilters = {
  startDate: string;
  endDate: string;
  categoryId: number | null;
};

export type InvoiceReportPeriodTotal = {
  period: string;
  total: number;
  count: number;
};

export type InvoiceReportSummary = {
  total: number;
  count: number;
  invoiceCount: number;
  invoicesTotal: number;
  paid: number;
  remaining: number;
  daily: InvoiceReportPeriodTotal[];
  monthly: InvoiceReportPeriodTotal[];
};
