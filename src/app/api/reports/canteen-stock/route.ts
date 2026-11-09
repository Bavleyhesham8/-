import { NextRequest } from "next/server";
import { isDevelopmentDemoMode } from "@/lib/app-config";
import {
  canteenReportFiltersFromParams,
  getCanteenReport,
  parseCanteenReportFilters,
} from "@/lib/canteen-report-data";
import { getDemoCanteenReport } from "@/lib/canteen-report-demo-data";
import { canteenReportToCsv } from "@/lib/canteen-report-utils";

function csvResponse(csv: string, startDate: string, endDate: string) {
  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="canteen-stock-${startDate}-${endDate}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const filters = parseCanteenReportFilters(
      canteenReportFiltersFromParams(request.nextUrl.searchParams),
    );
    const report = isDevelopmentDemoMode()
      ? getDemoCanteenReport(filters)
      : await getCanteenReport(filters);
    return csvResponse(
      canteenReportToCsv(report),
      filters.startDate,
      filters.endDate,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required.") {
      return new Response("Authentication required.", { status: 401 });
    }
    if (
      error instanceof Error &&
      error.message === "Canteen access is required for this report."
    ) {
      return new Response("Canteen access is required.", { status: 403 });
    }
    if (
      error instanceof Error &&
      error.message === "The canteen report filters are invalid."
    ) {
      return new Response("Invalid canteen report filters.", { status: 400 });
    }
    throw error;
  }
}
