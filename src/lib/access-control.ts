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
  "gate",
  "lookups",
  "access",
] as const;

export type DashboardScreen = (typeof DASHBOARD_SCREENS)[number];
export type AccessRole = "admin" | "staff" | "viewer";

/**
 * كل صلاحية تشغيلية تحتاج شاشة معينة حتى تعمل فعليًا.
 * تُستخدم هذه الخريطة في واجهة إدارة الوصول والخادم معًا.
 */
export const PERMISSION_SCREENS = {
  canEditResidents: "residents",
  canAccessClinic: "treatment",
  canManageCanteen: "canteen",
  canIssueInvoices: "sales",
  canManageWarehouse: "inventory",
  canManageCustody: "custody",
  canManageMeatSales: "meat-sales",
  canManageGate: "gate",
} as const satisfies Record<string, DashboardScreen>;

export type OperationalPermission = keyof typeof PERMISSION_SCREENS;

/** يضيف الشاشات المطلوبة تلقائيًا لكل صلاحية مفعّلة. */
export function withRequiredScreens(
  allowedScreens: readonly string[],
  permissions: Partial<Record<OperationalPermission, boolean>>,
) {
  const screens = new Set(allowedScreens);
  for (const [permission, screen] of Object.entries(PERMISSION_SCREENS) as [
    OperationalPermission,
    DashboardScreen,
  ][]) {
    if (permissions[permission]) screens.add(screen);
  }
  return [...screens];
}

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

/**
 * قراءة بيانات النزلاء الحساسة مرتبطة بالشاشات المسموح بها فقط.
 * منح الشاشة يعني حق العرض، بينما تظل صلاحيات التعديل منفصلة.
 */
const RESIDENT_READ_SCREENS: DashboardScreen[] = [
  "residents",
  "resident-reports",
  "resident-search",
  "resident-stay-reports",
  "rooms",
];

export function canViewResidentChurchData(
  role: AccessRole,
  allowedScreens: readonly string[] | string | null | undefined,
) {
  return (
    role === "admin" ||
    [...RESIDENT_READ_SCREENS, "lookups" as DashboardScreen].some((screen) =>
      hasScreenAccess(role, allowedScreens, screen),
    )
  );
}

export function canViewFullResidentProfile(
  role: AccessRole,
  allowedScreens: readonly string[] | string | null | undefined,
) {
  return (
    role === "admin" ||
    RESIDENT_READ_SCREENS.some((screen) =>
      hasScreenAccess(role, allowedScreens, screen),
    )
  );
}

export function canViewResidentBirthDate(
  role: AccessRole,
  allowedScreens: readonly string[] | string | null | undefined,
) {
  return (
    role === "admin" ||
    hasScreenAccess(role, allowedScreens, "resident-stay-reports")
  );
}
