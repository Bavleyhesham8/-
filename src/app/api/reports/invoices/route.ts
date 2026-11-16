import { NextRequest } from "next/server";
import {
  getInvoiceReport,
  invoiceReportFilterFromParams,
  parseInvoiceReportFilters,
} from "@/lib/invoice-report-data";
import { getDemoInvoiceReport } from "@/lib/invoice-report-demo-data";
import { isDevelopmentDemoMode } from "@/lib/app-config";
import { invoiceReportToCsv } from "@/lib/invoice-report-utils";
import { getAuthorizationErrorStatus } from "@/lib/auth-session";

function csvResponse(
  csv: string,
  startDate: string,
  endDate: string,
) {
  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="invoice-report-${startDate}-${endDate}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const filters = parseInvoiceReportFilters(
      invoiceReportFilterFromParams(request.nextUrl.searchParams),
    );
    if (isDevelopmentDemoMode()) {
      const demo = getDemoInvoiceReport();
      const selectedCategory = demo.categories.find(
        (category) => category.id === filters.categoryId,
      );
      const rows = demo.rows.filter(
        (row) =>
          row.invoiceDate >= filters.startDate &&
          row.invoiceDate <= filters.endDate &&
          (filters.categoryId === null ||
            selectedCategory?.name === row.categoryName) &&
          (!filters.itemName || row.itemName.toLocaleLowerCase().includes(filters.itemName.toLocaleLowerCase())) &&
          (!filters.residentName || row.residentName.toLocaleLowerCase().includes(filters.residentName.toLocaleLowerCase())) &&
          (filters.saleType === "all" || row.saleType === filters.saleType),
      );
      return csvResponse(
        invoiceReportToCsv(rows),
        filters.startDate,
        filters.endDate,
      );
    }

    const report = await getInvoiceReport(filters);
    return csvResponse(
      invoiceReportToCsv(report.rows),
      filters.startDate,
      filters.endDate,
    );
  } catch (error) {
    const authorizationStatus = getAuthorizationErrorStatus(error);
    if (authorizationStatus) {
      return new Response(authorizationStatus === 401 ? "Authentication required." : "Report access is required.", {
        status: authorizationStatus,
      });
    }
    if (
      error instanceof Error &&
      error.message === "The invoice report filters are invalid."
    ) {
      return new Response("Invalid invoice report filters.", { status: 400 });
    }
    throw error;
  }
}
