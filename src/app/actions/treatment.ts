"use server";

import { and, eq } from "drizzle-orm";
import { del, put } from "@vercel/blob";
import sharp from "sharp";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  legacyTreatmentDetails,
  legacyTreatmentHeaders,
  treatmentInvoices,
} from "@/db/schema";
import { requireStaffPermission } from "@/lib/auth-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { isDevelopmentDemoMode } from "@/lib/app-config";
import { listTreatmentForCurrentUser } from "@/lib/treatment-data";
import { demoTreatmentBundle } from "@/lib/treatment-demo-data";
import type {
  TreatmentBundle,
  TreatmentDetailEntry,
} from "@/lib/treatment-types";

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
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const lineSchema = z
  .object({
    medicationName: z.string().trim().min(1).max(250),
    amount: z.number().finite().positive().max(1_000_000),
    quantity: z.number().finite().positive().max(10_000),
    discount: z.number().finite().nonnegative().max(1_000_000),
  })
  .refine(
    (line) => line.discount <= line.amount * line.quantity,
    "الخصم أكبر من قيمة البند.",
  );
const linesSchema = z.array(lineSchema).min(1).max(40);

const invoiceInputSchema = z.object({
  invoiceId: z.string().trim().min(1).max(100).optional(),
  residentNumber: residentNumberSchema,
  residentName: z.string().trim().min(1).max(200),
  residentId: z.string().trim().min(1).max(100).optional(),
  invoiceDate: dateSchema,
  notes: z.string().trim().max(1000).default(""),
  lines: linesSchema,
});

const voidInputSchema = z.object({
  invoiceId: z.string().trim().min(1).max(100),
  voidReason: z.string().trim().min(3).max(500),
});

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function lineTotal(line: { amount: number; quantity: number; discount: number }) {
  return Math.max(0, line.amount * line.quantity - line.discount);
}

function normalizeText(value: string) {
  return value.normalize("NFC");
}

function parseInvoiceForm(formData: FormData) {
  let linesJson: unknown;
  try {
    linesJson = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false as const, error: "بنود الفاتورة غير صالحة." };
  }
  const residentNumber = Number(formData.get("residentNumber"));
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  const residentId = String(formData.get("residentId") ?? "").trim();
  const parsed = invoiceInputSchema.safeParse({
    invoiceId: invoiceId || undefined,
    residentNumber,
    residentName: String(formData.get("residentName") ?? ""),
    residentId: residentId || undefined,
    invoiceDate: String(formData.get("invoiceDate") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    lines: linesJson,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error:
        "راجع النزيل وتاريخ الفاتورة وبنود الأدوية؛ يجب إدخال بند واحد صحيح على الأقل.",
    };
  }
  return { ok: true as const, data: parsed.data };
}

function prescriptionFile(formData: FormData) {
  const value = formData.get("prescription");
  return value instanceof File && value.size > 0 ? value : null;
}

const MAX_PRESCRIPTION_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_PRESCRIPTION_OUTPUT_BYTES = 3 * 1024 * 1024;

async function storePrescription(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("PRESCRIPTION_INVALID_TYPE");
  }
  if (file.size > MAX_PRESCRIPTION_INPUT_BYTES) {
    throw new Error("PRESCRIPTION_TOO_LARGE");
  }
  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  try {
    output = await sharp(input)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new Error("PRESCRIPTION_INVALID_IMAGE");
  }
  if (output.length > MAX_PRESCRIPTION_OUTPUT_BYTES) {
    throw new Error("PRESCRIPTION_TOO_LARGE");
  }
  const pathname = `treatment-prescriptions/${crypto.randomUUID()}.jpg`;
  const blob = await put(pathname, output, {
    access: "private",
    contentType: "image/jpeg",
    addRandomSuffix: false,
  });
  return { pathname: blob.pathname, contentType: "image/jpeg" };
}

