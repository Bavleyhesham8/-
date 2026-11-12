import "server-only";

import { and, asc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import { residents, residentStays } from "@/db/schema";
import { canViewResidentBirthDate } from "@/lib/access-control";
import { requireScreenAccess } from "@/lib/auth-session";
import type {
  ResidentStayReportData,
  ResidentStayReportFilters,
} from "@/lib/resident-stay-report-types";
import { normalizeResidentStayNumber } from "@/lib/resident-stay-report-utils";
import { normalizeVillaFilter } from "@/lib/stay-location";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

const filterSchema = z
  .object({
    startDate: dateSchema,
    endDate: dateSchema,
    villa: z.string().trim().max(80),
    room: z.string().trim().max(80),
    search: z.string().trim().max(120),
    includeArchived: z.boolean(),
  })
  .refine((filters) => filters.startDate <= filters.endDate);

export function parseResidentStayReportFilters(
  input: unknown,
): ResidentStayReportFilters {
  const parsed = filterSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("The resident stay report filters are invalid.");
  }
  return {
    ...parsed.data,
    villa: normalizeVillaFilter(parsed.data.villa),
    room: normalizeResidentStayNumber(parsed.data.room),
  };
}

export async function getResidentStayReport(
  input: unknown,
): Promise<ResidentStayReportData> {
  const filters = parseResidentStayReportFilters(input);
  const session = await requireScreenAccess("resident-stay-reports");
  const canSeeBirthDate = canViewResidentBirthDate(
    session.user.role === "admin" || session.user.role === "viewer"
      ? session.user.role
      : "staff",
  );

  const conditions = [
    gte(residentStays.admissionDate, filters.startDate),
    lte(residentStays.admissionDate, filters.endDate),
  ];
  if (!filters.includeArchived) {
    conditions.push(eq(residents.archived, false));
  }
  if (filters.villa) {
    conditions.push(
      eq(
        sql`upper(regexp_replace(btrim(${residentStays.villa}), '^فيلا[[:space:]]*', '', 'i'))`,
        filters.villa,
      ),
    );
  }
  if (filters.room) {
    conditions.push(
      eq(
        sql`translate(${residentStays.room}, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')`,
        filters.room,
      ),
    );
  }
  if (filters.search) {
    const pattern = `%${filters.search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const searchCondition = or(
      ilike(residents.name, pattern),
      ilike(residents.fileNumber, pattern),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const rows = await getDatabase()
    .select({
      stayId: residentStays.id,
      fileNumber: residents.fileNumber,
      residentName: residents.name,
      birthDate: residents.birthDate,
      admissionDate: residentStays.admissionDate,
      exitDate: residentStays.exitDate,
      villa: residentStays.villa,
      room: residentStays.room,
      archived: residents.archived,
    })
    .from(residentStays)
    .innerJoin(residents, eq(residents.id, residentStays.residentId))
    .where(and(...conditions))
    .orderBy(
      asc(residentStays.admissionDate),
      asc(residentStays.villa),
      asc(residentStays.room),
      asc(residents.fileNumber),
    );

  return {
    rows: rows.map((row) => ({
      ...row,
      birthDate: canSeeBirthDate ? row.birthDate ?? "" : "",
      exitDate: row.exitDate ?? "",
    })),
  };
}

export function residentStayReportFiltersFromParams(
  params: URLSearchParams,
): ResidentStayReportFilters {
  return {
    startDate: params.get("startDate") ?? "",
    endDate: params.get("endDate") ?? "",
    villa: params.get("villa") ?? "",
    room: params.get("room") ?? "",
    search: params.get("search") ?? "",
    includeArchived: params.get("includeArchived") === "true",
  };
}
