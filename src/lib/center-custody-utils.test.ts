import assert from "node:assert/strict";
import test from "node:test";
import {
  CENTER_CUSTODY_TARGET,
  canCoverExpense,
  expenseAmount,
  recalculateCustodyRows,
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

test("recalculates the running balance after editing a custody movement", () => {
  const rows = [
    {
      id: "expense-2",
      kind: "expense" as const,
      transactionDate: "2026-11-03",
      amount: 500,
      balanceAfter: 0,
      targetBalance: 15000,
    },
    {
      id: "renewal-1",
      kind: "replenishment" as const,
      transactionDate: "2026-11-01",
      amount: 15000,
      balanceAfter: 0,
      targetBalance: 15000,
    },
    {
      id: "expense-1",
      kind: "expense" as const,
      transactionDate: "2026-11-02",
      amount: 300,
      balanceAfter: 0,
      targetBalance: 15000,
    },
  ];

  const result = recalculateCustodyRows(rows, 16000);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(
    result.rows.map((row) => row.id),
    ["renewal-1", "expense-1", "expense-2"],
  );
  assert.deepEqual(
    result.rows.map((row) => row.balanceAfter),
    [15000, 14700, 14200],
  );
  assert.equal(result.balance, 14200);
  assert.ok(result.rows.every((row) => row.targetBalance === 16000));
});

test("keeps same-day custody movements stable while recalculating", () => {
  const rows = [
    {
      id: "first",
      kind: "replenishment" as const,
      transactionDate: "2026-11-01",
      amount: 1000,
      balanceAfter: 0,
      targetBalance: 15000,
    },
    {
      id: "second",
      kind: "expense" as const,
      transactionDate: "2026-11-01",
      amount: 250,
      balanceAfter: 0,
      targetBalance: 15000,
    },
  ];

  const result = recalculateCustodyRows(rows);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.rows.map((row) => row.id),
    ["first", "second"],
  );
  assert.deepEqual(
    result.rows.map((row) => row.balanceAfter),
    [1000, 750],
  );
});

test("rejects an edit that makes any custody running balance negative", () => {
  const result = recalculateCustodyRows(
    [
      {
        id: "expense",
        kind: "expense" as const,
        transactionDate: "2026-11-01",
        amount: 500,
        balanceAfter: 0,
        targetBalance: 15000,
      },
      {
        id: "renewal",
        kind: "replenishment" as const,
        transactionDate: "2026-11-02",
        amount: 1000,
        balanceAfter: 0,
        targetBalance: 15000,
      },
    ],
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /سالب/);
});
