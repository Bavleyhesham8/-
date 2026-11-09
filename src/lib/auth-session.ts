import "server-only";

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

export async function getCurrentSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

export async function requireCurrentSession() {
  const session = await getCurrentSession();
  if (!session) throw new Error("Authentication required.");
  return session;
}

export async function requireAdministrator() {
  const currentSession = await requireCurrentSession();
  if (currentSession.user.role !== "admin") {
    throw new Error("Administrator access is required.");
  }
  return currentSession;
}

export async function requireResidentEditor() {
  const currentSession = await requireCurrentSession();
  if (
    currentSession.user.role !== "admin" &&
    !currentSession.user.canEditResidents
  ) {
    throw new Error("Resident editing permission is required.");
  }
  return currentSession;
}

export type StaffPermission =
  | "canAccessClinic"
  | "canManageCanteen"
  | "canIssueInvoices"
  | "canManageWarehouse"
  | "canManageCustody"
  | "canManageMeatSales";

export async function requireStaffPermission(permission: StaffPermission) {
  const currentSession = await requireCurrentSession();
  if (currentSession.user.role === "admin") return currentSession;
  if (currentSession.user[permission] === true) return currentSession;
  throw new Error(`Permission required: ${permission}`);
}

export async function requireAnyStaffPermission(
  ...permissions: StaffPermission[]
) {
  const currentSession = await requireCurrentSession();
  if (currentSession.user.role === "admin") return currentSession;
  if (permissions.some((permission) => currentSession.user[permission] === true)) {
    return currentSession;
  }
  throw new Error(`Permission required: ${permissions.join(" or ")}`);
}
