"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  alternateInvoiceCategories,
  churchLookup,
  dayLookup,
  governorateLookup,
  residentInvoiceLines,
  residentStays,
  staffProfiles,
  villaNumbers,
} from "@/db/schema";
import { requireAdministrator } from "@/lib/auth-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { listLookupDataForCurrentUser } from "@/lib/lookup-data";
import {
  canonicalRoom,
  canonicalVilla,
  formatRoom,
} from "@/lib/stay-location";
import type { LookupData } from "@/lib/lookup-types";

const sourceText = z.string().trim().max(255);
const lookupId = z.number().int().positive().nullable();

const saveSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("church"),
    id: lookupId,
    number: sourceText,
    name: sourceText.min(1),
    acheshe: sourceText,
  }),
  z.object({
    kind: z.literal("governorate"),
    id: lookupId,
    governorate: sourceText.min(1),
    district: sourceText.min(1),
  }),
  z.object({
    kind: z.literal("day"),
    id: lookupId,
    day: sourceText.min(1),
  }),
  z.object({
    kind: z.literal("alternate-category"),
    id: lookupId,
    name: sourceText.min(1),
  }),
  z.object({
    kind: z.literal("villa"),
    id: lookupId,
    villaNumber: sourceText.max(64).min(1),
  }),
  z.object({
    kind: z.literal("room"),
    id: lookupId,
    villaNumber: sourceText.max(64).min(1),
  }),
]);

const deleteSchema = z.object({
  kind: z.enum([
    "church",
    "governorate",
    "day",
    "alternate-category",
    "villa",
    "room",
  ]),
  id: z.number().int().positive(),
});

function nullableText(value: string) {
  const normalized = value.normalize("NFC");
  return normalized || null;
}

type LookupActionResult =
  | { ok: true; data: LookupData }
  | { ok: false; error: string };

