"use server";

import { getInvoiceReport } from "@/lib/invoice-report-data";
import type {
  InvoiceReportData,
  InvoiceReportFilters,
} from "@/lib/invoice-report-types";

export async function getInvoiceReportAction(
  input: InvoiceReportFilters,
): Promise<InvoiceReportData> {
  return getInvoiceReport(input);
}
