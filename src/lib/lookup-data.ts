import "server-only";

import { getDatabase } from "@/db";
import {
  alternateInvoiceCategories,
  churchLookup,
  dayLookup,
  governorateLookup,
  villaNumbers,
} from "@/db/schema";
import { requireCurrentSession } from "@/lib/auth-session";
import type { LookupData } from "@/lib/lookup-types";

export async function listLookupDataForCurrentUser(): Promise<LookupData> {
  await requireCurrentSession();
  const database = getDatabase();
  const [churches, governorates, days, alternateCategories, villas] =
    await Promise.all([
      database
        .select({
          id: churchLookup.id,
          number: churchLookup.number,
          name: churchLookup.name,
          acheshe: churchLookup.acheshe,
          father: churchLookup.father,
        })
        .from(churchLookup)
        .orderBy(churchLookup.name, churchLookup.id),
      database
        .select({
          id: governorateLookup.id,
          governorate: governorateLookup.governorate,
          district: governorateLookup.district,
        })
        .from(governorateLookup)
        .orderBy(governorateLookup.governorate, governorateLookup.district),
      database
        .select({ id: dayLookup.id, day: dayLookup.day })
        .from(dayLookup)
        .orderBy(dayLookup.id),
      database
        .select({
          id: alternateInvoiceCategories.id,
          name: alternateInvoiceCategories.name,
        })
        .from(alternateInvoiceCategories)
        .orderBy(alternateInvoiceCategories.name, alternateInvoiceCategories.id),
      database
        .select({
          id: villaNumbers.id,
          villaNumber: villaNumbers.villaNumber,
        })
        .from(villaNumbers)
        .orderBy(villaNumbers.villaNumber, villaNumbers.id),
    ]);

  return { churches, governorates, days, alternateCategories, villas };
}
