"use server";

import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  custodyDetails,
  custodyEvents,
  custodyHeaders,
  staffEmployees,
} from "@/db/schema";
import { requireAnyStaffPermission } from "@/lib/auth-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { listCustodyDataForCurrentUser } from "@/lib/custody-data";
import type { CustodyBundle } from "@/lib/custody-types";

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
const positiveIntegerSchema = z.number().int().positive();
const quantitySchema = z.number().finite().positive().max(1_000_000_000);
const detailIdSchema = z.string().uuid();

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function outstandingQuantity(
  quantity: number | null,
  events: { kind: "return" | "transfer" | "void"; quantity: number }[],
) {
  return Math.max(
    0,
    (quantity ?? 0) -
      events.reduce(
        (total, event) =>
          total +
          (event.kind === "return" || event.kind === "void"
            ? event.quantity
            : 0),
        0,
      ),
  );
}

export async function createCustodyIssueAction(
  input: unknown,
): Promise<{ ok: true; bundle: CustodyBundle } | { ok: false; error: string }> {
  const session = await requireAnyStaffPermission(
    "canManageCustody",
    "canManageWarehouse",
  );
  const parsed = z
    .object({
      custodyDate: dateSchema,
      employeeNumber: positiveIntegerSchema,
      items: z
        .array(
          z.object({
            itemName: z.string().trim().min(1).max(255),
            unit: z.string().trim().max(80).default(""),
            quantity: quantitySchema,
            notes: z.string().trim().max(1000).default(""),
          }),
        )
        .min(1)
        .max(100),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع الموظف والتاريخ وبيانات البنود." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [employee] = await transaction
      .select({
        employeeNumber: staffEmployees.employeeNumber,
        employeeName: staffEmployees.employeeName,
      })
      .from(staffEmployees)
      .where(eq(staffEmployees.employeeNumber, parsed.data.employeeNumber))
      .limit(1)
      .for("update");
    if (!employee) {
      return { error: "اختر موظفًا مسجلًا في دليل الموظفين." } as const;
    }

    const [header] = await transaction
      .insert(custodyHeaders)
      .values({
        custodyDate: toDate(parsed.data.custodyDate),
        custody: employee.employeeName,
        recipientEmployeeNumber: employee.employeeNumber,
        createdBy: session.user.id,
      })
      .returning({ custodyNumber: custodyHeaders.custodyNumber });
    if (!header) throw new Error("تعذر إنشاء إيصال العهدة.");

    for (const line of parsed.data.items) {
      await transaction.insert(custodyDetails).values({
        itemCategory: line.itemName.normalize("NFC"),
        unit: line.unit.normalize("NFC"),
        quantity: line.quantity,
        notes: line.notes.normalize("NFC"),
        price: 0,
        total: 0,
        transactionDate: toDate(parsed.data.custodyDate),
        custodyNumber: header.custodyNumber,
        currentEmployeeNumber: employee.employeeNumber,
      });
    }
    return { custodyNumber: header.custodyNumber } as const;
  });

  if ("error" in result && result.error) {
    return { ok: false, error: result.error };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "create",
    entity: "custodyHeaders",
    entityId: result.custodyNumber,
    metadata: { fields: "custodyDate,recipientEmployeeNumber,items" },
  });
  return { ok: true, bundle: await listCustodyDataForCurrentUser() };
}

