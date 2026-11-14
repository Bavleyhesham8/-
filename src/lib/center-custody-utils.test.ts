import assert from "node:assert/strict";
import test from "node:test";
import {
  CENTER_CUSTODY_TARGET,
  canCoverExpense,
  expenseAmount,
  remainingToTarget,
  renewalOutcome,
  suggestedRenewal,
} from "@/lib/center-custody-utils";

test("suggests the difference to reach the 15,000 target", () => {
  assert.equal(CENTER_CUSTODY_TARGET, 15000);
  assert.equal(remainingToTarget(15000, 15000), 0);
  assert.equal(remainingToTarget(2000, 15000), 13000);
  assert.equal(suggestedRenewal(2000, 15000), 13000);
  assert.equal(suggestedRenewal(16000, 15000), 0);
});

test("computes the expected balance and remaining amount before renewal", () => {
  assert.deepEqual(renewalOutcome(2000, 15000, 13000), {
    balanceAfter: 15000,
    remaining: 0,
    excess: 0,
  });

  assert.deepEqual(renewalOutcome(2000, 15000, 1000), {
    balanceAfter: 3000,
    remaining: 12000,
    excess: 0,
  });

  assert.deepEqual(renewalOutcome(2000, 15000, 14000), {
    balanceAfter: 16000,
    remaining: 0,
    excess: 1000,
  });
});

test("multiplies quantity by price and rounds money to two decimals", () => {
  assert.equal(expenseAmount(3, 12.5), 37.5);
  assert.equal(expenseAmount(1, 0.1), 0.1);
  assert.equal(expenseAmount(13, 1000), 13000);
});

test("prevents an expense above the available balance", () => {
  assert.equal(canCoverExpense(15000, 13000), true);
  assert.equal(canCoverExpense(15000, 15000), true);
  assert.equal(canCoverExpense(2000, 2000), true);
  assert.equal(canCoverExpense(2000, 2000.01), false);
  assert.equal(canCoverExpense(2000, 0), false);
});
