import "server-only";

import { desc, eq, ne } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  staffAccountLinks,
  staffEmployees,
  staffLeaveEntries,
  staffProfiles,
  user,
} from "@/db/schema";
import { requireCurrentSession } from "@/lib/auth-session";
import type {
  StaffAccountLink,
  StaffBundle,
  StaffProfile,
} from "@/lib/staff-types";

type ProfileRow = typeof staffProfiles.$inferSelect;

export function toStaffProfile(row: ProfileRow): StaffProfile {
  return {
    profileNumber: row.profileNumber,
    employeeId: row.employeeId ?? "",
    firstName: row.firstName ?? "",
    thirdName: row.thirdName ?? "",
    nationalId: row.nationalId ?? "",
    address: row.address ?? "",
    governorate: row.governorate ?? "",
    district: row.district ?? "",
    birthDate: row.birthDate ?? "",
    maritalStatus: row.maritalStatus ?? "",
    qualification: row.qualification ?? "",
    employmentStartDate: row.employmentStartDate ?? "",
    mobile: row.mobile ?? "",
    church: row.church ?? "",
    confessor: row.confessor ?? "",
    confessorPhone: row.confessorPhone ?? "",
    denomination: row.denomination ?? "",
    previousWorkplaces: row.previousWorkplaces ?? "",
    computerPrograms: row.computerPrograms ?? "",
    jobSpecialty: row.jobSpecialty ?? "",
    employmentOffice: row.employmentOffice ?? "",
    photo: row.photo ?? "",
    notes: row.notes ?? "",
    imagePath: row.imagePath ?? "",
  };
}

const emptyBundle: StaffBundle = {
  profiles: [],
  employees: [],
  leaveEntries: [],
  accountOptions: [],
  accountLinks: [],
};

export async function listStaffDataForCurrentUser(): Promise<StaffBundle> {
  const session = await requireCurrentSession();
  const database = getDatabase();

  if (session.user.role === "admin") {
    const [profiles, employees, leaveRows, accounts, links] = await Promise.all(
      [
        database.select().from(staffProfiles).orderBy(staffProfiles.firstName),
        database
          .select()
          .from(staffEmployees)
          .orderBy(staffEmployees.employeeName),
        database
          .select({
            id: staffLeaveEntries.id,
            leaveDate: staffLeaveEntries.leaveDate,
            returnDate: staffLeaveEntries.returnDate,
            leaveType: staffLeaveEntries.leaveType,
            notes: staffLeaveEntries.notes,
            employeeNumber: staffLeaveEntries.employeeNumber,
            employeeName: staffEmployees.employeeName,
          })
          .from(staffLeaveEntries)
          .innerJoin(
            staffEmployees,
            eq(staffLeaveEntries.employeeNumber, staffEmployees.employeeNumber),
          )
          .orderBy(desc(staffLeaveEntries.leaveDate)),
        database
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(ne(user.role, "admin"))
          .orderBy(user.name),
        database
          .select({
            userId: staffAccountLinks.userId,
            profileNumber: staffAccountLinks.profileNumber,
            employeeNumber: staffAccountLinks.employeeNumber,
          })
          .from(staffAccountLinks),
      ],
    );

    return {
      profiles: profiles.map(toStaffProfile),
      employees: employees.map((employee) => ({
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        employeeName: employee.employeeName,
      })),
      leaveEntries: leaveRows.map((entry) => ({
        ...entry,
        notes: entry.notes ?? "",
      })),
      accountOptions: accounts,
      accountLinks: links satisfies StaffAccountLink[],
    };
  }

  const [link] = await database
    .select({
      userId: staffAccountLinks.userId,
      profileNumber: staffAccountLinks.profileNumber,
      employeeNumber: staffAccountLinks.employeeNumber,
    })
    .from(staffAccountLinks)
    .where(eq(staffAccountLinks.userId, session.user.id))
    .limit(1);
  if (!link) return emptyBundle;

  const [profileRows, employeeRows, leaveRows] = await Promise.all([
    database
      .select()
      .from(staffProfiles)
      .where(eq(staffProfiles.profileNumber, link.profileNumber))
      .limit(1),
    database
      .select()
      .from(staffEmployees)
      .where(eq(staffEmployees.employeeNumber, link.employeeNumber))
      .limit(1),
    database
      .select({
        id: staffLeaveEntries.id,
        leaveDate: staffLeaveEntries.leaveDate,
        returnDate: staffLeaveEntries.returnDate,
        leaveType: staffLeaveEntries.leaveType,
        notes: staffLeaveEntries.notes,
        employeeNumber: staffLeaveEntries.employeeNumber,
        employeeName: staffEmployees.employeeName,
      })
      .from(staffLeaveEntries)
      .innerJoin(
        staffEmployees,
        eq(staffLeaveEntries.employeeNumber, staffEmployees.employeeNumber),
      )
      .where(eq(staffLeaveEntries.employeeNumber, link.employeeNumber))
      .orderBy(desc(staffLeaveEntries.leaveDate)),
  ]);
  const profile = profileRows[0];
  if (!profile) return emptyBundle;

  return {
    profiles: [toStaffProfile(profile)],
    employees: employeeRows.map((employee) => ({
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: employee.employeeName,
    })),
    leaveEntries: leaveRows.map((entry) => ({
      ...entry,
      notes: entry.notes ?? "",
    })),
    accountOptions: [],
    accountLinks: [link],
  };
}
