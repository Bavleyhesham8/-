import type { ResidentInvoice } from "@/lib/canteen-sales-types";

export type CanteenHistoryFilters = {
  residentQuery: string;
  itemQuery: string;
  fromDate: string;
  toDate: string;
  saleType: "all" | "cash" | "resident";
};

export type ResidentSearchEntry = {
  id: string;
  name?: string;
  fileNumber?: string;
  residentNumber?: string;
};

export type CanteenSalesSummary = {
  cash: number;
  account: number;
  total: number;
  count: number;
  voided: number;
};

export function filterCanteenInvoices(
  invoices: ResidentInvoice[],
  filters: CanteenHistoryFilters,
  residents: ResidentSearchEntry[],
): ResidentInvoice[] {
  const residentQuery = filters.residentQuery.trim().toLowerCase();
  const itemQuery = filters.itemQuery.trim().toLowerCase();

  return invoices.filter((invoice) => {
    if (filters.saleType !== "all" && invoice.saleType !== filters.saleType) {
      return false;
    }
    if (filters.fromDate && invoice.invoiceDate < filters.fromDate) {
      return false;
    }
    if (filters.toDate && invoice.invoiceDate > filters.toDate) {
      return false;
    }
    if (residentQuery) {
      const resident = residents.find((entry) => entry.id === invoice.residentId);
      const haystack = [
        invoice.residentName,
        resident?.name,
        resident?.fileNumber,
        resident?.residentNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(residentQuery)) return false;
    }
    if (
      itemQuery &&
      !invoice.lines.some((line) =>
        line.itemName.toLowerCase().includes(itemQuery),
      )
    ) {
      return false;
    }
    return true;
  });
}

export function summarizeCanteenInvoices(
  invoices: ResidentInvoice[],
): CanteenSalesSummary {
  const active = invoices.filter((invoice) => !invoice.voided);
  const cash = active
    .filter((invoice) => invoice.saleType === "cash")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const account = active
    .filter((invoice) => invoice.saleType === "resident")
    .reduce((sum, invoice) => sum + invoice.total, 0);

  return {
    cash,
    account,
    total: cash + account,
    count: active.length,
    voided: invoices.length - active.length,
  };
}
