import "server-only";

import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  legacyResidentDetails,
  legacyResidentHeaders,
  residents,
  residentStays,
} from "@/db/schema";
import { requireScreenAccess } from "@/lib/auth-session";
import { formatDate } from "@/lib/date-format";
import { findResidentByName } from "@/lib/resident-matching";
import type {
  ResidentFinanceBundle,
  ResidentFinanceEntry,
  ResidentStayOption,
} from "@/lib/resident-finance-types";

function dateValue(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function buildStayLabel(stay: {
  admissionDate: string;
  exitDate: string | null;
  villa: string;
  room: string;
}) {
  const period = stay.exitDate
    ? `من ${formatDate(stay.admissionDate)} إلى ${formatDate(stay.exitDate)}`
    : `من ${formatDate(stay.admissionDate)} حتى الآن`;
  const location = [stay.villa ? `فيلا ${stay.villa}` : "", stay.room ? `غرفة ${stay.room}` : ""]
    .filter(Boolean)
    .join(" · ");
  return location ? `${period} · ${location}` : period;
}

function mapEntry(
  row: typeof legacyResidentDetails.$inferSelect,
  stayLabels: Map<string, string>,
): ResidentFinanceEntry {
  return {
    id: row.id,
    residentNumber: row.residentNumber,
    amount: row.amount,
    transactionDate: dateValue(row.transactionDate),
    returnDate: dateValue(row.returnDate),
    depositKind: row.depositKind === "stay" ? "stay" : "account",
    stayId: row.stayId,
    stayLabel: row.stayId
      ? (stayLabels.get(row.stayId) ?? "إقامة غير محددة")
      : null,
    receiptNumber: row.receiptNumber,
    voided: row.voided,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

export async function listResidentFinanceForAdministrator(): Promise<ResidentFinanceBundle> {
  await requireScreenAccess("resident-finance");
  const database = getDatabase();
  const [headers, residentRows, stayRows] = await Promise.all([
    database
      .select({
        residentNumber: legacyResidentHeaders.residentNumber,
        residentName: legacyResidentHeaders.residentName,
        residentId: legacyResidentHeaders.residentId,
      })
      .from(legacyResidentHeaders)
      .orderBy(asc(legacyResidentHeaders.residentNumber)),
    database
      .select({
        id: residents.id,
        name: residents.name,
        residentNumber: residents.residentNumber,
        fileNumber: residents.fileNumber,
      })
      .from(residents),
    database
      .select({
        id: residentStays.id,
        residentId: residentStays.residentId,
        residentName: residents.name,
        fileNumber: residents.fileNumber,
        admissionDate: residentStays.admissionDate,
        exitDate: residentStays.exitDate,
        villa: residentStays.villa,
        room: residentStays.room,
      })
      .from(residentStays)
      .innerJoin(residents, eq(residents.id, residentStays.residentId))
      .orderBy(
        desc(residentStays.admissionDate),
        desc(residentStays.createdAt),
      ),
  ]);
  const residentNumbers = headers.map((header) => header.residentNumber);
  const details = residentNumbers.length
    ? await database
        .select()
        .from(legacyResidentDetails)
        .where(inArray(legacyResidentDetails.residentNumber, residentNumbers))
        .orderBy(
          asc(legacyResidentDetails.transactionDate),
          asc(legacyResidentDetails.id),
        )
    : [];
  const unassignedRows = await database
    .select()
    .from(legacyResidentDetails)
    .where(isNull(legacyResidentDetails.residentNumber))
    .orderBy(asc(legacyResidentDetails.id));

  const stays: ResidentStayOption[] = stayRows.map((stay) => ({
    ...stay,
    exitDate: stay.exitDate ?? "",
  }));
  const stayLabels = new Map(
    stayRows.map((stay) => [stay.id, buildStayLabel(stay)]),
  );
  const entriesByResident = new Map<number, ResidentFinanceEntry[]>();
  for (const detail of details) {
    if (detail.residentNumber === null) {
      throw new Error("A resident detail query returned an unassigned row.");
    }
    const entries = entriesByResident.get(detail.residentNumber) ?? [];
    entries.push(mapEntry(detail, stayLabels));
    entriesByResident.set(detail.residentNumber, entries);
  }

  return {
    records: headers.map((header) => {
      const match = findResidentByName(
        header.residentName,
        residentRows,
        header.residentNumber,
      );
      return {
        ...header,
        residentId: header.residentId ?? match?.resident.id ?? null,
        matchScore: match?.score ?? null,
        matchAmbiguous: match?.ambiguous ?? false,
        entries: entriesByResident.get(header.residentNumber) ?? [],
      };
    }),
    unassignedEntries: unassignedRows.map((row) =>
      mapEntry(row, stayLabels),
    ),
    stays,
  };
}