async function demoPrescriptionUrl(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("PRESCRIPTION_INVALID_TYPE");
  }
  if (file.size > MAX_PRESCRIPTION_INPUT_BYTES) {
    throw new Error("PRESCRIPTION_TOO_LARGE");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type || "image/jpeg"};base64,${buffer.toString("base64")}`;
}

function prescriptionErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "PRESCRIPTION_STORAGE_NOT_CONFIGURED") {
      return "تخزين صور الروشتات غير مهيأ على الخادم. أضف BLOB_READ_WRITE_TOKEN ثم أعد المحاولة، أو احفظ الفاتورة بدون صورة.";
    }
    if (error.message === "PRESCRIPTION_INVALID_TYPE") {
      return "الملف المختار ليس صورة صالحة. استخدم صورة JPG أو PNG أو WEBP.";
    }
    if (error.message === "PRESCRIPTION_INVALID_IMAGE") {
      return "تعذر قراءة الصورة. جرّب صورة أخرى بصيغة JPG أو PNG.";
    }
    if (error.message === "PRESCRIPTION_TOO_LARGE") {
      return "حجم صورة الروشتة كبير جدًا. استخدم صورة أصغر من 4 ميجابايت.";
    }
  }
  return "تعذر حفظ صورة الروشتة. تحقق من الاتصال ثم حاول مرة أخرى.";
}

type ActionResult =
  | { ok: true; bundle: TreatmentBundle }
  | { ok: false; error: string };

type DemoLine = {
  medicationName: string;
  amount: number;
  quantity: number;
  discount: number;
};

function demoMaxEntryId() {
  return Math.max(
    0,
    ...demoTreatmentBundle.records.flatMap((record) =>
      record.entries.map((entry) => entry.id),
    ),
    ...demoTreatmentBundle.unassignedEntries.map((entry) => entry.id),
  );
}

function demoNextInvoiceNumber() {
  return (
    Math.max(
      0,
      ...demoTreatmentBundle.records.flatMap((record) =>
        record.entries.map((entry) => entry.invoiceNumber ?? 0),
      ),
      ...demoTreatmentBundle.unassignedEntries.map(
        (entry) => entry.invoiceNumber ?? 0,
      ),
    ) + 1
  );
}

function demoInvoiceEntries(invoiceId: string) {
  for (const record of demoTreatmentBundle.records) {
    const entries = record.entries.filter(
      (entry) => entry.invoiceId === invoiceId,
    );
    if (entries.length) return { record, entries };
  }
  const entries = demoTreatmentBundle.unassignedEntries.filter(
    (entry) => entry.invoiceId === invoiceId,
  );
  if (entries.length) {
    return { record: null, entries };
  }
  return null;
}

function demoEntry(
  id: number,
  invoiceId: string,
  invoiceNumber: number,
  invoiceDate: string,
  invoiceTotal: number,
  prescriptionUrl: string | null,
  notes: string,
  residentNumber: number,
  line: DemoLine,
): TreatmentDetailEntry {
  return {
    id,
    residentNumber,
    invoiceId,
    invoiceNumber,
    invoiceDate,
    invoiceTotal,
    invoiceVoided: false,
    prescriptionUrl,
    notes,
    medicationName: normalizeText(line.medicationName),
    amount: line.amount,
    quantity: line.quantity,
    discount: line.discount,
    total: lineTotal(line),
    treatmentDate: invoiceDate,
    voided: false,
    voidReason: "",
    voidedAt: null,
  };
}

export async function saveTreatmentInvoiceAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireStaffPermission("canAccessClinic");
  const parsed = parseInvoiceForm(formData);
  if (!parsed.ok) return parsed;
  const {
    invoiceId,
    residentNumber,
    residentName,
    residentId,
    invoiceDate,
    notes,
    lines,
  } = parsed.data;
  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const prescription = prescriptionFile(formData);
  const removePrescription =
    formData.get("removePrescription") === "true" && !prescription;

  if (!isDevelopmentDemoMode()) {
    if (invoiceId && !uuidPattern.test(invoiceId)) {
      return { ok: false, error: "فاتورة العلاج غير صالحة." };
    }
    if (residentId && !uuidPattern.test(residentId)) {
      return { ok: false, error: "بيانات النزيل غير صالحة." };
    }
  }

  if (isDevelopmentDemoMode()) {
    let nextPrescriptionUrl: string | null | undefined;
    if (prescription) {
      try {
        nextPrescriptionUrl = await demoPrescriptionUrl(prescription);
      } catch (error) {
        return { ok: false, error: prescriptionErrorMessage(error) };
      }
    } else if (removePrescription) {
      nextPrescriptionUrl = null;
    }

    if (invoiceId) {
      const found = demoInvoiceEntries(invoiceId);
      if (!found) {
        return { ok: false, error: "فاتورة العلاج غير موجودة." };
      }
      if (found.entries.some((entry) => entry.invoiceVoided)) {
        return { ok: false, error: "لا يمكن تعديل فاتورة علاج ملغاة." };
      }
      const previousTotal = found.entries.reduce(
        (sum, entry) => sum + entry.total,
        0,
      );
      const invoiceNumber = found.entries[0].invoiceNumber ?? demoNextInvoiceNumber();
      const prescriptionUrl =
        nextPrescriptionUrl === undefined
          ? found.entries[0].prescriptionUrl
          : nextPrescriptionUrl;
      const nextEntryId = demoMaxEntryId() + 1;
      const replacement = lines.map((line, index) =>
        demoEntry(
          nextEntryId + index,
          invoiceId,
          invoiceNumber,
          invoiceDate,
          total,
          prescriptionUrl ?? null,
          normalizeText(notes),
          residentNumber,
          line,
        ),
      );
      if (found.record) {
        found.record.entries = [
          ...found.record.entries.filter(
            (entry) => entry.invoiceId !== invoiceId,
          ),
          ...replacement,
        ];
        found.record.totalBilled = Math.max(
          0,
          found.record.totalBilled - previousTotal + total,
        );
        found.record.residentId = residentId ?? found.record.residentId;
        found.record.residentName = normalizeText(residentName);
      } else {
        demoTreatmentBundle.unassignedEntries = [
          ...demoTreatmentBundle.unassignedEntries.filter(
            (entry) => entry.invoiceId !== invoiceId,
          ),
          ...replacement,
        ];
      }
      return { ok: true, bundle: { ...demoTreatmentBundle } };
    }

    let record = demoTreatmentBundle.records.find(
      (item) => item.residentNumber === residentNumber,
    );
    if (!record) {
      record = {
        residentNumber,
        residentName: normalizeText(residentName),
        residentId: residentId ?? null,
        matchScore: residentId ? 1 : null,
        matchAmbiguous: false,
        entries: [],
        totalBilled: 0,
      };
      demoTreatmentBundle.records.push(record);
    } else {
      record.residentName = normalizeText(residentName);
      if (residentId) record.residentId = residentId;
    }
    const invoiceNumber = demoNextInvoiceNumber();
    const nextInvoiceId = `demo-invoice-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const nextEntryId = demoMaxEntryId() + 1;
    record.entries.unshift(
      ...lines.map((line, index) =>
        demoEntry(
          nextEntryId + index,
          nextInvoiceId,
          invoiceNumber,
          invoiceDate,
          total,
          nextPrescriptionUrl ?? null,
          normalizeText(notes),
          residentNumber,
          line,
        ),
      ),
    );
    record.totalBilled += total;
    return { ok: true, bundle: { ...demoTreatmentBundle } };
  }

  let stored: { pathname: string; contentType: string } | null = null;
  if (prescription) {
    try {
      stored = await storePrescription(prescription);
    } catch (error) {
      return { ok: false, error: prescriptionErrorMessage(error) };
    }
  }

  try {
    const result = await getDatabase().transaction(async (transaction) => {
      const [header] = await transaction
        .select({
          residentNumber: legacyTreatmentHeaders.residentNumber,
        })
        .from(legacyTreatmentHeaders)
        .where(eq(legacyTreatmentHeaders.residentNumber, residentNumber))
        .limit(1)
        .for("update");

      if (!header) {
        await transaction
          .insert(legacyTreatmentHeaders)
          .values({
            residentNumber,
            residentName: normalizeText(residentName),
            createdBy: session.user.id,
          })
          .onConflictDoNothing();
      }

      if (invoiceId) {
        const [invoice] = await transaction
          .select()
          .from(treatmentInvoices)
          .where(eq(treatmentInvoices.id, invoiceId))
          .limit(1)
          .for("update");
        if (!invoice) {
          return {
            ok: false as const,
            error: "فاتورة العلاج غير موجودة.",
          };
        }
        if (invoice.voided) {
          return {
            ok: false as const,
            error: "لا يمكن تعديل فاتورة علاج ملغاة.",
          };
        }
        const nextPathname = stored?.pathname ?? (removePrescription ? null : invoice.prescriptionPathname);
        const nextContentType =
          stored?.contentType ??
          (removePrescription ? null : invoice.prescriptionContentType);
        await transaction
          .update(treatmentInvoices)
          .set({
            invoiceDate,
            notes: normalizeText(notes),
            total,
            prescriptionPathname: nextPathname,
            prescriptionContentType: nextContentType,
          })
          .where(eq(treatmentInvoices.id, invoiceId));
        await transaction
          .delete(legacyTreatmentDetails)
          .where(eq(legacyTreatmentDetails.invoiceId, invoiceId));
        await transaction.insert(legacyTreatmentDetails).values(
          lines.map((line) => ({
            invoiceId,
            residentNumber,
            medicationName: normalizeText(line.medicationName),
            amount: line.amount,
            quantity: line.quantity,
            discount: line.discount,
            total: lineTotal(line),
            treatmentDate: toDate(invoiceDate),
            createdBy: session.user.id,
          })),
        );
        return {
          ok: true as const,
          id: invoice.id,
          action: "update" as const,
          oldPathname:
            invoice.prescriptionPathname &&
            (stored || removePrescription)
              ? invoice.prescriptionPathname
              : null,
        };
      }

      const [created] = await transaction
        .insert(treatmentInvoices)
        .values({
          residentNumber,
          residentId: residentId ?? null,
          residentName: normalizeText(residentName),
          invoiceDate,
          notes: normalizeText(notes),
          total,
          prescriptionPathname: stored?.pathname ?? null,
          prescriptionContentType: stored?.contentType ?? null,
          createdBy: session.user.id,
        })
        .returning({
          id: treatmentInvoices.id,
          invoiceNumber: treatmentInvoices.invoiceNumber,
        });
      if (!created) {
        return {
          ok: false as const,
          error: "تعذر إنشاء فاتورة العلاج.",
        };
      }
      await transaction.insert(legacyTreatmentDetails).values(
        lines.map((line) => ({
          invoiceId: created.id,
          residentNumber,
          medicationName: normalizeText(line.medicationName),
          amount: line.amount,
          quantity: line.quantity,
          discount: line.discount,
          total: lineTotal(line),
          treatmentDate: toDate(invoiceDate),
          createdBy: session.user.id,
        })),
      );
      return {
        ok: true as const,
        id: created.id,
        invoiceNumber: created.invoiceNumber,
        action: "create" as const,
        oldPathname: null,
      };
    });

    if (!result.ok) {
      if (stored) {
        await del(stored.pathname).catch((error) => {
          console.warn("Failed to delete unused treatment prescription.", error);
        });
      }
      return result;
    }

    if (result.oldPathname) {
      await del(result.oldPathname).catch((error) => {
        console.warn("Failed to delete replaced treatment prescription.", error);
      });
    }
    await recordAuditEvent({
      actorUserId: session.user.id,
      action: result.action,
      entity: "treatmentInvoices",
      entityId: result.id,
      metadata: {
        fields: "invoiceDate,notes,total,lines,prescription",
        ...(result.invoiceNumber !== undefined
          ? { invoiceNumber: String(result.invoiceNumber) }
          : {}),
      },
    });

    return {
      ok: true,
      bundle: await listTreatmentForCurrentUser(),
    };
  } catch (error) {
    if (stored) {
      await del(stored.pathname).catch((deleteError) => {
        console.warn(
          "Failed to roll back treatment prescription upload.",
          deleteError,
        );
      });
    }
    console.error("Failed to save treatment invoice.", error);
    return {
      ok: false,
      error: "تعذر حفظ فاتورة العلاج. تحقق من الاتصال ثم حاول مرة أخرى.",
    };
  }
}

export async function voidTreatmentInvoiceAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await requireStaffPermission("canAccessClinic");
  const parsed = voidInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "سبب الإلغاء مطلوب ويجب ألا يقل عن 3 أحرف.",
    };
  }
  if (!isDevelopmentDemoMode() && !uuidPattern.test(parsed.data.invoiceId)) {
    return { ok: false, error: "فاتورة العلاج غير صالحة." };
  }

  if (isDevelopmentDemoMode()) {
    const found = demoInvoiceEntries(parsed.data.invoiceId);
    if (!found) {
      return { ok: false, error: "فاتورة العلاج غير موجودة." };
    }
    if (found.entries.every((entry) => entry.voided)) {
      return { ok: false, error: "تم إلغاء فاتورة العلاج بالفعل." };
    }
    const activeTotal = found.entries
      .filter((entry) => !entry.voided)
      .reduce((sum, entry) => sum + entry.total, 0);
    const voidedAt = new Date().toISOString();
    for (const entry of found.entries) {
      entry.voided = true;
      entry.invoiceVoided = true;
      entry.voidReason = parsed.data.voidReason;
      entry.voidedAt = voidedAt;
    }
    if (found.record) {
      found.record.totalBilled = Math.max(
        0,
        found.record.totalBilled - activeTotal,
      );
    }
    return { ok: true, bundle: { ...demoTreatmentBundle } };
  }

  const result = await getDatabase().transaction(async (transaction) => {
    const [invoice] = await transaction
      .select({
        id: treatmentInvoices.id,
        voided: treatmentInvoices.voided,
      })
      .from(treatmentInvoices)
      .where(eq(treatmentInvoices.id, parsed.data.invoiceId))
      .limit(1)
      .for("update");
    if (!invoice) {
      return { ok: false as const, error: "فاتورة العلاج غير موجودة." };
    }
    if (invoice.voided) {
      return {
        ok: false as const,
        error: "تم إلغاء فاتورة العلاج بالفعل.",
      };
    }
    const voidedAt = new Date();
    await transaction
      .update(treatmentInvoices)
      .set({
        voided: true,
        voidReason: normalizeText(parsed.data.voidReason),
        voidedAt,
        voidedBy: session.user.id,
      })
      .where(eq(treatmentInvoices.id, invoice.id));
    await transaction
      .update(legacyTreatmentDetails)
      .set({
        voided: true,
        voidReason: normalizeText(parsed.data.voidReason),
        voidedAt,
        voidedBy: session.user.id,
      })
      .where(
        and(
          eq(legacyTreatmentDetails.invoiceId, invoice.id),
          eq(legacyTreatmentDetails.voided, false),
        ),
      );
    return { ok: true as const, id: invoice.id };
  });

  if (!result.ok) return result;
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "delete",
    entity: "treatmentInvoices",
    entityId: result.id,
    metadata: { fields: "voided,voidReason" },
  });
  return {
    ok: true,
    bundle: await listTreatmentForCurrentUser(),
  };
}

