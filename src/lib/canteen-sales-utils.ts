import type { ResidentInvoice } from "@/lib/canteen-sales-types";

export const UNLINKED_RESIDENT_FILTER = "__unlinked__";

export type CanteenHistoryFilters = {
  residentId: string;
  itemName: string;
  fromDate: string;
  toDate: string;
  saleType: "all" | "cash" | "resident";
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
): ResidentInvoice[] {
  const itemName = filters.itemName.trim().normalize("NFC");

  return invoices
    .filter((invoice) => {
      if (filters.saleType !== "all" && invoice.saleType !== filters.saleType) {
        return false;
      }
      if (filters.fromDate && invoice.invoiceDate < filters.fromDate) {
        return false;
      }
      if (filters.toDate && invoice.invoiceDate > filters.toDate) {
        return false;
      }
      if (filters.residentId === UNLINKED_RESIDENT_FILTER) {
        if (invoice.residentId !== null) return false;
      } else if (
        filters.residentId &&
        invoice.residentId !== filters.residentId
      ) {
        return false;
      }
      if (
        itemName &&
        !invoice.lines.some(
          (line) => line.itemName.trim().normalize("NFC") === itemName,
        )
      ) {
        return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        left.invoiceDate.localeCompare(right.invoiceDate) ||
        left.invoiceNumber - right.invoiceNumber,
    );
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
