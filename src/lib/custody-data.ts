import "server-only";

import { desc, eq, inArray, or } from "drizzle-orm";
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

const emptyBundle: CustodyBundle = {
  employees: [],
  records: [],
  linkedEmployeeNumber: null,
};

function dateValue(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export async function listCustodyDataForCurrentUser(): Promise<CustodyBundle> {
  const session = await requireCurrentSession();
  await requireAnyScreenAccess("custody", "tracking");
  const database = getDatabase();
  const isAdministrator =
    session.user.role === "admin" || session.user.role === "viewer";
  let linkedEmployeeNumber: number | null = null;

  if (!isAdministrator) {
    const [link] = await database
      .select({ employeeNumber: staffAccountLinks.employeeNumber })
      .from(staffAccountLinks)
      .where(eq(staffAccountLinks.userId, session.user.id))
      .limit(1);
    if (!link) return emptyBundle;
    linkedEmployeeNumber = link.employeeNumber;
  }

  const employeeRows = await database
    .select({
      employeeNumber: staffEmployees.employeeNumber,
      employeeName: staffEmployees.employeeName,
    })
    .from(staffEmployees)
    .orderBy(staffEmployees.employeeName);
  const allHeaders = isAdministrator
    ? await database
        .select()
        .from(custodyHeaders)
        .orderBy(desc(custodyHeaders.custodyNumber))
    : [];
  const initialHeaderNumbers = isAdministrator
    ? []
    : await database
        .select({ custodyNumber: custodyHeaders.custodyNumber })
        .from(custodyHeaders)
        .where(
          eq(custodyHeaders.recipientEmployeeNumber, linkedEmployeeNumber!),
        );
  const detailVisibility = isAdministrator
    ? []
    : await database
        .select({ detailId: custodyEvents.detailId })
        .from(custodyEvents)
        .where(
          or(
            eq(custodyEvents.fromEmployeeNumber, linkedEmployeeNumber!),
            eq(custodyEvents.toEmployeeNumber, linkedEmployeeNumber!),
          ),
        );

  const employeeNames = new Map(
    employeeRows.map((employee) => [
      employee.employeeNumber,
      employee.employeeName,
    ]),
  );
  const custodyNumbers = new Set<number>([
    ...allHeaders.map((header) => header.custodyNumber),
    ...initialHeaderNumbers.map((header) => header.custodyNumber),
  ]);

  if (!isAdministrator && detailVisibility.length) {
    const visibleDetails = await database
      .select({
        custodyNumber: custodyDetails.custodyNumber,
      })
      .from(custodyDetails)
      .where(
        inArray(
          custodyDetails.webId,
          detailVisibility.map((event) => event.detailId),
        ),
      );
    for (const detail of visibleDetails) {
      custodyNumbers.add(detail.custodyNumber);
    }
  }

  if (!isAdministrator && linkedEmployeeNumber !== null) {
    const currentDetails = await database
      .select({ custodyNumber: custodyDetails.custodyNumber })
      .from(custodyDetails)
      .where(
        eq(custodyDetails.currentEmployeeNumber, linkedEmployeeNumber),
      );
    for (const detail of currentDetails) {
      custodyNumbers.add(detail.custodyNumber);
    }
  }

  if (!custodyNumbers.size && !isAdministrator) {
    return {
      ...emptyBundle,
      linkedEmployeeNumber,
    };
  }

  const headerRows = isAdministrator
    ? allHeaders
    : await database
        .select()
        .from(custodyHeaders)
        .where(inArray(custodyHeaders.custodyNumber, [...custodyNumbers]))
        .orderBy(desc(custodyHeaders.custodyNumber));
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
    employees: isAdministrator ? employeeRows : [],
    records,
    linkedEmployeeNumber,
  };
}
