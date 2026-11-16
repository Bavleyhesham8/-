export const CENTER_CUSTODY_TARGET = 15_000;

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function expenseAmount(quantity: number, unitPrice: number) {
  return roundMoney(quantity * unitPrice);
}

/** المتبقي للوصول إلى الرصيد المستهدف، ولا يكون سالبًا. */
export function remainingToTarget(balance: number, target: number) {
  return roundMoney(Math.max(0, target - balance));
}

/** مبلغ التجديد المقترح = الفرق بين الهدف والرصيد الحالي. */
export function suggestedRenewal(balance: number, target: number) {
  return remainingToTarget(balance, target);
}

/**
 * نتيجة التجديد قبل الحفظ: الرصيد المتوقع والفرق المتبقي للهدف.
 * لا يمنع تجاوز الهدف؛ الواجهة تعرض النتيجة ليقرر المستخدم.
 */
export function renewalOutcome(
  balance: number,
  target: number,
  amount: number,
) {
  const balanceAfter = roundMoney(balance + amount);
  return {
    balanceAfter,
    remaining: remainingToTarget(balanceAfter, target),
    excess: roundMoney(Math.max(0, balanceAfter - target)),
  };
}

/** هل يمكن صرف هذا المبلغ من الرصيد الحالي؟ */
export function canCoverExpense(balance: number, amount: number) {
  return amount > 1e-9 && amount <= balance + 1e-9;
}

type CustodyLedgerRow = {
  kind: "expense" | "replenishment";
  transactionDate: string;
  amount: number;
  balanceAfter: number;
  targetBalance: number;
};

/**
 * يعيد ترتيب حركات عهدة المركز حسب التاريخ ويعيد حساب الرصيد بعد كل حركة.
 * يُستخدم عند تعديل أي حركة حتى تظل الأرصدة اللاحقة صحيحة.
 */
export function recalculateCustodyRows<T extends CustodyLedgerRow>(
  rows: T[],
  targetBalance?: number,
):
  | { ok: true; rows: T[]; balance: number }
  | { ok: false; error: string } {
  const ordered = rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) =>
      left.row.transactionDate === right.row.transactionDate
        ? left.index - right.index
        : left.row.transactionDate.localeCompare(right.row.transactionDate),
    );

  let running = 0;
  const nextRows: T[] = [];
  for (const entry of ordered) {
    running = roundMoney(
      running +
        (entry.row.kind === "replenishment"
          ? entry.row.amount
          : -entry.row.amount),
    );
    if (running < -1e-9) {
      return {
        ok: false,
        error:
          "هذا التعديل يجعل رصيد عهدة المركز سالبًا في تاريخ لاحق. راجع المبالغ.",
      };
    }
    nextRows.push({
      ...entry.row,
      balanceAfter: running,
      targetBalance: targetBalance ?? entry.row.targetBalance,
    });
  }

  return { ok: true, rows: nextRows, balance: running };
}
