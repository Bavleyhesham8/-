import assert from "node:assert/strict";
import test from "node:test";
import { DASHBOARD_SCREENS, hasScreenAccess } from "./access-control";

test("administrators can access every dashboard screen", () => {
  assert.equal(hasScreenAccess("admin", [], "access"), true);
});

test("staff access is limited to explicitly assigned screens", () => {
  assert.equal(hasScreenAccess("staff", ["residents"], "residents"), true);
  assert.equal(hasScreenAccess("staff", ["residents"], "rooms"), false);
  assert.equal(hasScreenAccess("staff", [], "overview"), false);
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
