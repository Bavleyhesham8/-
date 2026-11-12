export const DASHBOARD_SCREENS = [
  "overview",
  "residents",
  "resident-reports",
  "resident-stay-reports",
  "resident-search",
  "rooms",
  "treatment",
  "canteen",
  "sales",
  "custody",
  "meat-sales",
  "inventory",
  "resident-finance",
  "canteen-reports",
  "invoice-reports",
  "tracking",
  "staff",
  "staff-attendance",
  "lookups",
  "access",
] as const;

export type DashboardScreen = (typeof DASHBOARD_SCREENS)[number];
export type AccessRole = "admin" | "staff" | "viewer";

export function hasStaffWritePermission(role: AccessRole, granted: boolean) {
  return role === "admin" || (role === "staff" && granted);
}

export function hasScreenAccess(
  role: AccessRole,
  allowedScreens: readonly string[] | string | null | undefined,
  screen: DashboardScreen,
) {
  if (role === "admin") return true;
  const screens =
    typeof allowedScreens === "string"
      ? allowedScreens.split(",").filter(Boolean)
      : allowedScreens ?? [];
  return screens.includes(screen);
}

export function firstAccessibleScreen(
  role: AccessRole,
  allowedScreens: readonly string[] | string | null | undefined,
  screens: readonly DashboardScreen[],
) {
  return screens.find((screen) =>
    hasScreenAccess(role, allowedScreens, screen),
  ) ?? null;
}

export function canViewResidentChurchData(
  role: AccessRole,
  allowedScreens: readonly string[] | string | null | undefined,
  canEditResidents: boolean,
) {
  return (
    role === "admin" ||
    (role === "viewer" &&
      ["residents", "resident-reports", "resident-search", "lookups"].some(
        (screen) => hasScreenAccess(role, allowedScreens, screen as DashboardScreen),
      )) ||
    (role === "staff" &&
      canEditResidents &&
      hasScreenAccess(role, allowedScreens, "residents"))
  );
}

export function canViewFullResidentProfile(
  role: AccessRole,
  allowedScreens: readonly string[] | string | null | undefined,
) {
  return (
    role === "admin" ||
    (role === "viewer" &&
      [
        "residents",
        "resident-reports",
        "resident-search",
        "resident-stay-reports",
        "rooms",
      ].some((screen) => hasScreenAccess(role, allowedScreens, screen as DashboardScreen)))
  );
}

export function canViewResidentBirthDate(role: AccessRole) {
  return role === "admin" || role === "viewer";
}