export async function returnCustodyItemAction(
  input: unknown,
): Promise<{ ok: true; bundle: CustodyBundle } | { ok: false; error: string }> {
  const session = await requireAnyStaffPermission(
    "canManageCustody",
    "canManageWarehouse",
  );
  const parsed = z
    .object({
      detailId: detailIdSchema,
      quantity: quantitySchema,
      eventDate: dateSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع كمية المرتجع وتاريخه." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [detailPreview] = await transaction
      .select({ custodyNumber: custodyDetails.custodyNumber })
      .from(custodyDetails)
      .where(eq(custodyDetails.webId, parsed.data.detailId))
      .limit(1);
    if (!detailPreview) {
      return { error: "لم يتم العثور على بند العهدة." } as const;
    }

    const [header] = await transaction
      .select({
        custodyNumber: custodyHeaders.custodyNumber,
        voided: custodyHeaders.voided,
      })
      .from(custodyHeaders)
      .where(eq(custodyHeaders.custodyNumber, detailPreview.custodyNumber))
      .limit(1)
      .for("update");
    const [detail] = await transaction
      .select()
      .from(custodyDetails)
      .where(eq(custodyDetails.webId, parsed.data.detailId))
      .limit(1)
      .for("update");
    if (!header || !detail) {
      return { error: "لم يتم العثور على سجل العهدة." } as const;
    }
    if (header.voided || detail.currentEmployeeNumber === null) {
      return { error: "لا يمكن استلام بند مغلق أو ملغى." } as const;
    }
    if (
      detail.transactionDate &&
      parsed.data.eventDate <
        detail.transactionDate.toISOString().slice(0, 10)
    ) {
      return { error: "تاريخ المرتجع لا يمكن أن يسبق تاريخ العهدة." } as const;
    }

    const events = await transaction
      .select({ kind: custodyEvents.kind, quantity: custodyEvents.quantity })
      .from(custodyEvents)
      .where(eq(custodyEvents.detailId, detail.webId));
    const outstanding = outstandingQuantity(detail.quantity, events);
    if (parsed.data.quantity > outstanding + 1e-9) {
      return {
        error: "كمية المرتجع أكبر من الكمية المتبقية في العهدة.",
      } as const;
    }

    await transaction.insert(custodyEvents).values({
      detailId: detail.webId,
      kind: "return",
      quantity: parsed.data.quantity,
      eventDate: toDate(parsed.data.eventDate),
      fromEmployeeNumber: detail.currentEmployeeNumber,
      createdBy: session.user.id,
    });
    if (Math.abs(parsed.data.quantity - outstanding) <= 1e-9) {
      await transaction
        .update(custodyDetails)
        .set({ currentEmployeeNumber: null })
        .where(eq(custodyDetails.webId, detail.webId));
    }

    return { ok: true } as const;
  });

  if ("error" in result && result.error) {
    return { ok: false, error: result.error };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "update",
    entity: "custodyDetails",
    entityId: parsed.data.detailId,
    metadata: { fields: "return" },
  });
  return { ok: true, bundle: await listCustodyDataForCurrentUser() };
}

export async function transferCustodyItemAction(
  input: unknown,
): Promise<{ ok: true; bundle: CustodyBundle } | { ok: false; error: string }> {
  const session = await requireAnyStaffPermission(
    "canManageCustody",
    "canManageWarehouse",
  );
  const parsed = z
    .object({
      detailId: detailIdSchema,
      employeeNumber: positiveIntegerSchema,
      eventDate: dateSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع الموظف الجديد وتاريخ النقل." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [detailPreview] = await transaction
      .select({ custodyNumber: custodyDetails.custodyNumber })
      .from(custodyDetails)
      .where(eq(custodyDetails.webId, parsed.data.detailId))
      .limit(1);
    if (!detailPreview) {
      return { error: "لم يتم العثور على بند العهدة." } as const;
    }

    const [header] = await transaction
      .select({
        custodyNumber: custodyHeaders.custodyNumber,
        voided: custodyHeaders.voided,
      })
      .from(custodyHeaders)
      .where(eq(custodyHeaders.custodyNumber, detailPreview.custodyNumber))
      .limit(1)
      .for("update");
    const [detail] = await transaction
      .select()
      .from(custodyDetails)
      .where(eq(custodyDetails.webId, parsed.data.detailId))
      .limit(1)
      .for("update");
    if (!header || !detail) {
      return { error: "لم يتم العثور على سجل العهدة." } as const;
    }
    if (header.voided || detail.currentEmployeeNumber === null) {
      return { error: "لا يمكن نقل بند مغلق أو ملغى." } as const;
    }
    if (
      detail.transactionDate &&
      parsed.data.eventDate <
        detail.transactionDate.toISOString().slice(0, 10)
    ) {
      return { error: "تاريخ النقل لا يمكن أن يسبق تاريخ العهدة." } as const;
    }

    const events = await transaction
      .select({ kind: custodyEvents.kind, quantity: custodyEvents.quantity })
      .from(custodyEvents)
      .where(eq(custodyEvents.detailId, detail.webId));
    const outstanding = outstandingQuantity(detail.quantity, events);
    if (outstanding <= 1e-9) {
      return { error: "لا توجد كمية متبقية لنقلها." } as const;
    }

    const [employee] = await transaction
      .select({ employeeNumber: staffEmployees.employeeNumber })
      .from(staffEmployees)
      .where(eq(staffEmployees.employeeNumber, parsed.data.employeeNumber))
      .limit(1)
      .for("update");
    if (!employee) {
      return { error: "اختر موظفًا مسجلًا في دليل الموظفين." } as const;
    }
    if (employee.employeeNumber === detail.currentEmployeeNumber) {
      return { error: "اختر موظفًا مختلفًا عن الموظف الحالي." } as const;
    }

    await transaction.insert(custodyEvents).values({
      detailId: detail.webId,
      kind: "transfer",
      quantity: outstanding,
      eventDate: toDate(parsed.data.eventDate),
      fromEmployeeNumber: detail.currentEmployeeNumber,
      toEmployeeNumber: employee.employeeNumber,
      createdBy: session.user.id,
    });
    await transaction
      .update(custodyDetails)
      .set({ currentEmployeeNumber: employee.employeeNumber })
      .where(eq(custodyDetails.webId, detail.webId));
    return { ok: true } as const;
  });

  if ("error" in result && result.error) {
    return { ok: false, error: result.error };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "update",
    entity: "custodyDetails",
    entityId: parsed.data.detailId,
    metadata: { fields: "currentEmployeeNumber" },
  });
  return { ok: true, bundle: await listCustodyDataForCurrentUser() };
}