export async function saveLookupAction(
  input: unknown,
): Promise<LookupActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع بيانات سجل القائمة." };
  }
  const session = await requireAdministrator();

  let entityId = parsed.data.id;
  const database = getDatabase();
  const saved = await database.transaction(async (transaction): Promise<
    { ok: true } | { ok: false; error: string }
  > => {
    switch (parsed.data.kind) {
      case "church": {
        const values = {
          number: nullableText(parsed.data.number),
          name: parsed.data.name.normalize("NFC"),
          acheshe: nullableText(parsed.data.acheshe),
        };
        if (parsed.data.id !== null) {
          const [existing] = await transaction
            .select({ id: churchLookup.id, name: churchLookup.name })
            .from(churchLookup)
            .where(eq(churchLookup.id, parsed.data.id))
            .for("update");
          if (!existing) {
            return { ok: false, error: "لم يتم العثور على سجل الكنيسة." };
          }
          const [updated] = await transaction
            .update(churchLookup)
            .set(values)
            .where(eq(churchLookup.id, parsed.data.id))
            .returning({ id: churchLookup.id });
          if (!updated) {
            return { ok: false, error: "تعذر تحديث سجل الكنيسة." };
          }
          if (existing.name && existing.name !== values.name) {
            await transaction
              .update(staffProfiles)
              .set({ church: values.name })
              .where(eq(staffProfiles.church, existing.name));
          }
        } else {
          const [created] = await transaction
            .insert(churchLookup)
            .values(values)
            .returning({ id: churchLookup.id });
          if (!created) {
            return { ok: false, error: "تعذر إضافة سجل الكنيسة." };
          }
          entityId = created.id;
        }
        return { ok: true };
      }
      case "governorate": {
        const values = {
          governorate: parsed.data.governorate.normalize("NFC"),
          district: parsed.data.district.normalize("NFC"),
        };
        if (parsed.data.id !== null) {
          const [existing] = await transaction
            .select({
              id: governorateLookup.id,
              governorate: governorateLookup.governorate,
              district: governorateLookup.district,
            })
            .from(governorateLookup)
            .where(eq(governorateLookup.id, parsed.data.id))
            .for("update");
          if (!existing) {
            return { ok: false, error: "لم يتم العثور على سجل المحافظة." };
          }
          const [updated] = await transaction
            .update(governorateLookup)
            .set(values)
            .where(eq(governorateLookup.id, parsed.data.id))
            .returning({ id: governorateLookup.id });
          if (!updated) {
            return { ok: false, error: "تعذر تحديث سجل المحافظة." };
          }
          if (
            existing.governorate &&
            existing.district &&
            (existing.governorate !== values.governorate ||
              existing.district !== values.district)
          ) {
            await transaction
              .update(staffProfiles)
              .set({
                governorate: values.governorate,
                district: values.district,
              })
              .where(
                and(
                  eq(staffProfiles.governorate, existing.governorate),
                  eq(staffProfiles.district, existing.district),
                ),
              );
          }
        } else {
          const [created] = await transaction
            .insert(governorateLookup)
            .values(values)
            .returning({ id: governorateLookup.id });
          if (!created) {
            return { ok: false, error: "تعذر إضافة سجل المحافظة." };
          }
          entityId = created.id;
        }
        return { ok: true };
      }
      case "day": {
        const values = { day: parsed.data.day.normalize("NFC") };
        if (parsed.data.id !== null) {
          const [existing] = await transaction
            .select({ id: dayLookup.id })
            .from(dayLookup)
            .where(eq(dayLookup.id, parsed.data.id))
            .for("update");
          if (!existing) {
            return { ok: false, error: "لم يتم العثور على سجل اليوم." };
          }
          const [updated] = await transaction
            .update(dayLookup)
            .set(values)
            .where(eq(dayLookup.id, parsed.data.id))
            .returning({ id: dayLookup.id });
          if (!updated) {
            return { ok: false, error: "تعذر تحديث سجل اليوم." };
          }
        } else {
          const [created] = await transaction
            .insert(dayLookup)
            .values(values)
            .returning({ id: dayLookup.id });
          if (!created) {
            return { ok: false, error: "تعذر إضافة سجل اليوم." };
          }
          entityId = created.id;
        }
        return { ok: true };
      }
      case "alternate-category": {
        const values = { name: parsed.data.name.normalize("NFC") };
        if (parsed.data.id !== null) {
          const [existing] = await transaction
            .select({
              id: alternateInvoiceCategories.id,
              name: alternateInvoiceCategories.name,
            })
            .from(alternateInvoiceCategories)
            .where(eq(alternateInvoiceCategories.id, parsed.data.id))
            .for("update");
          if (!existing) {
            return { ok: false, error: "لم يتم العثور على سجل الفئة." };
          }
          const [updated] = await transaction
            .update(alternateInvoiceCategories)
            .set(values)
            .where(eq(alternateInvoiceCategories.id, parsed.data.id))
            .returning({ id: alternateInvoiceCategories.id });
          if (!updated) {
            return { ok: false, error: "تعذر تحديث سجل الفئة." };
          }
          if (existing.name && existing.name !== values.name) {
            await transaction
              .update(residentInvoiceLines)
              .set({ alternateCategory: values.name })
              .where(eq(residentInvoiceLines.alternateCategory, existing.name));
          }
        } else {
          const [created] = await transaction
            .insert(alternateInvoiceCategories)
            .values(values)
            .returning({ id: alternateInvoiceCategories.id });
          if (!created) {
            return { ok: false, error: "تعذر إضافة سجل الفئة." };
          }
          entityId = created.id;
        }
        return { ok: true };
      }
      case "villa":
      case "room": {
        const isRoom = parsed.data.kind === "room";
        const rawValue = parsed.data.villaNumber.normalize("NFC");
        const values = {
          villaNumber: isRoom ? formatRoom(rawValue) : canonicalVilla(rawValue),
        };
        if (!values.villaNumber) {
          return {
            ok: false,
            error: isRoom
              ? "أدخل اسم الغرفة."
              : "رقم الفيلا يجب أن يكون A أو B أو C أو D.",
          };
        }
        const [duplicate] = await transaction
          .select({ id: villaNumbers.id })
          .from(villaNumbers)
          .where(eq(villaNumbers.villaNumber, values.villaNumber))
          .limit(1);
        if (duplicate && duplicate.id !== parsed.data.id) {
          return {
            ok: false,
            error: isRoom ? "اسم الغرفة مسجل بالفعل." : "رقم الفيلا مسجل بالفعل.",
          };
        }

        if (parsed.data.id !== null) {
          const [existing] = await transaction
            .select({
              id: villaNumbers.id,
              villaNumber: villaNumbers.villaNumber,
            })
            .from(villaNumbers)
            .where(eq(villaNumbers.id, parsed.data.id))
            .for("update");
          if (!existing) {
            return {
              ok: false,
              error: isRoom
                ? "لم يتم العثور على الغرفة."
                : "لم يتم العثور على رقم الفيلا.",
            };
          }
          if (isRoom && canonicalVilla(existing.villaNumber)) {
            return { ok: false, error: "هذا السجل فيلا وليس غرفة." };
          }
          if (!isRoom && !canonicalVilla(existing.villaNumber)) {
            return { ok: false, error: "هذا السجل غرفة وليس فيلا." };
          }
          const [updated] = await transaction
            .update(villaNumbers)
            .set(values)
            .where(eq(villaNumbers.id, parsed.data.id))
            .returning({ id: villaNumbers.id });
          if (!updated) {
            return {
              ok: false,
              error: isRoom ? "تعذر تحديث الغرفة." : "تعذر تحديث رقم الفيلا.",
            };
          }

          const oldValue = existing.villaNumber ?? "";
          if (oldValue !== values.villaNumber) {
            const stays = await transaction
              .select({ id: residentStays.id, villa: residentStays.villa, room: residentStays.room })
              .from(residentStays);
            const matchingStayIds = stays
              .filter((stay) =>
                isRoom
                  ? canonicalRoom(stay.room) === canonicalRoom(oldValue)
                  : canonicalVilla(stay.villa) === canonicalVilla(oldValue),
              )
              .map((stay) => stay.id);
            if (matchingStayIds.length) {
              await transaction
                .update(residentStays)
                .set(
                  isRoom
                    ? { room: values.villaNumber }
                    : { villa: values.villaNumber },
                )
                .where(inArray(residentStays.id, matchingStayIds));
            }
          }
        } else {
          const [created] = await transaction
            .insert(villaNumbers)
            .values(values)
            .onConflictDoNothing()
            .returning({ id: villaNumbers.id });
          if (!created) {
            return {
              ok: false,
              error: isRoom ? "اسم الغرفة مسجل بالفعل." : "رقم الفيلا مسجل بالفعل.",
            };
          }
          entityId = created.id;
        }
        return { ok: true };
      }
    }
  });

  if (!saved.ok) return saved;
  const entityByKind = {
    church: "churchLookup",
    governorate: "governorateLookup",
    day: "dayLookup",
    "alternate-category": "alternateInvoiceCategories",
    villa: "villaNumbers",
    room: "villaNumbers",
  } as const;
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: parsed.data.id === null ? "create" : "update",
    entity: entityByKind[parsed.data.kind],
    entityId,
    metadata: { fields: "lookupFields" },
  });
  return { ok: true, data: await listLookupDataForCurrentUser() };
}

