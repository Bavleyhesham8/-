import "server-only";

import { desc, eq, ne } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  residents,
  residentStays,
  user,
  inventoryCategories,
  userInventoryCategories,
  userCanteenAccess,
} from "@/db/schema";
import { requireAdministrator, requireCurrentSession } from "@/lib/auth-session";
import type { DemoUser, Resident } from "@/lib/demo-data";

type ResidentBase = typeof residents.$inferSelect;
type ResidentStay = typeof residentStays.$inferSelect;

function toResident(
  row: ResidentBase,
  stay: ResidentStay | undefined,
  staffBasicOnly: boolean,
): Resident {
  const resident: Resident = {
    id: row.id,
    fileNumber: row.fileNumber,
    name: row.name,
    birthDate: staffBasicOnly ? "" : row.birthDate ?? "",
    phone: staffBasicOnly ? "" : row.phone,
    address: staffBasicOnly ? "" : row.address,
    district: staffBasicOnly ? "" : row.district,
    governorate: row.governorate ?? "",
    residentNumber: row.residentNumber ?? "",
    incompleteStay: row.incompleteStay ?? false,
    followUp: row.followUp ?? false,
    graduated: row.graduated ?? false,
    emergencyContact: staffBasicOnly ? "" : row.emergencyContact,
    emergencyPhone: staffBasicOnly ? "" : row.emergencyPhone,
    relationship: staffBasicOnly ? "" : row.relationship,
    church: row.church ?? "",
    confessor: row.confessor ?? "",
    admissionDate: stay?.admissionDate ?? "",
    exitDate: stay?.exitDate ?? "",
    villa: stay?.villa ?? "",
    room: stay?.room ?? "",
    status: stay?.exitDate ? "departed" : "current",
    archived: row.archived,
    nationalId: staffBasicOnly ? "" : row.nationalId ?? "",
    maritalStatus: staffBasicOnly ? "" : row.maritalStatus ?? "",
    qualification: staffBasicOnly ? "" : row.qualification ?? "",
    previousExperience: staffBasicOnly ? "" : row.previousExperience ?? "",
    previousWorkplaces: staffBasicOnly ? "" : row.previousWorkplaces ?? "",
    residentEntry: staffBasicOnly ? "" : row.residentEntry ?? "",
    relationshipDegree: staffBasicOnly ? "" : row.relationshipDegree ?? "",
    entryTime: staffBasicOnly ? "" : row.entryTime ?? "",
    exitMethod: staffBasicOnly ? "" : row.exitMethod ?? "",
    treatingDoctorNumber: staffBasicOnly ? "" : row.treatingDoctorNumber ?? "",
    treatingDoctorAddress: staffBasicOnly ? "" : row.treatingDoctorAddress ?? "",
    rehabilitationTeam: staffBasicOnly ? "" : row.rehabilitationTeam ?? "",
    rehabilitationStage: staffBasicOnly ? "" : row.rehabilitationStage ?? "",
    trainer: staffBasicOnly ? "" : row.trainer ?? "",
    supervisor: staffBasicOnly ? "" : row.supervisor ?? "",
    lecturer: staffBasicOnly ? "" : row.lecturer ?? "",
    imagePath: staffBasicOnly ? "" : row.imagePath ?? "",
  };
  return resident;
}

export async function listResidentsForCurrentUser() {
  const session = await requireCurrentSession();
  const staffBasicOnly = session.user.role !== "admin" && session.user.role !== "viewer";
  const database = getDatabase();
  const [residentRows, latestStays] = await Promise.all([
    database
      .select()
      .from(residents)
      .orderBy(desc(residents.createdAt), desc(residents.name)),
    database
      .selectDistinctOn([residentStays.residentId])
      .from(residentStays)
      .orderBy(
        residentStays.residentId,
        desc(residentStays.admissionDate),
        desc(residentStays.createdAt),
      ),
  ]);
  const staysByResident = new Map(
    latestStays.map((stay) => [stay.residentId, stay]),
  );

  return residentRows.map((resident) =>
    toResident(resident, staysByResident.get(resident.id), staffBasicOnly),
  );
}

export async function listStaffForAdministrator(): Promise<DemoUser[]> {
  await requireAdministrator();
  const database = getDatabase();
  const [staff, inventoryGrants, canteenGrants] = await Promise.all([
    database
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        canEdit: user.canEditResidents,
        canAccessClinic: user.canAccessClinic,
        canManageCanteen: user.canManageCanteen,
        canIssueInvoices: user.canIssueInvoices,
        canManageWarehouse: user.canManageWarehouse,
        canManageCustody: user.canManageCustody,
        canManageMeatSales: user.canManageMeatSales,
        allowedScreens: user.allowedScreens,
      })
      .from(user)
      .where(ne(user.role, "admin"))
      .orderBy(user.name),
    database
      .select({
        userId: userInventoryCategories.userId,
        categoryId: userInventoryCategories.categoryId,
      })
      .from(userInventoryCategories)
      .innerJoin(
        inventoryCategories,
        eq(userInventoryCategories.categoryId, inventoryCategories.id),
      )
      .where(eq(inventoryCategories.active, true)),
    database
      .select({ userId: userCanteenAccess.userId })
      .from(userCanteenAccess),
  ]);
  const categoryIdsByUser = new Map<string, string[]>();
  for (const grant of inventoryGrants) {
    const categoryIds = categoryIdsByUser.get(grant.userId) ?? [];
    categoryIds.push(grant.categoryId);
    categoryIdsByUser.set(grant.userId, categoryIds);
  }
  const canteenUserIds = new Set(canteenGrants.map((grant) => grant.userId));

  return staff.map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    role: (member.role === "admin" || member.role === "viewer" ? member.role : "staff") as "admin" | "staff" | "viewer",
    canEdit: member.canEdit,
    canAccessClinic: member.canAccessClinic,
    canManageCanteen: member.canManageCanteen,
    canIssueInvoices: member.canIssueInvoices,
    canManageWarehouse: member.canManageWarehouse,
    canManageCustody: member.canManageCustody,
    canManageMeatSales: member.canManageMeatSales,
    allowedScreens: member.allowedScreens ? member.allowedScreens.split(",").filter(Boolean) : [],
    inventoryCategoryIds: categoryIdsByUser.get(member.id) ?? [],
    canteenAccess: member.canManageCanteen || canteenUserIds.has(member.id),
  }));
}

export async function getResidentRecord(id: string) {
  const session = await requireCurrentSession();
  const staffBasicOnly = session.user.role !== "admin" && session.user.role !== "viewer";
  const database = getDatabase();
  const [resident] = await database
    .select()
    .from(residents)
    .where(eq(residents.id, id))
    .limit(1);
  if (!resident) return null;

  const [stay] = await database
    .select()
    .from(residentStays)
    .where(eq(residentStays.residentId, id))
    .orderBy(desc(residentStays.admissionDate), desc(residentStays.createdAt))
    .limit(1);

  return toResident(resident, stay, staffBasicOnly);
}
