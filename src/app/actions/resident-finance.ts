"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  legacyResidentDetails,
  legacyResidentHeaders,
  residents,
  residentStays,
} from "@/db/schema";
import { requireAdministrator } from "@/lib/auth-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { listResidentFinanceForAdministrator } from "@/lib/resident-finance-data";
import type { ResidentFinanceBundle } from "@/lib/resident-finance-types";

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
const depositKindSchema = z.enum(["account", "stay"]);

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function numericResidentNumber(resident: {
  residentNumber: string;
  fileNumber: string;
}) {
  for (const value of [resident.residentNumber, resident.fileNumber]) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) continue;
    const number = Number(digits);
    if (
      Number.isInteger(number) &&
      number > 0 &&
      number <= 2_147_483_647
    ) {
      return number;
    }
  }
  return null;
}

type ActionResult =
  | { ok: true; bundle: ResidentFinanceBundle }
  | { ok: false; error: string };

export async function createResidentFinanceHeaderAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await requireAdministrator();
  const parsed = z
    .object({
      residentNumber: residentNumberSchema,
      residentName: z.string().trim().min(1).max(200),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل رقم النزيل واسمه بصورة صحيحة." };
  }

  const [created] = await getDatabase()
    .insert(legacyResidentHeaders)
    .values({
      residentNumber: parsed.data.residentNumber,
      residentName: parsed.data.residentName.normalize("NFC"),
      createdBy: session.user.id,
    })
    .onConflictDoNothing()
    .returning({ residentNumber: legacyResidentHeaders.residentNumber });
  if (!created) {
    return { ok: false, error: "رقم النزيل مسجل بالفعل." };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "create",
    entity: "legacyResidentHeaders",
    entityId: created.residentNumber,
    metadata: { fields: "residentNumber,residentName" },
  });

  return {
    ok: true,
    bundle: await listResidentFinanceForAdministrator(),
  };
}

