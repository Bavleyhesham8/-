"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  legacyTreatmentDetails,
  legacyTreatmentHeaders,
} from "@/db/schema";
import { requireStaffPermission } from "@/lib/auth-session";
import { isDevelopmentDemoMode } from "@/lib/app-config";
import { listTreatmentForAdministrator } from "@/lib/treatment-data";
import { demoTreatmentBundle } from "@/lib/treatment-demo-data";
import type { TreatmentBundle } from "@/lib/treatment-types";

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
const residentNumberSchema = z.number().int().positive().max(2_147_483_647);

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

type ActionResult =
  | { ok: true; bundle: TreatmentBundle }
  | { ok: false; error: string };

export async function createTreatmentHeaderAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await requireStaffPermission("canAccessClinic");
  const parsed = z
    .object({
      residentNumber: residentNumberSchema,
      residentName: z.string().trim().min(1).max(200),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل رقم النزيل واسمه بصورة صحيحة." };
  }

  if (isDevelopmentDemoMode()) {
    const existing = demoTreatmentBundle.records.find(
      (r) => r.residentNumber === parsed.data.residentNumber,
    );
    if (existing) {
      return { ok: false, error: "رقم النزيل مسجل بالفعل في سجلات العلاج." };
    }
    demoTreatmentBundle.records.push({
      residentNumber: parsed.data.residentNumber,
      residentName: parsed.data.residentName,
      entries: [],
      totalBilled: 0,
    });
    return { ok: true, bundle: { ...demoTreatmentBundle } };
  }

  const [created] = await getDatabase()
    .insert(legacyTreatmentHeaders)
    .values({
      residentNumber: parsed.data.residentNumber,
      residentName: parsed.data.residentName.normalize("NFC"),
      createdBy: session.user.id,
    })
    .onConflictDoNothing()
    .returning({ residentNumber: legacyTreatmentHeaders.residentNumber });

  if (!created) {
    return { ok: false, error: "رقم النزيل مسجل بالفعل في سجلات العلاج." };
  }

  return {
    ok: true,
    bundle: await listTreatmentForAdministrator(),
  };
}

export async function recordTreatmentEntryAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await requireStaffPermission("canAccessClinic");
  const parsed = z
    .object({
      residentNumber: residentNumberSchema,
      medicationName: z.string().trim().min(1).max(250),
      amount: z.number().finite().positive().max(1_000_000),
      quantity: z.number().finite().positive().max(10_000).default(1),
      discount: z.number().finite().nonnegative().max(1_000_000).default(0),
      treatmentDate: dateSchema,
    })
    .safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "يرجى إدخال اسم الدواء وسعر صحيح والكمية وتاريخ الصرف.",
    };
  }

  const calculatedTotal = Math.max(
    0,
    parsed.data.amount * parsed.data.quantity - parsed.data.discount,
  );

  if (isDevelopmentDemoMode()) {
    const record = demoTreatmentBundle.records.find(
      (r) => r.residentNumber === parsed.data.residentNumber,
    );
    if (!record) {
      return { ok: false, error: "سجل النزيل غير موجود." };
    }
    const newEntry = {
      id: Date.now(),
      residentNumber: parsed.data.residentNumber,
      medicationName: parsed.data.medicationName,
      amount: parsed.data.amount,
      quantity: parsed.data.quantity,
      discount: parsed.data.discount,
      total: calculatedTotal,
      treatmentDate: parsed.data.treatmentDate,
      voided: false,
      voidReason: "",
      voidedAt: null,
    };
    record.entries.unshift(newEntry);
    record.totalBilled += calculatedTotal;
    return { ok: true, bundle: { ...demoTreatmentBundle } };
  }

  const result = await getDatabase().transaction(async (transaction) => {
    const [header] = await transaction
      .select({
        residentNumber: legacyTreatmentHeaders.residentNumber,
      })
      .from(legacyTreatmentHeaders)
      .where(
        eq(legacyTreatmentHeaders.residentNumber, parsed.data.residentNumber),
      )
      .limit(1)
      .for("update");

    if (!header) {
      return { ok: false as const, error: "سجل النزيل غير موجود." };
    }

    await transaction.insert(legacyTreatmentDetails).values({
      residentNumber: parsed.data.residentNumber,
      medicationName: parsed.data.medicationName.normalize("NFC"),
      amount: parsed.data.amount,
      quantity: parsed.data.quantity,
      discount: parsed.data.discount,
      total: calculatedTotal,
      treatmentDate: toDate(parsed.data.treatmentDate),
      createdBy: session.user.id,
    });

    return { ok: true as const };
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    bundle: await listTreatmentForAdministrator(),
  };
}

export async function voidTreatmentEntryAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await requireStaffPermission("canAccessClinic");
  const parsed = z
    .object({
      id: z.number().int().positive(),
      voidReason: z.string().trim().min(3).max(500),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "سبب الإلغاء مطلوب ويجب ألا يقل عن 3 أحرف." };
  }

  if (isDevelopmentDemoMode()) {
    for (const record of demoTreatmentBundle.records) {
      const entry = record.entries.find((e) => e.id === parsed.data.id);
      if (entry && !entry.voided) {
        entry.voided = true;
        entry.voidReason = parsed.data.voidReason;
        entry.voidedAt = new Date().toISOString();
        record.totalBilled = Math.max(0, record.totalBilled - entry.total);
        return { ok: true, bundle: { ...demoTreatmentBundle } };
      }
    }
    return { ok: false, error: "إذن صرف الدواء غير موجود أو تم إلغاؤه بالفعل." };
  }

  const result = await getDatabase().transaction(async (transaction) => {
    const [entry] = await transaction
      .select({
        id: legacyTreatmentDetails.id,
        voided: legacyTreatmentDetails.voided,
      })
      .from(legacyTreatmentDetails)
      .where(eq(legacyTreatmentDetails.id, parsed.data.id))
      .limit(1)
      .for("update");

    if (!entry) {
      return { ok: false as const, error: "سجل صرف الدواء غير موجود." };
    }
    if (entry.voided) {
      return { ok: false as const, error: "تم إلغاء هذا السجل بالفعل مسبقًا." };
    }

    await transaction
      .update(legacyTreatmentDetails)
      .set({
        voided: true,
        voidReason: parsed.data.voidReason.normalize("NFC"),
        voidedAt: new Date(),
        voidedBy: session.user.id,
      })
      .where(eq(legacyTreatmentDetails.id, parsed.data.id));

    return { ok: true as const };
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    bundle: await listTreatmentForAdministrator(),
  };
}

