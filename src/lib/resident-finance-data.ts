import "server-only";

import { asc, inArray, isNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  legacyResidentDetails,
  legacyResidentHeaders,
} from "@/db/schema";
import { requireAdministrator } from "@/lib/auth-session";
import type {
  ResidentFinanceBundle,
  ResidentFinanceEntry,
} from "@/lib/resident-finance-types";

function dateValue(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function mapEntry(
  row: typeof legacyResidentDetails.$inferSelect,
): ResidentFinanceEntry {
  return {
    id: row.id,
    residentNumber: row.residentNumber,
    amount: row.amount,
    transactionDate: dateValue(row.transactionDate),
    returnDate: dateValue(row.returnDate),
    voided: row.voided,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

export async function listResidentFinanceForAdministrator(): Promise<ResidentFinanceBundle> {
  await requireAdministrator();
  const database = getDatabase();
  const headers = await database
    .select({
      residentNumber: legacyResidentHeaders.residentNumber,
      residentName: legacyResidentHeaders.residentName,
    })
    .from(legacyResidentHeaders)
    .orderBy(asc(legacyResidentHeaders.residentNumber));
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
  const entriesByResident = new Map<number, ResidentFinanceEntry[]>();
  for (const detail of details) {
    if (detail.residentNumber === null) {
      throw new Error("A resident detail query returned an unassigned row.");
    }
    const entries = entriesByResident.get(detail.residentNumber) ?? [];
    entries.push(mapEntry(detail));
    entriesByResident.set(detail.residentNumber, entries);
  }

  return {
    records: headers.map((header) => ({
      ...header,
      entries: entriesByResident.get(header.residentNumber) ?? [],
    })),
    unassignedEntries: unassignedRows.map(mapEntry),
  };
}
