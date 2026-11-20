import "server-only";

import { asc, eq } from "drizzle-orm";
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

  // منح شاشة الحضور والانصراف يمنح عرض السجل الكامل لكل الأدوار،
  // بينما يظل تسجيل الحضور والانصراف مقصورًا على الموظف المرتبط بحساب الموظف.
  const [employees, rows, linkRows] = await Promise.all([
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
      .orderBy(asc(staffAttendance.clockInAt))
      .limit(100),
    session.user.role === "admin" || session.user.role === "viewer"
      ? Promise.resolve([])
      : database
          .select({ employeeNumber: staffAccountLinks.employeeNumber })
          .from(staffAccountLinks)
          .where(eq(staffAccountLinks.userId, session.user.id))
          .limit(1),
  ]);

  return {
    entries: rows.map(toEntry),
    employees,
    linkedEmployeeNumber: linkRows[0]?.employeeNumber ?? null,
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
