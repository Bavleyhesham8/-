import "server-only";

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import {
  hasScreenAccess,
  type DashboardScreen,
} from "@/lib/access-control";

export async function getCurrentSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

export async function requireCurrentSession() {
  const session = await getCurrentSession();
  if (!session) throw new Error("Authentication required.");
  return session;
}

export async function requireScreenAccess(screen: DashboardScreen) {
  const currentSession = await requireCurrentSession();
  if (
    !hasScreenAccess(
      currentSession.user.role === "admin" ||
        currentSession.user.role === "viewer"
        ? currentSession.user.role
        : "staff",
      currentSession.user.allowedScreens,
      screen,
    )
  ) {
    throw new Error(`Screen access is required: ${screen}`);
  }
  return currentSession;
}

export async function requireAnyScreenAccess(
  ...screens: DashboardScreen[]
) {
  const currentSession = await requireCurrentSession();
  const role =
    currentSession.user.role === "admin" ||
    currentSession.user.role === "viewer"
      ? currentSession.user.role
      : "staff";
  if (
    currentSession.user.role !== "admin" &&
    !screens.some((screen) =>
      hasScreenAccess(role, currentSession.user.allowedScreens, screen),
    )
  ) {
    throw new Error(`One of these screens is required: ${screens.join(", ")}`);
  }
  return currentSession;
}

export async function requireAdministrator() {
  const currentSession = await requireCurrentSession();
  if (currentSession.user.role !== "admin") {
    throw new Error("Administrator access is required.");
  }
  return currentSession;
}

export async function requireResidentEditor(screen: DashboardScreen = "residents") {
  const currentSession = await requireScreenAccess(screen);
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

const permissionScreens: Record<StaffPermission, DashboardScreen> = {
  canAccessClinic: "treatment",
  canManageCanteen: "canteen",
  canIssueInvoices: "sales",
  canManageWarehouse: "inventory",
  canManageCustody: "custody",
  canManageMeatSales: "meat-sales",
};

export async function requireStaffPermission(
  permission: StaffPermission,
  screen?: DashboardScreen,
) {
  const currentSession = await requireScreenAccess(
    screen ?? permissionScreens[permission],
  );
  if (currentSession.user.role === "admin") return currentSession;
  if (currentSession.user[permission] === true) return currentSession;
  throw new Error(`Permission required: ${permission}`);
}

export async function requireAnyStaffPermission(
  ...permissions: StaffPermission[]
) {
  const currentSession = await requireCurrentSession();
  if (currentSession.user.role === "admin") return currentSession;
  const matchingPermissions = permissions.filter(
    (permission) => currentSession.user[permission] === true,
  );
  if (
    matchingPermissions.some((permission) =>
      hasScreenAccess(
        currentSession.user.role === "viewer" ? "viewer" : "staff",
        currentSession.user.allowedScreens,
        permissionScreens[permission],
      ),
    )
  ) {
    return currentSession;
  }
  throw new Error(`Permission and screen access required: ${permissions.join(" or ")}`);
}
