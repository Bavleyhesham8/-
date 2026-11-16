import "server-only";

import { getDatabase } from "@/db";
import {
  alternateInvoiceCategories,
  churchLookup,
  dayLookup,
  governorateLookup,
  villaNumbers,
} from "@/db/schema";
import { canViewResidentChurchData } from "@/lib/access-control";
import { requireCurrentSession } from "@/lib/auth-session";
import { canonicalVilla, isVillaLocation } from "@/lib/stay-location";
import type { LookupData } from "@/lib/lookup-types";

export async function listLookupDataForCurrentUser(): Promise<LookupData> {
  const session = await requireCurrentSession();
  const database = getDatabase();
  const canViewChurchFields = canViewResidentChurchData(
    session.user.role === "admin" || session.user.role === "viewer"
      ? session.user.role
      : "staff",
    session.user.allowedScreens,
    session.user.canEditResidents === true,
  );
  const [churches, governorates, days, alternateCategories, villas] =
    await Promise.all([
      canViewChurchFields
        ? database
            .select({
              id: churchLookup.id,
              number: churchLookup.number,
              name: churchLookup.name,
              acheshe: churchLookup.acheshe,
            })
            .from(churchLookup)
            .orderBy(churchLookup.name, churchLookup.id)
        : Promise.resolve([]),
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

  const uniqueVillas = new Map<string, (typeof villas)[number]>();
  for (const item of villas) {
    const number = canonicalVilla(item.villaNumber);
    if (number && !uniqueVillas.has(number)) {
      uniqueVillas.set(number, { ...item, villaNumber: number });
    }
  }

  return {
    churches,
    governorates,
    days,
    alternateCategories,
    villas: [...uniqueVillas.values()],
    rooms: villas.filter((item) => !isVillaLocation(item.villaNumber)),
  };
}
