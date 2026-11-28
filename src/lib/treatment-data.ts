import "server-only";

import { asc } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  legacyTreatmentDetails,
  legacyTreatmentHeaders,
  residents,
  treatmentInvoices,
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

type TreatmentInvoiceRow = typeof treatmentInvoices.$inferSelect;

function mapEntry(
  row: typeof legacyTreatmentDetails.$inferSelect,
  invoice: TreatmentInvoiceRow | undefined,
): TreatmentDetailEntry {
  const amount = row.amount ?? 0;
  const quantity = row.quantity ?? 1;
  const discount = row.discount ?? 0;
  const lineTotal = row.total ?? Math.max(0, amount * quantity - discount);

  return {
    id: row.id,
    residentNumber: row.residentNumber,
    invoiceId: invoice?.id ?? null,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    invoiceDate: invoice?.invoiceDate ?? dateValue(row.treatmentDate),
    invoiceTotal: invoice?.total ?? lineTotal,
    invoiceVoided: invoice?.voided ?? row.voided,
    prescriptionUrl: invoice?.prescriptionPathname
      ? `/api/treatment-prescriptions/${invoice.id}`
      : null,
    notes: invoice?.notes ?? "",
    medicationName: row.medicationName,
    amount,
    quantity,
    discount,
    total: lineTotal,
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
  const [headers, residentRows, invoiceRows, details] = await Promise.all([
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
    database
      .select()
      .from(treatmentInvoices)
      .orderBy(asc(treatmentInvoices.invoiceNumber)),
    database
      .select()
      .from(legacyTreatmentDetails)
      .orderBy(
        asc(legacyTreatmentDetails.treatmentDate),
        asc(legacyTreatmentDetails.id),
      ),
  ]);

  const invoicesById = new Map(
    invoiceRows.map((invoice) => [invoice.id, invoice]),
  );
  const entriesByResident = new Map<number, TreatmentDetailEntry[]>();
  const unassignedEntries: TreatmentDetailEntry[] = [];
  for (const detail of details) {
    const invoice = detail.invoiceId
      ? invoicesById.get(detail.invoiceId)
      : undefined;
    const entry = mapEntry(detail, invoice);
    if (detail.residentNumber === null) {
      unassignedEntries.push(entry);
      continue;
    }
    const entries = entriesByResident.get(detail.residentNumber) ?? [];
    entries.push(entry);
    entriesByResident.set(detail.residentNumber, entries);
  }

  return {
    records: headers.map((header) => {
      const entries = entriesByResident.get(header.residentNumber) ?? [];
      const totalBilled = entries
        .filter((entry) => !entry.voided)
        .reduce((sum, entry) => sum + entry.total, 0);
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
    unassignedEntries,
  };
}
