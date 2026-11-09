"use server";

import { getCanteenReport } from "@/lib/canteen-report-data";
import type {
  CanteenReportData,
  CanteenReportFilters,
} from "@/lib/canteen-report-types";

export async function getCanteenReportAction(
  input: CanteenReportFilters,
): Promise<CanteenReportData> {
  return getCanteenReport(input);
}
