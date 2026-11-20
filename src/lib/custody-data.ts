import "server-only";

import { asc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  custodyDetails,
  custodyEvents,
  custodyHeaders,
  staffAccountLinks,
  staffEmployees,
} from "@/db/schema";
import { requireAnyScreenAccess, requireCurrentSession } from "@/lib/auth-session";
import type {
  CustodyBundle,
  CustodyDetail,
  CustodyEvent,
  CustodyRecord,
} from "@/lib/custody-types";

function dateValue(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export async function listCustodyDataForCurrentUser(): Promise<CustodyBundle> {
  const session = await requireCurrentSession();
  await requireAnyScreenAccess("custody", "tracking");
  const database = getDatabase();
  let linkedEmployeeNumber: number | null = null;
  if (session.user.role !== "admin" && session.user.role !== "viewer") {
    const [link] = await database
      .select({ employeeNumber: staffAccountLinks.employeeNumber })
      .from(staffAccountLinks)
      .where(eq(staffAccountLinks.userId, session.user.id))
      .limit(1);
    linkedEmployeeNumber = link?.employeeNumber ?? null;
  }

  const [employeeRows, headerRows] = await Promise.all([
    database
      .select({
        employeeNumber: staffEmployees.employeeNumber,
        employeeName: staffEmployees.employeeName,
      })
      .from(staffEmployees)
      .orderBy(staffEmployees.employeeName),
    // شاشة العهد تمنح عرض كل السجلات؛ صلاحية التعديل منفصلة.
    database
      .select()
      .from(custodyHeaders)
      .orderBy(asc(custodyHeaders.custodyNumber)),
  ]);

  const employeeNames = new Map(
    employeeRows.map((employee) => [
      employee.employeeNumber,
      employee.employeeName,
    ]),
  );
  const numbers = headerRows.map((header) => header.custodyNumber);

  const detailRows = numbers.length
    ? await database
        .select()
        .from(custodyDetails)
        .where(inArray(custodyDetails.custodyNumber, numbers))
        .orderBy(custodyDetails.webId)
    : [];
  const detailIds = detailRows.map((detail) => detail.webId);
  const eventRows = detailIds.length
    ? await database
        .select()
        .from(custodyEvents)
        .where(inArray(custodyEvents.detailId, detailIds))
        .orderBy(custodyEvents.eventDate, custodyEvents.createdAt)
    : [];

  const eventsByDetail = new Map<string, CustodyEvent[]>();
  for (const event of eventRows) {
    const events = eventsByDetail.get(event.detailId) ?? [];
    events.push({
      id: event.id,
      kind: event.kind,
      quantity: event.quantity,
      eventDate: dateValue(event.eventDate) ?? "",
      fromEmployeeNumber: event.fromEmployeeNumber,
      fromEmployeeName:
        event.fromEmployeeNumber === null
          ? null
          : (employeeNames.get(event.fromEmployeeNumber) ?? null),
      toEmployeeNumber: event.toEmployeeNumber,
      toEmployeeName:
        event.toEmployeeNumber === null
          ? null
          : (employeeNames.get(event.toEmployeeNumber) ?? null),
      reason: event.reason,
    });
    eventsByDetail.set(event.detailId, events);
  }

  const detailsByHeader = new Map<number, CustodyDetail[]>();
  for (const detail of detailRows) {
    const events = eventsByDetail.get(detail.webId) ?? [];
    const returnedQuantity = events.reduce(
      (total, event) =>
        total +
        (event.kind === "return" || event.kind === "void"
          ? event.quantity
          : 0),
      0,
    );
    const currentEmployeeNumber = detail.currentEmployeeNumber;
    const items = detailsByHeader.get(detail.custodyNumber) ?? [];
    items.push({
      id: detail.webId,
      itemName: detail.itemCategory,
      unit: detail.unit,
      notes: detail.notes,
      quantity: detail.quantity,
      issueDate: dateValue(detail.transactionDate) ?? "",
      currentEmployeeNumber,
      currentEmployeeName:
        currentEmployeeNumber === null
          ? null
          : (employeeNames.get(currentEmployeeNumber) ?? null),
      returnedQuantity,
      outstandingQuantity: Math.max(
        0,
        (detail.quantity ?? 0) - returnedQuantity,
      ),
      events,
    });
    detailsByHeader.set(detail.custodyNumber, items);
  }

  const records: CustodyRecord[] = headerRows.map((header) => ({
    custodyNumber: header.custodyNumber,
    custodyDate: dateValue(header.custodyDate) ?? "",
    recipientEmployeeNumber: header.recipientEmployeeNumber,
    recipientName: header.custody,
    voided: header.voided,
    voidReason: header.voidReason,
    details: detailsByHeader.get(header.custodyNumber) ?? [],
  }));

  return {
    employees: employeeRows,
    records,
    linkedEmployeeNumber,
  };
}
