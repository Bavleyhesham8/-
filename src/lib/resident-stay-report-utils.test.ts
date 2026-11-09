import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAgeAtDate,
  calculateStayDuration,
  filterResidentStayRows,
  formatAgeAtDate,
  formatStayDuration,
  summarizeResidentStayRows,
} from "@/lib/resident-stay-report-utils";
import type { ResidentStayReportRow } from "@/lib/resident-stay-report-types";

function row(overrides: Partial<ResidentStayReportRow> = {}): ResidentStayReportRow {
  return {
    stayId: "stay-1",
    fileNumber: "D-1001",
    residentName: "نزيل تجريبي",
    birthDate: "1994-05-14",
    admissionDate: "2026-10-12",
    exitDate: "",
    villa: "١",
    room: "١٠١",
    archived: false,
    ...overrides,
  };
}

test("calculates age at a given date with years and months", () => {
  const age = calculateAgeAtDate("1994-05-14", "2026-10-12");
  assert.ok(age);
  assert.equal(age.years, 32);
  assert.equal(age.months, 4);
  assert.equal(age.days, 28);
  assert.equal(formatAgeAtDate("1994-05-14", "2026-10-12"), "32 سنة و4 شهر");
});

test("calculates stay duration for current and departed residents", () => {
  const departed = calculateStayDuration("2026-07-20", "2026-09-03");
  assert.ok(departed);
  assert.equal(departed.totalDays, 45);
  assert.equal(formatStayDuration("2026-07-20", "2026-09-03"), "1 شهر و14 يوم");

  const current = calculateStayDuration("2026-10-12", "");
  assert.ok(current);
  assert.ok(current.totalDays >= 0);
});

test("summarizes current, departed, total and average stay days", () => {
  const summary = summarizeResidentStayRows([
    row(),
    row({
      stayId: "stay-2",
      fileNumber: "D-1002",
      admissionDate: "2026-07-20",
      exitDate: "2026-09-03",
    }),
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.current, 1);
  assert.equal(summary.departed, 1);
  assert.equal(summary.totalDays >= 45, true);
  assert.equal(summary.averageDays >= 22, true);
});

test("filters resident stay rows by date range and search", () => {
  const rows = [row(), row({ stayId: "stay-2", admissionDate: "2025-01-01" })];
  const filtered = filterResidentStayRows(rows, {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    villa: "",
    room: "",
    search: "",
    includeArchived: false,
  });
  assert.deepEqual(
    filtered.map((item) => item.stayId),
    ["stay-1"],
  );
});
