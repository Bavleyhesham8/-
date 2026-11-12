import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { staffAccountLinks, staffAttendance, staffEmployees } from "@/db/schema";
import { requireScreenAccess } from "@/lib/auth-session";
import type {
  StaffAttendanceBundle,
  StaffAttendanceEntry,
} from "@/lib/staff-attendance-types";

export async function listStaffAttendanceForCurrentUser(): Promise<StaffAttendanceBundle> {
  const session = await requireScreenAccess("staff-attendance");
  const database = getDatabase();

  if (session.user.role === "admin" || session.user.role === "viewer") {
    const [employees, rows] = await Promise.all([
      database
        .select({
          employeeNumber: staffEmployees.employeeNumber,
          employeeName: staffEmployees.employeeName,
        })
        .from(staffEmployees)
        .orderBy(staffEmployees.employeeName),
      database
        .select({
          id: staffAttendance.id,
          employeeNumber: staffAttendance.employeeNumber,
          employeeName: staffEmployees.employeeName,
          clockInAt: staffAttendance.clockInAt,
          clockOutAt: staffAttendance.clockOutAt,
        })
        .from(staffAttendance)
        .innerJoin(
          staffEmployees,
          eq(staffEmployees.employeeNumber, staffAttendance.employeeNumber),
        )
        .orderBy(desc(staffAttendance.clockInAt))
        .limit(100),
    ]);

    return {
      employees,
      entries: rows.map(toEntry),
      linkedEmployeeNumber: null,
    };
  }

  const [link] = await database
    .select({ employeeNumber: staffAccountLinks.employeeNumber })
    .from(staffAccountLinks)
    .where(eq(staffAccountLinks.userId, session.user.id))
    .limit(1);

  if (!link) {
    return { entries: [], employees: [], linkedEmployeeNumber: null };
  }

  const rows = await database
    .select({
      id: staffAttendance.id,
      employeeNumber: staffAttendance.employeeNumber,
      employeeName: staffEmployees.employeeName,
      clockInAt: staffAttendance.clockInAt,
      clockOutAt: staffAttendance.clockOutAt,
    })
    .from(staffAttendance)
    .innerJoin(
      staffEmployees,
      eq(staffEmployees.employeeNumber, staffAttendance.employeeNumber),
    )
    .where(eq(staffAttendance.employeeNumber, link.employeeNumber))
    .orderBy(desc(staffAttendance.clockInAt))
    .limit(100);

  return {
    entries: rows.map(toEntry),
    employees: [],
    linkedEmployeeNumber: link.employeeNumber,
  };
}

function toEntry(
  row: {
    id: number;
    employeeNumber: number;
    employeeName: string;
    clockInAt: Date;
    clockOutAt: Date | null;
  },
): StaffAttendanceEntry {
  return {
    ...row,
    clockInAt: row.clockInAt.toISOString(),
    clockOutAt: row.clockOutAt?.toISOString() ?? null,
  };
}