export async function recordResidentReceiptAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await requireAdministrator();
  const parsed = z
    .object({
      residentId: z.string().uuid().optional(),
      residentNumber: residentNumberSchema.optional(),
      depositKind: depositKindSchema.default("account"),
      stayId: z.string().uuid().optional().nullable(),
      receiptNumber: z.string().trim().max(100).optional().nullable(),
      amount: z.number().finite().positive().max(1_000_000_000),
      transactionDate: dateSchema,
      returnDate: z.union([z.literal(""), dateSchema]).default(""),
    })
    .refine((value) => Boolean(value.residentId || value.residentNumber), {
      message: "A resident is required.",
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل النزيل والمبلغ وتاريخ الإيداع." };
  }
  if (
    parsed.data.depositKind === "stay" &&
    (!parsed.data.residentId || !parsed.data.stayId)
  ) {
    return {
      ok: false,
      error: "اختر النزيل والإقامة المرتبطة بإيداع الإقامة.",
    };
  }
  if (
    parsed.data.depositKind === "account" &&
    parsed.data.returnDate &&
    parsed.data.returnDate < parsed.data.transactionDate
  ) {
    return {
      ok: false,
      error: "تاريخ التسوية المتوقع لا يمكن أن يسبق تاريخ الإيصال.",
    };
  }

  const result = await getDatabase().transaction(async (transaction) => {
    let resident:
      | {
          id: string;
          name: string;
          residentNumber: string;
          fileNumber: string;
        }
      | null = null;
    if (parsed.data.residentId) {
      const [row] = await transaction
        .select({
          id: residents.id,
          name: residents.name,
          residentNumber: residents.residentNumber,
          fileNumber: residents.fileNumber,
        })
        .from(residents)
        .where(eq(residents.id, parsed.data.residentId))
        .limit(1);
      if (!row) {
        return { ok: false, error: "لم يتم العثور على النزيل." } as const;
      }
      resident = row;
    }

    let headerNumber: number | null = null;
    if (resident) {
      const [linked] = await transaction
        .select({ residentNumber: legacyResidentHeaders.residentNumber })
        .from(legacyResidentHeaders)
        .where(eq(legacyResidentHeaders.residentId, resident.id))
        .limit(1)
        .for("update");
      if (linked) headerNumber = linked.residentNumber;

      const candidate = numericResidentNumber(resident);
      if (headerNumber === null && candidate !== null) {
        const [byNumber] = await transaction
          .select({
            residentNumber: legacyResidentHeaders.residentNumber,
            residentId: legacyResidentHeaders.residentId,
          })
          .from(legacyResidentHeaders)
          .where(eq(legacyResidentHeaders.residentNumber, candidate))
          .limit(1)
          .for("update");
        if (byNumber) {
          if (byNumber.residentId === null) {
            await transaction
              .update(legacyResidentHeaders)
              .set({ residentId: resident.id, residentName: resident.name })
              .where(
                eq(
                  legacyResidentHeaders.residentNumber,
                  byNumber.residentNumber,
                ),
              );
            headerNumber = byNumber.residentNumber;
          } else if (byNumber.residentId === resident.id) {
            headerNumber = byNumber.residentNumber;
          }
        }
      }

      if (headerNumber === null) {
        const [maxRow] = await transaction
          .select({
            max: sql<number>`coalesce(max(${legacyResidentHeaders.residentNumber}), 0)`,
          })
          .from(legacyResidentHeaders);
        let nextNumber = Math.max(1, Number(maxRow?.max ?? 0) + 1);
        while (true) {
          const [conflict] = await transaction
            .select({
              residentNumber: legacyResidentHeaders.residentNumber,
            })
            .from(legacyResidentHeaders)
            .where(eq(legacyResidentHeaders.residentNumber, nextNumber))
            .limit(1);
          if (!conflict) break;
          nextNumber += 1;
        }
        await transaction.insert(legacyResidentHeaders).values({
          residentNumber: nextNumber,
          residentName: resident.name,
          residentId: resident.id,
          createdBy: session.user.id,
        });
        headerNumber = nextNumber;
      }
    } else {
      const [header] = await transaction
        .select({ residentNumber: legacyResidentHeaders.residentNumber })
        .from(legacyResidentHeaders)
        .where(
          eq(legacyResidentHeaders.residentNumber, parsed.data.residentNumber!),
        )
        .limit(1)
        .for("update");
      if (!header) {
        return {
          ok: false,
          error: "لم يتم العثور على حساب النزيل.",
        } as const;
      }
      headerNumber = header.residentNumber;
    }

    if (headerNumber === null) {
      return {
        ok: false,
        error: "تعذر تحديد حساب النزيل.",
      } as const;
    }

    if (parsed.data.depositKind === "stay") {
      if (!resident || !parsed.data.stayId) {
        return {
          ok: false,
          error: "اختر النزيل والإقامة المرتبطة بإيداع الإقامة.",
        } as const;
      }
      const [stay] = await transaction
        .select({ residentId: residentStays.residentId })
        .from(residentStays)
        .where(eq(residentStays.id, parsed.data.stayId))
        .limit(1);
      if (!stay || stay.residentId !== resident.id) {
        return {
          ok: false,
          error: "الإقامة المختارة لا تتبع هذا النزيل.",
        } as const;
      }
    }

    const [entry] = await transaction
      .insert(legacyResidentDetails)
      .values({
        residentNumber: headerNumber,
        depositKind: parsed.data.depositKind,
        stayId:
          parsed.data.depositKind === "stay" ? parsed.data.stayId : null,
        receiptNumber:
          parsed.data.depositKind === "stay"
            ? parsed.data.receiptNumber || null
            : null,
        amount: parsed.data.amount,
        transactionDate: toDate(parsed.data.transactionDate),
        returnDate:
          parsed.data.depositKind === "account" && parsed.data.returnDate
            ? toDate(parsed.data.returnDate)
            : null,
        createdBy: session.user.id,
      })
      .returning({ id: legacyResidentDetails.id });
    if (!entry) {
      return { ok: false, error: "تعذر تسجيل الإيصال." } as const;
    }
    return { ok: true, id: entry.id } as const;
  });
  if (!result.ok) return result;
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "create",
    entity: "legacyResidentDetails",
    entityId: result.id,
    metadata: {
      fields: "amount,transactionDate,returnDate,depositKind,stayId,receiptNumber",
      depositKind: parsed.data.depositKind,
      stayId: parsed.data.stayId ?? "",
    },
  });

  return {
    ok: true,
    bundle: await listResidentFinanceForAdministrator(),
  };
}

