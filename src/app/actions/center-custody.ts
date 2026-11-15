"use server";

import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import { centerCustodyTransactions } from "@/db/schema";
import {
  requireAnyStaffPermission,
  requireScreenAccess,
} from "@/lib/auth-session";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  expenseAmount,
  recalculateCustodyRows,
  roundMoney,
} from "@/lib/center-custody-utils";
import type { CenterCustodyBundle } from "@/lib/center-custody-types";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const entrySchema = z.object({
  transactionDate: dateSchema,
  description: z.string().trim().min(1).max(255),
  unit: z.string().trim().max(80).default(""),
  quantity: z.number().finite().positive().max(1_000_000),
  unitPrice: z.number().finite().nonnegative().max(1_000_000_000),
});

async function withFundLock<T>(work: (transaction: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0]) => Promise<T>) {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(820030142)`);
    return work(transaction);
  });
}

async function readBalance(transaction: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0]) {
  const rows = await transaction
    .select({ kind: centerCustodyTransactions.kind, amount: centerCustodyTransactions.amount, targetBalance: centerCustodyTransactions.targetBalance })
    .from(centerCustodyTransactions)
    .orderBy(asc(centerCustodyTransactions.createdAt));
  return {
    balance: roundMoney(
      rows.reduce(
        (sum, row) => sum + (row.kind === "replenishment" ? row.amount : -row.amount),
        0,
      ),
    ),
    targetBalance: rows.at(-1)?.targetBalance ?? 15000,
  };
}

export async function getCenterCustodyBundleAction(): Promise<CenterCustodyBundle> {
  await requireScreenAccess("custody");
  const rows = await getDatabase()
    .select({
      id: centerCustodyTransactions.id,
      kind: centerCustodyTransactions.kind,
      transactionDate: centerCustodyTransactions.transactionDate,
      description: centerCustodyTransactions.description,
      unit: centerCustodyTransactions.unit,
      quantity: centerCustodyTransactions.quantity,
      unitPrice: centerCustodyTransactions.unitPrice,
      amount: centerCustodyTransactions.amount,
      targetBalance: centerCustodyTransactions.targetBalance,
      balanceAfter: centerCustodyTransactions.balanceAfter,
    })
    .from(centerCustodyTransactions)
    .orderBy(
      asc(centerCustodyTransactions.transactionDate),
      asc(centerCustodyTransactions.createdAt),
    );
  return {
    targetBalance: rows.at(-1)?.targetBalance ?? 15000,
    balance: roundMoney(
      rows.reduce(
        (sum, row) =>
          sum + (row.kind === "replenishment" ? row.amount : -row.amount),
        0,
      ),
    ),
    transactions: rows.map((row) => ({
      ...row,
      kind:
        row.kind === "replenishment"
          ? ("replenishment" as const)
          : ("expense" as const),
    })),
  };
}

export async function recordCenterCustodyExpenseAction(input: unknown) {
  const session = await requireAnyStaffPermission("canManageCustody", "canManageWarehouse");
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "راجع البيان والوحدة والكمية والسعر والتاريخ." };
  const amount = expenseAmount(parsed.data.quantity, parsed.data.unitPrice);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false as const, error: "إجمالي المصروف غير صالح." };

  const result = await withFundLock(async (transaction) => {
    const current = await readBalance(transaction);
    if (amount > current.balance + 1e-9) return { error: "المصروف أكبر من الرصيد المتاح في عهدة المركز." } as const;
    const balanceAfter = roundMoney(current.balance - amount);
    const [row] = await transaction.insert(centerCustodyTransactions).values({
      kind: "expense",
      transactionDate: parsed.data.transactionDate,
      description: parsed.data.description.normalize("NFC"),
      unit: parsed.data.unit.normalize("NFC"),
      quantity: parsed.data.quantity,
      unitPrice: parsed.data.unitPrice,
      amount,
      targetBalance: current.targetBalance,
      balanceAfter,
      createdBy: session.user.id,
    }).returning({ id: centerCustodyTransactions.id });
    return { id: row!.id, balanceAfter } as const;
  });
  if ("error" in result) return { ok: false as const, error: result.error };
  await recordAuditEvent({ actorUserId: session.user.id, action: "create", entity: "centerCustodyTransactions", entityId: result.id, metadata: { fields: "description,quantity,unitPrice,amount,transactionDate" } });
  return { ok: true as const, bundle: await getCenterCustodyBundleAction() };
}

export async function renewCenterCustodyAction(input: unknown) {
  const session = await requireAnyStaffPermission("canManageCustody", "canManageWarehouse");
  const parsed = z.object({ transactionDate: dateSchema, targetBalance: z.number().finite().positive().max(1_000_000_000), amount: z.number().finite().positive().max(1_000_000_000) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "راجع تاريخ التجديد والمبلغ المستهدف ومبلغ الإضافة." };
  const result = await withFundLock(async (transaction) => {
    const current = await readBalance(transaction);
    const expected = Math.max(0, parsed.data.targetBalance - current.balance);
    if (expected <= 0) return { error: "الرصيد وصل بالفعل للمبلغ المستهدف أو تجاوزه." } as const;
    const balanceAfter = roundMoney(current.balance + parsed.data.amount);
    const [row] = await transaction.insert(centerCustodyTransactions).values({
      kind: "replenishment",
      transactionDate: parsed.data.transactionDate,
      description: "تجديد عهدة المركز",
      amount: parsed.data.amount,
      targetBalance: parsed.data.targetBalance,
      balanceAfter,
      createdBy: session.user.id,
    }).returning({ id: centerCustodyTransactions.id });
    return { id: row!.id } as const;
  });
  if ("error" in result) return { ok: false as const, error: result.error };
  await recordAuditEvent({ actorUserId: session.user.id, action: "create", entity: "centerCustodyTransactions", entityId: result.id, metadata: { fields: "replenishment,targetBalance,transactionDate" } });
  return { ok: true as const, bundle: await getCenterCustodyBundleAction() };
}

const updateEntrySchema = z.object({
  id: z.string().uuid(),
  transactionDate: dateSchema,
  description: z.string().trim().max(255).default(""),
  unit: z.string().trim().max(80).default(""),
  quantity: z.number().finite().nonnegative().max(1_000_000).default(0),
  unitPrice: z.number().finite().nonnegative().max(1_000_000_000).default(0),
  amount: z.number().finite().positive().max(1_000_000_000).optional(),
  targetBalance: z.number().finite().positive().max(1_000_000_000).optional(),
});

/**
 * تعديل أي حركة في عهدة المركز مع إعادة حساب الأرصدة اللاحقة.
 * تعديل الرصيد المستهدف يُطبَّق على السجل كله لأنه إعداد عام للعهدة.
 */
export async function updateCenterCustodyTransactionAction(input: unknown) {
  const session = await requireAnyStaffPermission(
    "canManageCustody",
    "canManageWarehouse",
  );
  const parsed = updateEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "راجع بيانات حركة عهدة المركز." };
  }

  const result = await withFundLock(async (transaction) => {
    const rawRows = await transaction
      .select({
        id: centerCustodyTransactions.id,
        kind: centerCustodyTransactions.kind,
        transactionDate: centerCustodyTransactions.transactionDate,
        description: centerCustodyTransactions.description,
        unit: centerCustodyTransactions.unit,
        quantity: centerCustodyTransactions.quantity,
        unitPrice: centerCustodyTransactions.unitPrice,
        amount: centerCustodyTransactions.amount,
        targetBalance: centerCustodyTransactions.targetBalance,
        balanceAfter: centerCustodyTransactions.balanceAfter,
      })
      .from(centerCustodyTransactions)
      .orderBy(
        asc(centerCustodyTransactions.transactionDate),
        asc(centerCustodyTransactions.createdAt),
      )
      .for("update");
    const rows = rawRows.map((row) => ({
      ...row,
      kind:
        row.kind === "replenishment"
          ? ("replenishment" as const)
          : ("expense" as const),
    }));

    const target = rows.find((row) => row.id === parsed.data.id);
    if (!target) {
      return { error: "حركة عهدة المركز غير موجودة." } as const;
    }

    const nextExpenseAmount = expenseAmount(
      parsed.data.quantity,
      parsed.data.unitPrice,
    );
    if (target.kind === "expense" && nextExpenseAmount <= 0) {
      return { error: "إجمالي المصروف غير صالح." } as const;
    }
    const nextReplenishmentAmount = parsed.data.amount ?? target.amount;
    if (target.kind === "replenishment" && nextReplenishmentAmount <= 0) {
      return { error: "مبلغ التجديد غير صالح." } as const;
    }

    const nextTargetBalance =
      parsed.data.targetBalance ?? target.targetBalance;
    const updatedRows = rows.map((row) => {
      if (row.id !== target.id) return row;
      if (row.kind === "expense") {
        return {
          ...row,
          transactionDate: parsed.data.transactionDate,
          description: parsed.data.description.normalize("NFC"),
          unit: parsed.data.unit.normalize("NFC"),
          quantity: parsed.data.quantity,
          unitPrice: parsed.data.unitPrice,
          amount: nextExpenseAmount,
        };
      }
      return {
        ...row,
        transactionDate: parsed.data.transactionDate,
        description:
          parsed.data.description.normalize("NFC") || "تجديد عهدة المركز",
        amount: nextReplenishmentAmount,
        targetBalance: nextTargetBalance,
      };
    });

    const recalculated = recalculateCustodyRows(
      updatedRows,
      nextTargetBalance,
    );
    if (!recalculated.ok) {
      return { error: recalculated.error } as const;
    }

    for (const row of recalculated.rows) {
      await transaction
        .update(centerCustodyTransactions)
        .set({
          transactionDate: row.transactionDate,
          description: row.description,
          unit: row.unit,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          amount: row.amount,
          targetBalance: row.targetBalance,
          balanceAfter: row.balanceAfter,
        })
        .where(eq(centerCustodyTransactions.id, row.id));
    }

    return { ok: true } as const;
  });

  if ("error" in result) {
    return { ok: false as const, error: result.error };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "update",
    entity: "centerCustodyTransactions",
    entityId: parsed.data.id,
    metadata: {
      fields:
        "transactionDate,description,unit,quantity,unitPrice,amount,targetBalance,balanceAfter",
    },
  });
  return {
    ok: true as const,
    bundle: await getCenterCustodyBundleAction(),
  };
}
