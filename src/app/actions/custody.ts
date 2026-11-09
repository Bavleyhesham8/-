"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  custodyDetails,
  custodyEvents,
  custodyHeaders,
  staffEmployees,
  warehouseCatalog,
  warehouseDetails,
  warehouseHeaders,
} from "@/db/schema";
import { requireAnyStaffPermission } from "@/lib/auth-session";
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
const itemNumberSchema = z.number().int().positive();
const quantitySchema = z.number().finite().positive().max(1_000_000_000);
const priceSchema = z.number().finite().min(0).max(1_000_000_000);
const detailIdSchema = z.string().uuid();

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function calculateBalances(
  movements: {
    number: number;
    incoming: number;
    outgoing: number;
  }[],
) {
  const balances = new Map<number, number>();
  for (const movement of movements) {
    balances.set(
      movement.number,
      (balances.get(movement.number) ?? 0) +
        movement.incoming -
        movement.outgoing,
    );
  }
  return balances;
}

function outstandingQuantity(
  quantity: number,
  events: { kind: "return" | "transfer" | "void"; quantity: number }[],
) {
  return Math.max(
    0,
    quantity -
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

export async function saveWarehouseCatalogItemAction(
  input: unknown,
): Promise<{ ok: true; bundle: CustodyBundle } | { ok: false; error: string }> {
  const session = await requireAnyStaffPermission("canManageCustody", "canManageWarehouse");
  const parsed = z
    .object({
      itemName: z.string().trim().min(1).max(160),
      price: priceSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل اسم الصنف وسعره بصورة صحيحة." };
  }

  const itemName = parsed.data.itemName.normalize("NFC");
  const responsible =
    session.user.name.trim().slice(0, 160) || session.user.email;
  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [catalogItem] = await transaction
      .insert(warehouseCatalog)
      .values({ itemName })
      .onConflictDoNothing()
      .returning({ id: warehouseCatalog.id });
    if (!catalogItem) {
      return { error: "اسم الصنف مسجل بالفعل في دليل المخزن." } as const;
    }

    const [header] = await transaction
      .insert(warehouseHeaders)
      .values({
        catalogId: catalogItem.id,
        itemName,
        price: parsed.data.price,
        responsible,
      })
      .returning({ number: warehouseHeaders.number });
    if (!header) throw new Error("تعذر إنشاء سجل صنف المخزن.");

    return { itemNumber: header.number } as const;
  });

  if ("error" in result && result.error) {
    return { ok: false, error: result.error };
  }
  return { ok: true, bundle: await listCustodyDataForCurrentUser() };
}

export async function updateWarehouseItemPriceAction(
  itemNumberInput: number,
  priceInput: number,
): Promise<{ ok: true; bundle: CustodyBundle } | { ok: false; error: string }> {
  await requireAnyStaffPermission("canManageCustody", "canManageWarehouse");
  const itemNumber = itemNumberSchema.safeParse(itemNumberInput);
  const price = priceSchema.safeParse(priceInput);
  if (!itemNumber.success || !price.success) {
    return { ok: false, error: "أدخل سعرًا صحيحًا للصنف." };
  }

  const updated = await getDatabase().transaction(async (transaction) => {
    const [item] = await transaction
      .select({ number: warehouseHeaders.number })
      .from(warehouseHeaders)
      .where(eq(warehouseHeaders.number, itemNumber.data))
      .limit(1)
      .for("update");
    if (!item) return false;

    await transaction
      .update(warehouseHeaders)
      .set({ price: price.data })
      .where(eq(warehouseHeaders.number, item.number));
    return true;
  });

  return updated
    ? { ok: true, bundle: await listCustodyDataForCurrentUser() }
    : { ok: false, error: "لم يتم العثور على صنف المخزن." };
}

export async function recordWarehouseReceiptAction(
  input: unknown,
): Promise<{ ok: true; bundle: CustodyBundle } | { ok: false; error: string }> {
  const session = await requireAnyStaffPermission("canManageCustody", "canManageWarehouse");
  const parsed = z
    .object({
      itemNumber: itemNumberSchema,
      quantity: quantitySchema,
      receivedDate: dateSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع صنف المخزن والكمية وتاريخ الاستلام." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [item] = await transaction
      .select({ number: warehouseHeaders.number })
      .from(warehouseHeaders)
      .where(eq(warehouseHeaders.number, parsed.data.itemNumber))
      .limit(1)
      .for("update");
    if (!item) return { error: "لم يتم العثور على صنف المخزن." } as const;

    const previousMovements = await transaction
      .select({
        number: warehouseDetails.number,
        incoming: warehouseDetails.incoming,
        outgoing: warehouseDetails.outgoing,
      })
      .from(warehouseDetails)
      .where(
        and(
          eq(warehouseDetails.number, item.number),
          eq(warehouseDetails.deleted, false),
        ),
      );
    const balance = calculateBalances(previousMovements).get(item.number) ?? 0;
    await transaction.insert(warehouseDetails).values({
      number: item.number,
      balance,
      incoming: parsed.data.quantity,
      incomingDate: toDate(parsed.data.receivedDate),
      outgoing: 0,
      outgoingDate: null,
      remaining: balance + parsed.data.quantity,
      deleted: false,
      movementKind: "receipt",
      createdBy: session.user.id,
    });
    return { ok: true } as const;
  });

  if ("error" in result && result.error) {
    return { ok: false, error: result.error };
  }
  return { ok: true, bundle: await listCustodyDataForCurrentUser() };
}

export async function createCustodyIssueAction(
  input: unknown,
): Promise<{ ok: true; bundle: CustodyBundle } | { ok: false; error: string }> {
  const session = await requireAnyStaffPermission("canManageCustody", "canManageWarehouse");
  const parsed = z
    .object({
      custodyDate: dateSchema,
      employeeNumber: itemNumberSchema,
      items: z
        .array(
          z.object({
            itemNumber: itemNumberSchema,
            quantity: quantitySchema,
            price: priceSchema,
          }),
        )
        .min(1)
        .max(100),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع الموظف وتاريخ العهدة وبنودها." };
  }

  const total = parsed.data.items.reduce(
    (sum, line) => sum + line.quantity * line.price,
    0,
  );
  if (!Number.isFinite(total)) {
    return { ok: false, error: "إجمالي العهدة يتجاوز القيمة المسموحة." };
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

    const itemNumbers = [
      ...new Set(parsed.data.items.map((line) => line.itemNumber)),
    ].sort((a, b) => a - b);
    const warehouseItems = await transaction
      .select({
        number: warehouseHeaders.number,
        itemName: warehouseHeaders.itemName,
        price: warehouseHeaders.price,
      })
      .from(warehouseHeaders)
      .where(inArray(warehouseHeaders.number, itemNumbers))
      .orderBy(warehouseHeaders.number)
      .for("update");
    if (warehouseItems.length !== itemNumbers.length) {
      return { error: "لم يتم العثور على أحد أصناف المخزن." } as const;
    }

    const movementRows = await transaction
      .select({
        number: warehouseDetails.number,
        incoming: warehouseDetails.incoming,
        outgoing: warehouseDetails.outgoing,
      })
      .from(warehouseDetails)
      .where(
        and(
          inArray(warehouseDetails.number, itemNumbers),
          eq(warehouseDetails.deleted, false),
        ),
      );
    const balances = calculateBalances(movementRows);
    const requested = new Map<number, number>();
    for (const line of parsed.data.items) {
      requested.set(
        line.itemNumber,
        (requested.get(line.itemNumber) ?? 0) + line.quantity,
      );
    }
    for (const [number, quantity] of requested) {
      const available = balances.get(number) ?? 0;
      if (quantity > available + 1e-9) {
        const itemName =
          warehouseItems.find((item) => item.number === number)?.itemName ??
          String(number);
        return {
          error: `الرصيد المتاح غير كافٍ للصنف ${itemName}.`,
        } as const;
      }
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
    if (!header) throw new Error("تعذر إنشاء سجل العهدة.");

    for (const line of parsed.data.items) {
      const item = warehouseItems.find(
        (candidate) => candidate.number === line.itemNumber,
      );
      if (!item) throw new Error("تعذر العثور على صنف العهدة.");

      const balance = balances.get(item.number) ?? 0;
      const remaining = balance - line.quantity;
      const total = line.quantity * line.price;
      const [detail] = await transaction
        .insert(custodyDetails)
        .values({
          itemCategory: item.itemName,
          quantity: line.quantity,
          price: line.price,
          total,
          transactionDate: toDate(parsed.data.custodyDate),
          custodyNumber: header.custodyNumber,
          warehouseNumber: item.number,
          currentEmployeeNumber: employee.employeeNumber,
        })
        .returning({ webId: custodyDetails.webId });
      if (!detail) throw new Error("تعذر حفظ أحد بنود العهدة.");

      await transaction.insert(warehouseDetails).values({
        number: item.number,
        balance,
        incoming: 0,
        incomingDate: null,
        outgoing: line.quantity,
        outgoingDate: toDate(parsed.data.custodyDate),
        remaining,
        deleted: false,
        movementKind: "custody_issue",
        custodyDetailId: detail.webId,
        createdBy: session.user.id,
      });
      balances.set(item.number, remaining);
    }

    return { ok: true } as const;
  });

  if ("error" in result && result.error) {
    return { ok: false, error: result.error };
  }
  return { ok: true, bundle: await listCustodyDataForCurrentUser() };
}

export async function returnCustodyItemAction(
  input: unknown,
): Promise<{ ok: true; bundle: CustodyBundle } | { ok: false; error: string }> {
  const session = await requireAnyStaffPermission("canManageCustody", "canManageWarehouse");
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
    if (!detailPreview) return { error: "لم يتم العثور على بند العهدة." } as const;

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
    if (parsed.data.eventDate < detail.transactionDate.toISOString().slice(0, 10)) {
      return { error: "تاريخ المرتجع لا يمكن أن يسبق تاريخ العهدة." } as const;
    }

    const events = await transaction
      .select({ kind: custodyEvents.kind, quantity: custodyEvents.quantity })
      .from(custodyEvents)
      .where(eq(custodyEvents.detailId, detail.webId));
    const outstanding = outstandingQuantity(detail.quantity, events);
    if (parsed.data.quantity > outstanding + 1e-9) {
      return { error: "كمية المرتجع أكبر من الكمية المتبقية في العهدة." } as const;
    }

    const [warehouseItem] = await transaction
      .select({ number: warehouseHeaders.number })
      .from(warehouseHeaders)
      .where(eq(warehouseHeaders.number, detail.warehouseNumber))
      .limit(1)
      .for("update");
    if (!warehouseItem) {
      return { error: "تعذر العثور على صنف المخزن المرتبط بالعهدة." } as const;
    }

    const previousMovements = await transaction
      .select({
        number: warehouseDetails.number,
        incoming: warehouseDetails.incoming,
        outgoing: warehouseDetails.outgoing,
      })
      .from(warehouseDetails)
      .where(
        and(
          eq(warehouseDetails.number, warehouseItem.number),
          eq(warehouseDetails.deleted, false),
        ),
      );
    const balance =
      calculateBalances(previousMovements).get(warehouseItem.number) ?? 0;
    const [movement] = await transaction
      .insert(warehouseDetails)
      .values({
        number: warehouseItem.number,
        balance,
        incoming: parsed.data.quantity,
        incomingDate: toDate(parsed.data.eventDate),
        outgoing: 0,
        outgoingDate: null,
        remaining: balance + parsed.data.quantity,
        deleted: false,
        movementKind: "custody_return",
        custodyDetailId: detail.webId,
        createdBy: session.user.id,
      })
      .returning({ id: warehouseDetails.id });
    if (!movement) throw new Error("تعذر تسجيل وارد المرتجع للمخزن.");

    await transaction.insert(custodyEvents).values({
      detailId: detail.webId,
      kind: "return",
      quantity: parsed.data.quantity,
      eventDate: toDate(parsed.data.eventDate),
      fromEmployeeNumber: detail.currentEmployeeNumber,
      warehouseMovementId: movement.id,
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
  return { ok: true, bundle: await listCustodyDataForCurrentUser() };
}

export async function transferCustodyItemAction(
  input: unknown,
): Promise<{ ok: true; bundle: CustodyBundle } | { ok: false; error: string }> {
  const session = await requireAnyStaffPermission("canManageCustody", "canManageWarehouse");
  const parsed = z
    .object({
      detailId: detailIdSchema,
      employeeNumber: itemNumberSchema,
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
    if (!detailPreview) return { error: "لم يتم العثور على بند العهدة." } as const;

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
    if (parsed.data.eventDate < detail.transactionDate.toISOString().slice(0, 10)) {
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
  return { ok: true, bundle: await listCustodyDataForCurrentUser() };
}

export async function voidCustodyAction(
  input: unknown,
): Promise<{ ok: true; bundle: CustodyBundle } | { ok: false; error: string }> {
  const session = await requireAnyStaffPermission("canManageCustody", "canManageWarehouse");
  const parsed = z
    .object({
      custodyNumber: itemNumberSchema,
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
    if (parsed.data.eventDate < header.custodyDate.toISOString().slice(0, 10)) {
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
          parsed.data.eventDate < detail.transactionDate.toISOString().slice(0, 10),
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
    const itemNumbers = [
      ...new Set(activeDetails.map((entry) => entry.detail.warehouseNumber)),
    ].sort((a, b) => a - b);
    const warehouseItems = itemNumbers.length
      ? await transaction
          .select({ number: warehouseHeaders.number })
          .from(warehouseHeaders)
          .where(inArray(warehouseHeaders.number, itemNumbers))
          .orderBy(warehouseHeaders.number)
          .for("update")
      : [];
    if (warehouseItems.length !== itemNumbers.length) {
      return {
        error: "تعذر العثور على صنف مخزن مرتبط بأحد بنود العهدة.",
      } as const;
    }

    const stockRows = itemNumbers.length
      ? await transaction
          .select({
            number: warehouseDetails.number,
            incoming: warehouseDetails.incoming,
            outgoing: warehouseDetails.outgoing,
          })
          .from(warehouseDetails)
          .where(
            and(
              inArray(warehouseDetails.number, itemNumbers),
              eq(warehouseDetails.deleted, false),
            ),
          )
      : [];
    const balances = calculateBalances(stockRows);
    for (const entry of activeDetails) {
      const number = entry.detail.warehouseNumber;
      const balance = balances.get(number) ?? 0;
      const [movement] = await transaction
        .insert(warehouseDetails)
        .values({
          number,
          balance,
          incoming: entry.outstanding,
          incomingDate: toDate(parsed.data.eventDate),
          outgoing: 0,
          outgoingDate: null,
          remaining: balance + entry.outstanding,
          deleted: false,
          movementKind: "custody_void",
          custodyDetailId: entry.detail.webId,
          createdBy: session.user.id,
        })
        .returning({ id: warehouseDetails.id });
      if (!movement) throw new Error("تعذر إعادة بند ملغى إلى المخزن.");

      await transaction.insert(custodyEvents).values({
        detailId: entry.detail.webId,
        kind: "void",
        quantity: entry.outstanding,
        eventDate: toDate(parsed.data.eventDate),
        fromEmployeeNumber: entry.detail.currentEmployeeNumber,
        reason: parsed.data.reason,
        warehouseMovementId: movement.id,
        createdBy: session.user.id,
      });
      await transaction
        .update(custodyDetails)
        .set({ currentEmployeeNumber: null })
        .where(eq(custodyDetails.webId, entry.detail.webId));
      balances.set(number, balance + entry.outstanding);
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
  return { ok: true, bundle: await listCustodyDataForCurrentUser() };
}
