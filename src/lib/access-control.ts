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
  "lookups",
  "access",
] as const;

export type DashboardScreen = (typeof DASHBOARD_SCREENS)[number];
export type AccessRole = "admin" | "staff" | "viewer";

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
