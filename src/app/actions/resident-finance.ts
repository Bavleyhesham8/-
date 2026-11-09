"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  legacyResidentDetails,
  legacyResidentHeaders,
} from "@/db/schema";
import { requireAdministrator } from "@/lib/auth-session";
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

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
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
      residentNumber: residentNumberSchema,
      amount: z.number().finite().positive().max(1_000_000_000),
      transactionDate: dateSchema,
      returnDate: z.union([z.literal(""), dateSchema]),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل مبلغًا موجبًا وتاريخي الإيصال والتسوية." };
  }
  if (
    parsed.data.returnDate &&
    parsed.data.returnDate < parsed.data.transactionDate
  ) {
    return {
      ok: false,
      error: "تاريخ التسوية المتوقع لا يمكن أن يسبق تاريخ الإيصال.",
    };
  }

  const result = await getDatabase().transaction(async (transaction) => {
    const [header] = await transaction
      .select({
        residentNumber: legacyResidentHeaders.residentNumber,
      })
      .from(legacyResidentHeaders)
      .where(eq(legacyResidentHeaders.residentNumber, parsed.data.residentNumber))
      .limit(1)
      .for("update");
    if (!header) {
      return { ok: false, error: "لم يتم العثور على حساب النزيل." } as const;
    }

    const [entry] = await transaction
      .insert(legacyResidentDetails)
      .values({
        residentNumber: header.residentNumber,
        amount: parsed.data.amount,
        transactionDate: toDate(parsed.data.transactionDate),
        returnDate: parsed.data.returnDate
          ? toDate(parsed.data.returnDate)
          : null,
        createdBy: session.user.id,
      })
      .returning({ id: legacyResidentDetails.id });
    if (!entry) {
      return { ok: false, error: "تعذر تسجيل الإيصال." } as const;
    }
    return { ok: true } as const;
  });
  if (!result.ok) return result;

  return {
    ok: true,
    bundle: await listResidentFinanceForAdministrator(),
  };
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

  return {
    ok: true,
    bundle: await listResidentFinanceForAdministrator(),
  };
}