export async function deleteLookupAction(
  input: unknown,
): Promise<LookupActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "تعذر تحديد سجل القائمة المطلوب." };
  }
  const session = await requireAdministrator();

  const database = getDatabase();
  const deleted = await database.transaction(async (transaction): Promise<
    { ok: true } | { ok: false; error: string }
  > => {
    switch (parsed.data.kind) {
      case "church": {
        const [record] = await transaction
          .select({ id: churchLookup.id, name: churchLookup.name })
          .from(churchLookup)
          .where(eq(churchLookup.id, parsed.data.id))
          .for("update");
        if (!record) {
          return { ok: false, error: "لم يتم العثور على سجل الكنيسة." };
        }
        if (record.name) {
          const [reference] = await transaction
            .select({ id: staffProfiles.profileNumber })
            .from(staffProfiles)
            .where(eq(staffProfiles.church, record.name))
            .limit(1);
          if (reference) {
            return {
              ok: false,
              error: "لا يمكن حذف الكنيسة لأنها مستخدمة في ملف موظف.",
            };
          }
        }
        await transaction
          .delete(churchLookup)
          .where(eq(churchLookup.id, record.id));
        return { ok: true };
      }
      case "governorate": {
        const [record] = await transaction
          .select({
            id: governorateLookup.id,
            governorate: governorateLookup.governorate,
            district: governorateLookup.district,
          })
          .from(governorateLookup)
          .where(eq(governorateLookup.id, parsed.data.id))
          .for("update");
        if (!record) {
          return { ok: false, error: "لم يتم العثور على سجل المحافظة." };
        }
        if (record.governorate && record.district) {
          const [reference] = await transaction
            .select({ id: staffProfiles.profileNumber })
            .from(staffProfiles)
            .where(
              and(
                eq(staffProfiles.governorate, record.governorate),
                eq(staffProfiles.district, record.district),
              ),
            )
            .limit(1);
          if (reference) {
            return {
              ok: false,
              error:
                "لا يمكن حذف المحافظة أو المركز لأنه مستخدم في ملف موظف.",
            };
          }
        }
        await transaction
          .delete(governorateLookup)
          .where(eq(governorateLookup.id, record.id));
        return { ok: true };
      }
      case "day": {
        const [record] = await transaction
          .select({ id: dayLookup.id })
          .from(dayLookup)
          .where(eq(dayLookup.id, parsed.data.id))
          .for("update");
        if (!record) {
          return { ok: false, error: "لم يتم العثور على سجل اليوم." };
        }
        await transaction.delete(dayLookup).where(eq(dayLookup.id, record.id));
        return { ok: true };
      }
      case "alternate-category": {
        const [record] = await transaction
          .select({
            id: alternateInvoiceCategories.id,
            name: alternateInvoiceCategories.name,
          })
          .from(alternateInvoiceCategories)
          .where(eq(alternateInvoiceCategories.id, parsed.data.id))
          .for("update");
        if (!record) {
          return { ok: false, error: "لم يتم العثور على سجل الفئة." };
        }
        if (record.name) {
          const [reference] = await transaction
            .select({ id: residentInvoiceLines.id })
            .from(residentInvoiceLines)
            .where(eq(residentInvoiceLines.alternateCategory, record.name))
            .limit(1);
          if (reference) {
            return {
              ok: false,
              error: "لا يمكن حذف الفئة لأنها مستخدمة في فاتورة.",
            };
          }
        }
        await transaction
          .delete(alternateInvoiceCategories)
          .where(eq(alternateInvoiceCategories.id, record.id));
        return { ok: true };
      }
      case "villa":
      case "room": {
        const isRoom = parsed.data.kind === "room";
        const [record] = await transaction
          .select({
            id: villaNumbers.id,
            villaNumber: villaNumbers.villaNumber,
          })
          .from(villaNumbers)
          .where(eq(villaNumbers.id, parsed.data.id))
          .for("update");
        if (!record) {
          return {
            ok: false,
            error: isRoom
              ? "لم يتم العثور على الغرفة."
              : "لم يتم العثور على رقم الفيلا.",
          };
        }
        const stays = await transaction
          .select({ id: residentStays.id, villa: residentStays.villa, room: residentStays.room })
          .from(residentStays);
        const inUse = stays.some((stay) =>
          isRoom
            ? canonicalRoom(stay.room) === canonicalRoom(record.villaNumber)
            : canonicalVilla(stay.villa) === canonicalVilla(record.villaNumber),
        );
        if (inUse) {
          return {
            ok: false,
            error: isRoom
              ? "لا يمكن حذف الغرفة لوجود سجل إقامة مرتبط بها."
              : "لا يمكن حذف الفيلا لوجود سجل إقامة مرتبط بها.",
          };
        }
        await transaction.delete(villaNumbers).where(eq(villaNumbers.id, record.id));
        return { ok: true };
      }
    }
  });

  if (!deleted.ok) return deleted;
  const entityByKind = {
    church: "churchLookup",
    governorate: "governorateLookup",
    day: "dayLookup",
    "alternate-category": "alternateInvoiceCategories",
    villa: "villaNumbers",
    room: "villaNumbers",
  } as const;
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "delete",
    entity: entityByKind[parsed.data.kind],
    entityId: parsed.data.id,
  });
  return { ok: true, data: await listLookupDataForCurrentUser() };
}
