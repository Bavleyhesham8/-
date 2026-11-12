import type {
  ResidentStayReportFilters,
  ResidentStayReportRow,
} from "@/lib/resident-stay-report-types";
import { normalizeVillaFilter } from "@/lib/stay-location";

export function normalizeResidentStayNumber(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export function filterResidentStayRows(
  rows: ResidentStayReportRow[],
  filters: ResidentStayReportFilters,
): ResidentStayReportRow[] {
  const search = filters.search.trim().toLocaleLowerCase();
  const villa = normalizeVillaFilter(filters.villa).toLocaleLowerCase();
  const room = normalizeResidentStayNumber(
    filters.room.trim(),
  ).toLocaleLowerCase();

  return rows.filter((row) => {
    if (
      row.admissionDate < filters.startDate ||
      row.admissionDate > filters.endDate
    ) {
      return false;
    }
    if (!filters.includeArchived && row.archived) return false;
    if (
      villa &&
      normalizeVillaFilter(row.villa).toLocaleLowerCase() !== villa
    ) {
      return false;
    }
    if (
      room &&
      normalizeResidentStayNumber(row.room.trim()).toLocaleLowerCase() !== room
    ) {
      return false;
    }
    if (
      search &&
      !`${row.fileNumber} ${row.residentName}`
        .toLocaleLowerCase()
        .includes(search)
    ) {
      return false;
    }
    return true;
  });
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type AgeParts = {
  years: number;
  months: number;
  days: number;
  totalDays: number;
};

function differenceParts(start: Date, end: Date): AgeParts | null {
  if (end < start) return null;
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();
  let days = end.getUTCDate() - start.getUTCDate();
  if (days < 0) {
    months -= 1;
    const daysInPreviousMonth = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0),
    ).getUTCDate();
    days += daysInPreviousMonth;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return {
    years,
    months,
    days,
    totalDays: Math.floor((end.getTime() - start.getTime()) / 86_400_000),
  };
}

export function calculateAgeAtDate(
  birthDate: string,
  atDate: string,
): AgeParts | null {
  const birth = parseDateOnly(birthDate);
  const at = parseDateOnly(atDate);
  if (!birth || !at) return null;
  return differenceParts(birth, at);
}

export function formatAgeAtDate(birthDate: string, atDate: string): string {
  const age = calculateAgeAtDate(birthDate, atDate);
  if (!age) return "—";
  if (age.years > 0) {
    return age.months > 0
      ? `${age.years} سنة و${age.months} شهر`
      : `${age.years} سنة`;
  }
  if (age.months > 0) return `${age.months} شهر و${age.days} يوم`;
  return `${age.days} يوم`;
}

export function calculateStayDuration(
  admissionDate: string,
  exitDate: string,
): AgeParts | null {
  const start = parseDateOnly(admissionDate);
  if (!start) return null;
  const end = parseDateOnly(exitDate) ?? parseDateOnly(todayValue());
  if (!end) return null;
  return differenceParts(start, end);
}

export function formatStayDuration(
  admissionDate: string,
  exitDate: string,
): string {
  const duration = calculateStayDuration(admissionDate, exitDate);
  if (!duration) return "—";
  const parts: string[] = [];
  if (duration.years > 0) parts.push(`${duration.years} سنة`);
  if (duration.months > 0) parts.push(`${duration.months} شهر`);
  if (duration.days > 0 || parts.length === 0) parts.push(`${duration.days} يوم`);
  return parts.join(" و");
}

export type ResidentStaySummary = {
  total: number;
  current: number;
  departed: number;
  totalDays: number;
  averageDays: number;
};

export function summarizeResidentStayRows(
  rows: ResidentStayReportRow[],
): ResidentStaySummary {
  let current = 0;
  let departed = 0;
  let totalDays = 0;
  let counted = 0;
  for (const row of rows) {
    if (row.exitDate) {
      departed += 1;
    } else {
      current += 1;
    }
    const duration = calculateStayDuration(row.admissionDate, row.exitDate);
    if (duration) {
      totalDays += duration.totalDays;
      counted += 1;
    }
  }
  return {
    total: rows.length,
    current,
    departed,
    totalDays,
    averageDays: counted ? Math.round(totalDays / counted) : 0,
  };
}

function safeCsvCell(value: string): string {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function residentStayReportToCsv(
  rows: ResidentStayReportRow[],
): string {
  const header = [
    "رقم الملف",
    "اسم النزيل",
    "تاريخ الميلاد",
    "العمر عند الدخول",
    "الحالة",
    "تاريخ الدخول",
    "تاريخ الخروج",
    "العمر عند الخروج",
    "مدة الإقامة",
    "مدة الإقامة (أيام)",
    "رقم الفيلا",
    "رقم الغرفة",
    "الأرشيف",
  ];
  const today = todayValue();
  const body = rows.map((row) => {
    const duration = calculateStayDuration(row.admissionDate, row.exitDate);
    return [
      row.fileNumber,
      row.residentName,
      row.birthDate,
      row.birthDate
        ? formatAgeAtDate(row.birthDate, row.admissionDate)
        : "",
      row.exitDate ? "غادر" : "مقيم حاليًا",
      row.admissionDate,
      row.exitDate,
      row.birthDate
        ? formatAgeAtDate(row.birthDate, row.exitDate || today)
        : "",
      formatStayDuration(row.admissionDate, row.exitDate),
      duration ? String(duration.totalDays) : "",
      row.villa,
      row.room,
      row.archived ? "مؤرشف" : "",
    ];
  });
  return `\uFEFF${[header, ...body]
    .map((line) => line.map(safeCsvCell).join(","))
    .join("\r\n")}`;
}
