import "server-only";

import { asc, inArray, isNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  legacyTreatmentDetails,
  legacyTreatmentHeaders,
  residents,
} from "@/db/schema";
import { requireScreenAccess } from "@/lib/auth-session";
import { isDevelopmentDemoMode } from "@/lib/app-config";
import { demoTreatmentBundle } from "@/lib/treatment-demo-data";
import { findResidentByName } from "@/lib/resident-matching";
import type {
  TreatmentBundle,
  TreatmentDetailEntry,
} from "@/lib/treatment-types";

function dateValue(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function mapEntry(
  row: typeof legacyTreatmentDetails.$inferSelect,
): TreatmentDetailEntry {
  const amount = row.amount ?? 0;
  const quantity = row.quantity ?? 1;
  const discount = row.discount ?? 0;
  const total = row.total ?? Math.max(0, amount * quantity - discount);

  return {
    id: row.id,
    residentNumber: row.residentNumber,
    medicationName: row.medicationName,
    amount,
    quantity,
    discount,
    total,
    treatmentDate: dateValue(row.treatmentDate),
    voided: row.voided,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt?.toISOString() ?? null,
  };
}

export async function listTreatmentForCurrentUser(): Promise<TreatmentBundle> {
  if (isDevelopmentDemoMode()) {
    return demoTreatmentBundle;
  }

  await requireScreenAccess("treatment");
  const database = getDatabase();
  const [headers, residentRows] = await Promise.all([
    database
      .select({
        residentNumber: legacyTreatmentHeaders.residentNumber,
        residentName: legacyTreatmentHeaders.residentName,
      })
      .from(legacyTreatmentHeaders)
      .orderBy(asc(legacyTreatmentHeaders.residentNumber)),
    database
      .select({
        id: residents.id,
        name: residents.name,
        residentNumber: residents.residentNumber,
        fileNumber: residents.fileNumber,
      })
      .from(residents),
  ]);

  const residentNumbers = headers.map((header) => header.residentNumber);
  const details = residentNumbers.length
    ? await database
        .select()
        .from(legacyTreatmentDetails)
        .where(inArray(legacyTreatmentDetails.residentNumber, residentNumbers))
        .orderBy(
          asc(legacyTreatmentDetails.treatmentDate),
          asc(legacyTreatmentDetails.id),
        )
    : [];

  const unassignedRows = await database
    .select()
    .from(legacyTreatmentDetails)
    .where(isNull(legacyTreatmentDetails.residentNumber))
    .orderBy(asc(legacyTreatmentDetails.id));

  const entriesByResident = new Map<number, TreatmentDetailEntry[]>();
  for (const detail of details) {
    if (detail.residentNumber === null) continue;
    const entries = entriesByResident.get(detail.residentNumber) ?? [];
    entries.push(mapEntry(detail));
    entriesByResident.set(detail.residentNumber, entries);
  }

  return {
    records: headers.map((header) => {
      const entries = entriesByResident.get(header.residentNumber) ?? [];
      const totalBilled = entries
        .filter((e) => !e.voided)
        .reduce((sum, e) => sum + e.total, 0);
      const match = findResidentByName(
        header.residentName,
        residentRows,
        header.residentNumber,
      );
      return {
        ...header,
        residentId: match?.resident.id ?? null,
        matchScore: match?.score ?? null,
        matchAmbiguous: match?.ambiguous ?? false,
        entries,
        totalBilled,
      };
    }),
    unassignedEntries: unassignedRows.map(mapEntry),
  };
}
