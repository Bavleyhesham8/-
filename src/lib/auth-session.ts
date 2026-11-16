import "server-only";

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import {
  hasStaffWritePermission,
  hasScreenAccess,
  type AccessRole,
  type DashboardScreen,
} from "@/lib/access-control";

function accessRole(role: string | null | undefined): AccessRole {
  return role === "admin" || role === "viewer" ? role : "staff";
}

export async function getCurrentSession() {
  try {
    return await getAuth().api.getSession({ headers: await headers() });
  } catch (error) {
    console.warn("Failed to get session, falling back to null:", error);
    return null;
  }
}

export async function requireCurrentSession() {
  const session = await getCurrentSession();
  if (!session) throw new Error("Authentication required.");
  return session;
}

export function getAuthorizationErrorStatus(error: unknown): 401 | 403 | null {
  if (!(error instanceof Error)) return null;
  if (error.message === "Authentication required.") return 401;
  if (
    error.message.startsWith("Screen access is required:") ||
    error.message.startsWith("One of these screens is required:") ||
    error.message.startsWith("Permission required:") ||
    error.message.startsWith("Permission and screen access required:") ||
    error.message === "Administrator access is required." ||
    error.message === "Resident editing permission is required."
  ) {
    return 403;
  }
  return null;
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
    !hasStaffWritePermission(
      accessRole(currentSession.user.role),
      currentSession.user.canEditResidents === true,
    )
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
  if (
    hasStaffWritePermission(
      accessRole(currentSession.user.role),
      currentSession.user[permission] === true,
    )
  ) {
    return currentSession;
  }
  throw new Error(`Permission required: ${permission}`);
}

export async function requireAnyStaffPermission(
  ...permissions: StaffPermission[]
) {
  const currentSession = await requireCurrentSession();
  const role = accessRole(currentSession.user.role);
  if (role === "admin") return currentSession;
  if (role !== "staff") {
    throw new Error(
      `Permission and screen access required: ${permissions.join(" or ")}`,
    );
  }
  const matchingPermissions = permissions.filter(
    (permission) => currentSession.user[permission] === true,
  );
  if (
    matchingPermissions.some((permission) =>
      hasScreenAccess(
        role,
        currentSession.user.allowedScreens,
        permissionScreens[permission],
      ),
    )
  ) {
    return currentSession;
  }
  throw new Error(`Permission and screen access required: ${permissions.join(" or ")}`);
}
