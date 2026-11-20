import assert from "node:assert/strict";
import test from "node:test";
import {
  canViewResidentBirthDate,
  canViewResidentChurchData,
  canViewFullResidentProfile,
  DASHBOARD_SCREENS,
  firstAccessibleScreen,
  hasScreenAccess,
  hasStaffWritePermission,
  PERMISSION_SCREENS,
  withRequiredScreens,
} from "./access-control";

test("viewer roles never receive staff write permissions", () => {
  assert.equal(hasStaffWritePermission("viewer", true), false);
  assert.equal(hasStaffWritePermission("staff", true), true);
  assert.equal(hasStaffWritePermission("staff", false), false);
  assert.equal(hasStaffWritePermission("admin", false), true);
});

test("administrators can access every dashboard screen", () => {
  assert.equal(hasScreenAccess("admin", [], "access"), true);
});

test("staff access is limited to explicitly assigned screens", () => {
  assert.equal(hasScreenAccess("staff", ["residents"], "residents"), true);
  assert.equal(hasScreenAccess("staff", ["residents"], "rooms"), false);
  assert.equal(
    hasScreenAccess("staff", ["staff-attendance"], "staff-attendance"),
    true,
  );
  assert.equal(hasScreenAccess("staff", [], "overview"), false);
});

test("the first accessible screen follows the supplied navigation order", () => {
  assert.equal(
    firstAccessibleScreen(
      "staff",
      ["resident-search", "rooms"],
      ["overview", "rooms", "resident-search"],
    ),
    "rooms",
  );
  assert.equal(firstAccessibleScreen("viewer", [], ["overview", "residents"]), null);
});

test("staff with every screen assigned can access the full dashboard", () => {
  for (const screen of DASHBOARD_SCREENS) {
    assert.equal(hasScreenAccess("staff", DASHBOARD_SCREENS, screen), true);
  }
});

test("viewers can access assigned screens but get no implicit defaults", () => {
  assert.equal(
    hasScreenAccess("viewer", "overview,resident-reports", "resident-reports"),
    true,
  );
  assert.equal(hasScreenAccess("viewer", "", "residents"), false);
});

test("church and profile data follow the assigned read screens for every role", () => {
  assert.equal(canViewResidentChurchData("admin", []), true);
  assert.equal(canViewResidentChurchData("staff", ["residents"]), true);
  assert.equal(canViewResidentChurchData("staff", ["sales"]), false);
  assert.equal(canViewResidentChurchData("staff", ["lookups"]), true);
  assert.equal(canViewResidentChurchData("viewer", ["residents"]), true);
  assert.equal(canViewResidentChurchData("viewer", ["lookups"]), true);
  assert.equal(canViewResidentChurchData("viewer", ["sales"]), false);
  assert.equal(canViewFullResidentProfile("staff", ["residents"]), true);
  assert.equal(canViewFullResidentProfile("viewer", ["residents"]), true);
  assert.equal(canViewFullResidentProfile("viewer", ["sales"]), false);
});

test("birth dates follow the assigned stay-report screen for every role", () => {
  assert.equal(canViewResidentBirthDate("admin", []), true);
  assert.equal(
    canViewResidentBirthDate("staff", ["resident-stay-reports"]),
    true,
  );
  assert.equal(canViewResidentBirthDate("staff", []), false);
  assert.equal(
    canViewResidentBirthDate("viewer", ["resident-stay-reports"]),
    true,
  );
});

test("operational permissions automatically add their required screens", () => {
  assert.equal(PERMISSION_SCREENS.canIssueInvoices, "sales");
  assert.equal(PERMISSION_SCREENS.canManageWarehouse, "inventory");
  assert.equal(PERMISSION_SCREENS.canManageCanteen, "canteen");

  assert.deepEqual(
    withRequiredScreens(["overview"], {
      canIssueInvoices: true,
      canManageWarehouse: true,
      canManageCustody: false,
    }).sort(),
    ["inventory", "overview", "sales"],
  );

  assert.deepEqual(
    withRequiredScreens(["sales"], { canIssueInvoices: true }),
    ["sales"],
  );
  assert.deepEqual(withRequiredScreens([], {}), []);
});

test("every operational permission maps to a real dashboard screen", () => {
  for (const screen of Object.values(PERMISSION_SCREENS)) {
    assert.ok(
      (DASHBOARD_SCREENS as readonly string[]).includes(screen),
      `${screen} must be a dashboard screen`,
    );
  }
});
