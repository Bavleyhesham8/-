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

test("recalculates the running balance in creation order after an edit", () => {
  const rows = [
    {
      id: "expense-2",
      kind: "expense" as const,
      transactionDate: "2026-11-03",
      amount: 500,
      balanceAfter: 0,
      targetBalance: 15000,
      createdAt: "2026-11-15T09:00:00Z",
    },
    {
      id: "renewal-1",
      kind: "replenishment" as const,
      transactionDate: "2026-11-01",
      amount: 15000,
      balanceAfter: 0,
      targetBalance: 15000,
      createdAt: "2026-11-13T09:00:00Z",
    },
    {
      id: "expense-1",
      kind: "expense" as const,
      transactionDate: "2026-11-02",
      amount: 300,
      balanceAfter: 0,
      targetBalance: 15000,
      createdAt: "2026-11-14T09:00:00Z",
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
      createdAt: "2026-11-01T08:00:00Z",
    },
    {
      id: "second",
      kind: "expense" as const,
      transactionDate: "2026-11-01",
      amount: 250,
      balanceAfter: 0,
      targetBalance: 15000,
      createdAt: "2026-11-01T09:00:00Z",
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

test("preserves the given order when creation timestamps are unavailable", () => {
  const result = recalculateCustodyRows([
    {
      id: "renewal",
      kind: "replenishment" as const,
      transactionDate: "2026-11-13",
      amount: 1000,
      balanceAfter: 0,
      targetBalance: 15000,
    },
    {
      id: "expense",
      kind: "expense" as const,
      transactionDate: "2026-11-01",
      amount: 250,
      balanceAfter: 0,
      targetBalance: 15000,
    },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.rows.map((row) => row.id),
    ["renewal", "expense"],
  );
  assert.deepEqual(
    result.rows.map((row) => row.balanceAfter),
    [1000, 750],
  );
});

test("allows editing backfilled expenses dated before the opening replenishment", () => {
  const result = recalculateCustodyRows([
    {
      id: "renewal",
      kind: "replenishment" as const,
      transactionDate: "2026-11-13",
      amount: 15000,
      balanceAfter: 15000,
      targetBalance: 15000,
      createdAt: "2026-11-13T19:53:24.797Z",
    },
    {
      id: "backfilled-expense",
      kind: "expense" as const,
      transactionDate: "2026-11-01",
      amount: 500,
      balanceAfter: 14500,
      targetBalance: 15000,
      createdAt: "2026-11-14T19:16:53.879Z",
    },
    {
      id: "latest-expense",
      kind: "expense" as const,
      transactionDate: "2026-11-17",
      amount: 4,
      balanceAfter: 14496,
      targetBalance: 15000,
      createdAt: "2026-11-17T06:48:43.267Z",
    },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.rows.map((row) => row.id),
    ["renewal", "backfilled-expense", "latest-expense"],
  );
  assert.deepEqual(
    result.rows.map((row) => row.balanceAfter),
    [15000, 14500, 14496],
  );
  assert.equal(result.balance, 14496);
});

test("editing the latest custody row keeps earlier balances unchanged", () => {
  const result = recalculateCustodyRows([
    {
      id: "renewal",
      kind: "replenishment" as const,
      transactionDate: "2026-11-13",
      amount: 15000,
      balanceAfter: 15000,
      targetBalance: 15000,
      createdAt: "2026-11-13T19:53:24.797Z",
    },
    {
      id: "expense",
      kind: "expense" as const,
      transactionDate: "2026-11-14",
      amount: 500,
      balanceAfter: 14500,
      targetBalance: 15000,
      createdAt: "2026-11-14T19:16:53.879Z",
    },
    {
      id: "latest",
      kind: "expense" as const,
      transactionDate: "2026-11-17",
      amount: 100,
      balanceAfter: 0,
      targetBalance: 15000,
      createdAt: "2026-11-17T06:48:43.267Z",
    },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.rows.map((row) => row.balanceAfter),
    [15000, 14500, 14400],
  );
  assert.equal(result.balance, 14400);
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
        createdAt: "2026-11-01T08:00:00Z",
      },
      {
        id: "renewal",
        kind: "replenishment" as const,
        transactionDate: "2026-11-02",
        amount: 1000,
        balanceAfter: 0,
        targetBalance: 15000,
        createdAt: "2026-11-02T08:00:00Z",
      },
    ],
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /سالب/);
});
