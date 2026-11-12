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

test("church and profile data are visible only through assigned read screens or resident editing", () => {
  assert.equal(canViewResidentChurchData("admin", [], false), true);
  assert.equal(canViewResidentChurchData("staff", ["residents"], true), true);
  assert.equal(canViewResidentChurchData("staff", ["sales"], true), false);
  assert.equal(canViewResidentChurchData("staff", ["residents"], false), false);
  assert.equal(canViewResidentChurchData("viewer", ["residents"], false), true);
  assert.equal(canViewResidentChurchData("viewer", ["lookups"], false), true);
  assert.equal(canViewResidentChurchData("viewer", ["sales"], false), false);
  assert.equal(canViewFullResidentProfile("viewer", ["residents"]), true);
  assert.equal(canViewFullResidentProfile("viewer", ["sales"]), false);
});

test("birth dates are visible to read-only viewers with the assigned report screen", () => {
  assert.equal(canViewResidentBirthDate("admin"), true);
  assert.equal(canViewResidentBirthDate("staff"), false);
  assert.equal(canViewResidentBirthDate("viewer"), true);
});
