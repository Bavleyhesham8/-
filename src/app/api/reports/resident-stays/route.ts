import { NextRequest } from "next/server";
import { isDevelopmentDemoMode } from "@/lib/app-config";
import {
  getResidentStayReport,
  parseResidentStayReportFilters,
  residentStayReportFiltersFromParams,
} from "@/lib/resident-stay-report-data";
import { demoResidents } from "@/lib/demo-data";
import {
  filterResidentStayRows,
  residentStayReportToCsv,
} from "@/lib/resident-stay-report-utils";
import type { ResidentStayReportRow } from "@/lib/resident-stay-report-types";
import { getAuthorizationErrorStatus } from "@/lib/auth-session";

function csvResponse(
  csv: string,
  startDate: string,
  endDate: string,
) {
  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="resident-stays-${startDate}-${endDate}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

function demoRows(): ResidentStayReportRow[] {
  return demoResidents
    .filter((resident) => Boolean(resident.admissionDate))
    .map((resident) => ({
      stayId: resident.id,
      fileNumber: resident.fileNumber,
      residentName: resident.name,
      birthDate: resident.birthDate,
      admissionDate: resident.admissionDate,
      exitDate: resident.exitDate,
      villa: resident.villa,
      room: resident.room,
      archived: resident.archived,
    }));
}

export async function GET(request: NextRequest) {
  try {
    const filters = parseResidentStayReportFilters(
      residentStayReportFiltersFromParams(request.nextUrl.searchParams),
    );
    const rows = isDevelopmentDemoMode()
      ? filterResidentStayRows(demoRows(), filters)
      : (await getResidentStayReport(filters)).rows;
    return csvResponse(
      residentStayReportToCsv(rows),
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
      error.message === "The resident stay report filters are invalid."
    ) {
      return new Response("Invalid resident stay report filters.", {
        status: 400,
      });
    }
    throw error;
  }
}