export async function voidCustodyAction(
  input: unknown,
): Promise<{ ok: true; bundle: CustodyBundle } | { ok: false; error: string }> {
  const session = await requireAnyStaffPermission(
    "canManageCustody",
    "canManageWarehouse",
  );
  const parsed = z
    .object({
      custodyNumber: positiveIntegerSchema,
      reason: z.string().trim().min(1).max(500),
      eventDate: dateSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل سببًا وتاريخًا صحيحين لإلغاء العهدة." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [header] = await transaction
      .select()
      .from(custodyHeaders)
      .where(eq(custodyHeaders.custodyNumber, parsed.data.custodyNumber))
      .limit(1)
      .for("update");
    if (!header) return { error: "لم يتم العثور على سجل العهدة." } as const;
    if (header.voided) return { error: "سجل العهدة ملغى بالفعل." } as const;
    if (
      header.custodyDate &&
      parsed.data.eventDate <
        header.custodyDate.toISOString().slice(0, 10)
    ) {
      return { error: "تاريخ الإلغاء لا يمكن أن يسبق تاريخ العهدة." } as const;
    }

    const details = await transaction
      .select()
      .from(custodyDetails)
      .where(eq(custodyDetails.custodyNumber, header.custodyNumber))
      .orderBy(custodyDetails.webId)
      .for("update");
    if (
      details.some(
        (detail) =>
          detail.transactionDate &&
          parsed.data.eventDate <
            detail.transactionDate.toISOString().slice(0, 10),
      )
    ) {
      return {
        error: "تاريخ الإلغاء لا يمكن أن يسبق تاريخ أحد بنود العهدة.",
      } as const;
    }
    const detailIds = details.map((detail) => detail.webId);
    const events = detailIds.length
      ? await transaction
          .select({
            detailId: custodyEvents.detailId,
            kind: custodyEvents.kind,
            quantity: custodyEvents.quantity,
          })
          .from(custodyEvents)
          .where(inArray(custodyEvents.detailId, detailIds))
      : [];
    const eventsByDetail = new Map<
      string,
      { kind: "return" | "transfer" | "void"; quantity: number }[]
    >();
    for (const event of events) {
      const current = eventsByDetail.get(event.detailId) ?? [];
      current.push({ kind: event.kind, quantity: event.quantity });
      eventsByDetail.set(event.detailId, current);
    }
    const activeDetails = details
      .map((detail) => ({
        detail,
        outstanding: outstandingQuantity(
          detail.quantity,
          eventsByDetail.get(detail.webId) ?? [],
        ),
      }))
      .filter((entry) => entry.outstanding > 1e-9);

    for (const entry of activeDetails) {
      await transaction.insert(custodyEvents).values({
        detailId: entry.detail.webId,
        kind: "void",
        quantity: entry.outstanding,
        eventDate: toDate(parsed.data.eventDate),
        fromEmployeeNumber: entry.detail.currentEmployeeNumber,
        reason: parsed.data.reason,
        createdBy: session.user.id,
      });
      await transaction
        .update(custodyDetails)
        .set({ currentEmployeeNumber: null })
        .where(eq(custodyDetails.webId, entry.detail.webId));
    }

    await transaction
      .update(custodyHeaders)
      .set({
        voided: true,
        voidReason: parsed.data.reason,
        voidedAt: new Date(),
        voidedBy: session.user.id,
      })
      .where(eq(custodyHeaders.custodyNumber, header.custodyNumber));
    return { ok: true } as const;
  });

  if ("error" in result && result.error) {
    return { ok: false, error: result.error };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "delete",
    entity: "custodyHeaders",
    entityId: parsed.data.custodyNumber,
    metadata: { fields: "voided,voidReason" },
  });
  return { ok: true, bundle: await listCustodyDataForCurrentUser() };
}
