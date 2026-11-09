"use server";

import { getResidentStayReport } from "@/lib/resident-stay-report-data";
import type {
  ResidentStayReportData,
  ResidentStayReportFilters,
} from "@/lib/resident-stay-report-types";

export async function getResidentStayReportAction(
  input: ResidentStayReportFilters,
): Promise<ResidentStayReportData> {
  return getResidentStayReport(input);
}