export async function editResidentReceiptAction(input: unknown): Promise<ActionResult> {
  const session = await requireAdministrator();
  const parsed = z.object({
    detailId: residentNumberSchema,
    amount: z.number().finite().positive().max(1_000_000_000),
    transactionDate: dateSchema,
    returnDate: z.union([z.literal(""), dateSchema]),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "أدخل مبلغًا موجبًا وتاريخي الإيصال والتسوية." };
  if (parsed.data.returnDate && parsed.data.returnDate < parsed.data.transactionDate) {
    return { ok: false, error: "تاريخ التسوية لا يمكن أن يسبق تاريخ الإيصال." };
  }

  const updated = await getDatabase().transaction(async (transaction) => {
    const [entry] = await transaction
      .select({
        id: legacyResidentDetails.id,
        voided: legacyResidentDetails.voided,
        depositKind: legacyResidentDetails.depositKind,
      })
      .from(legacyResidentDetails)
      .where(eq(legacyResidentDetails.id, parsed.data.detailId))
      .limit(1)
      .for("update");
    if (!entry || entry.voided) return false;
    const [row] = await transaction
      .update(legacyResidentDetails)
      .set({
        amount: parsed.data.amount,
        transactionDate: toDate(parsed.data.transactionDate),
        returnDate:
          entry.depositKind === "stay" || !parsed.data.returnDate
            ? null
            : toDate(parsed.data.returnDate),
      })
      .where(eq(legacyResidentDetails.id, entry.id))
      .returning({ id: legacyResidentDetails.id });
    return row ?? null;
  });
  if (!updated) return { ok: false, error: "الإيصال غير موجود أو ملغى." };
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "update",
    entity: "legacyResidentDetails",
    entityId: updated.id,
    metadata: { fields: "amount,transactionDate,returnDate" },
  });
  return { ok: true, bundle: await listResidentFinanceForAdministrator() };
}

export async function voidResidentReceiptAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await requireAdministrator();
  const parsed = z
    .object({
      detailId: residentNumberSchema,
      reason: z.string().trim().min(1).max(500),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل سببًا صحيحًا لإلغاء الإيصال." };
  }

  const result = await getDatabase().transaction(async (transaction) => {
    const [entry] = await transaction
      .select({
        id: legacyResidentDetails.id,
        voided: legacyResidentDetails.voided,
      })
      .from(legacyResidentDetails)
      .where(eq(legacyResidentDetails.id, parsed.data.detailId))
      .limit(1)
      .for("update");
    if (!entry) {
      return { ok: false, error: "لم يتم العثور على الإيصال." } as const;
    }
    if (entry.voided) {
      return { ok: false, error: "الإيصال ملغى بالفعل." } as const;
    }

    const [updated] = await transaction
      .update(legacyResidentDetails)
      .set({
        voided: true,
        voidReason: parsed.data.reason,
        voidedAt: new Date(),
        voidedBy: session.user.id,
      })
      .where(eq(legacyResidentDetails.id, entry.id))
      .returning({ id: legacyResidentDetails.id });
    if (!updated) {
      return { ok: false, error: "تعذر إلغاء الإيصال." } as const;
    }
    return { ok: true } as const;
  });
  if (!result.ok) return result;
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "delete",
    entity: "legacyResidentDetails",
    entityId: parsed.data.detailId,
    metadata: { fields: "voided,voidReason" },
  });

  return {
    ok: true,
    bundle: await listResidentFinanceForAdministrator(),
  };
}