export async function editTreatmentEntryAction(input: unknown): Promise<ActionResult> {
  const session = await requireStaffPermission("canAccessClinic");
  const parsed = z.object({
    id: z.number().int().positive(),
    medicationName: z.string().trim().min(1).max(250),
    amount: z.number().finite().positive().max(1_000_000),
    quantity: z.number().finite().positive().max(10_000),
    discount: z.number().finite().nonnegative().max(1_000_000),
    treatmentDate: dateSchema,
  }).safeParse(input);
  if (!parsed.success || parsed.data.discount > parsed.data.amount * parsed.data.quantity) {
    return { ok: false, error: "راجع اسم الدواء والسعر والكمية والخصم والتاريخ." };
  }
  const total = lineTotal(parsed.data);
  if (isDevelopmentDemoMode()) {
    for (const record of demoTreatmentBundle.records) {
      const entry = record.entries.find((item) => item.id === parsed.data.id);
      if (!entry || entry.voided) continue;
      const oldTotal = entry.total;
      Object.assign(entry, { medicationName: normalizeText(parsed.data.medicationName), amount: parsed.data.amount, quantity: parsed.data.quantity, discount: parsed.data.discount, total, treatmentDate: parsed.data.treatmentDate });
      record.totalBilled += total - oldTotal;
      const invoiceLines = record.entries.filter((item) => item.invoiceId === entry.invoiceId && !item.voided);
      const invoiceTotal = invoiceLines.reduce((sum, item) => sum + item.total, 0);
      for (const line of invoiceLines) line.invoiceTotal = invoiceTotal;
      return { ok: true, bundle: { ...demoTreatmentBundle } };
    }
    return { ok: false, error: "قيد العلاج غير موجود أو ملغى." };
  }
  const updatedId = await getDatabase().transaction(async (transaction) => {
    const [existing] = await transaction.select().from(legacyTreatmentDetails).where(eq(legacyTreatmentDetails.id, parsed.data.id)).limit(1).for("update");
    if (!existing || existing.voided) return null;
    await transaction.update(legacyTreatmentDetails).set({ medicationName: normalizeText(parsed.data.medicationName), amount: parsed.data.amount, quantity: parsed.data.quantity, discount: parsed.data.discount, total, treatmentDate: toDate(parsed.data.treatmentDate) }).where(eq(legacyTreatmentDetails.id, existing.id));
    if (existing.invoiceId) {
      const lines = await transaction.select({ total: legacyTreatmentDetails.total }).from(legacyTreatmentDetails).where(and(eq(legacyTreatmentDetails.invoiceId, existing.invoiceId), eq(legacyTreatmentDetails.voided, false)));
      await transaction.update(treatmentInvoices).set({ total: lines.reduce((sum, line) => sum + (line.total ?? 0), 0) }).where(eq(treatmentInvoices.id, existing.invoiceId));
    }
    return existing.id;
  });
  if (!updatedId) return { ok: false, error: "قيد العلاج غير موجود أو ملغى." };
  await recordAuditEvent({ actorUserId: session.user.id, action: "update", entity: "legacyTreatmentDetails", entityId: updatedId, metadata: { fields: "medicationName,amount,quantity,discount,treatmentDate" } });
  return { ok: true, bundle: await listTreatmentForCurrentUser() };
}
