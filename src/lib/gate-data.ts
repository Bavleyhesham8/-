import "server-only";

import { count, desc, eq, max } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  gateVisitors,
  gateVisits,
  residents,
  staffEmployees,
} from "@/db/schema";
import { requireScreenAccess } from "@/lib/auth-session";
import type {
  GateBundle,
  GatePersonKind,
  GatePersonOption,
  GateVisit,
  GateVisitorProfile,
} from "@/lib/gate-types";

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function personKind(value: string): GatePersonKind {
  return value === "employee" || value === "visitor" ? value : "resident";
}

export async function listGateDataForCurrentUser(): Promise<GateBundle> {
  await requireScreenAccess("gate");
  const database = getDatabase();

  const [residentRows, employeeRows, visitorRows, visitRows] =
    await Promise.all([
      database
        .select({
          id: residents.id,
          name: residents.name,
          fileNumber: residents.fileNumber,
          nationalId: residents.nationalId,
          archived: residents.archived,
        })
        .from(residents)
        .where(eq(residents.archived, false))
        .orderBy(residents.name),
      database
        .select({
          employeeNumber: staffEmployees.employeeNumber,
          employeeName: staffEmployees.employeeName,
        })
        .from(staffEmployees)
        .orderBy(staffEmployees.employeeName),
      database
        .select({
          id: gateVisitors.id,
          name: gateVisitors.name,
          nationalId: gateVisitors.nationalId,
          phone: gateVisitors.phone,
          jobTitle: gateVisitors.jobTitle,
          carNumber: gateVisitors.carNumber,
          carType: gateVisitors.carType,
          notes: gateVisitors.notes,
          visitCount: count(gateVisits.id),
          lastVisitAt: max(gateVisits.entryAt),
        })
        .from(gateVisitors)
        .leftJoin(gateVisits, eq(gateVisits.visitorId, gateVisitors.id))
        .groupBy(gateVisitors.id)
        .orderBy(desc(gateVisitors.createdAt)),
      database
        .select({
          id: gateVisits.id,
          personKind: gateVisits.personKind,
          residentId: gateVisits.residentId,
          employeeNumber: gateVisits.employeeNumber,
          visitorId: gateVisits.visitorId,
          personName: gateVisits.personName,
          nationalId: gateVisits.nationalId,
          jobTitle: gateVisits.jobTitle,
          carNumber: gateVisits.carNumber,
          carType: gateVisits.carType,
          entryAt: gateVisits.entryAt,
          exitAt: gateVisits.exitAt,
          notes: gateVisits.notes,
          createdAt: gateVisits.createdAt,
        })
        .from(gateVisits)
        .orderBy(desc(gateVisits.entryAt))
        .limit(500),
    ]);

  const residentOptions: GatePersonOption[] = residentRows.map((resident) => ({
    kind: "resident",
    id: resident.id,
    name: resident.name,
    nationalId: resident.nationalId ?? "",
    jobTitle: "نزيل",
    meta: `نزيل · ملف ${resident.fileNumber}`,
  }));

  const employeeOptions: GatePersonOption[] = employeeRows.map((employee) => ({
    kind: "employee",
    id: String(employee.employeeNumber),
    name: employee.employeeName,
    nationalId: "",
    jobTitle: "موظف",
    meta: `موظف · رقم ${employee.employeeNumber}`,
  }));

  const visitors: GateVisitorProfile[] = visitorRows.map((visitor) => ({
    id: visitor.id,
    name: visitor.name,
    nationalId: visitor.nationalId,
    phone: visitor.phone,
    jobTitle: visitor.jobTitle,
    carNumber: visitor.carNumber,
    carType: visitor.carType,
    notes: visitor.notes,
    visitCount: Number(visitor.visitCount ?? 0),
    lastVisitAt: iso(visitor.lastVisitAt),
  }));

  const visits: GateVisit[] = visitRows.map((visit) => ({
    id: visit.id,
    personKind: personKind(visit.personKind),
    personId:
      visit.residentId ??
      (visit.employeeNumber === null ? null : String(visit.employeeNumber)) ??
      visit.visitorId,
    personName: visit.personName,
    nationalId: visit.nationalId,
    jobTitle: visit.jobTitle,
    carNumber: visit.carNumber,
    carType: visit.carType,
    entryAt: visit.entryAt.toISOString(),
    exitAt: iso(visit.exitAt),
    notes: visit.notes,
    createdAt: visit.createdAt.toISOString(),
  }));

  return {
    visits,
    visitors,
    residents: residentOptions,
    employees: employeeOptions,
  };
}
