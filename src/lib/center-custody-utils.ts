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
  createdAt?: string | Date;
};

function creationTime(value: string | Date | undefined) {
  if (value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/**
 * يعيد حساب الرصيد بعد كل حركة بترتيب إنشاء الحركات.
 * ترتيب الإنشاء هو ترتيب السجل الفعلي الذي تتبعه أرصدة العهدة والرصيد الحالي،
 * أما تاريخ الحركة فقد يكون قديمًا عند إدخال حركات بأثر رجعي.
 * إذا لم تتوفر تواريخ الإنشاء يُحتفظ بترتيب المصفوفة المرسلة.
 * يُستخدم عند تعديل أي حركة حتى تظل الأرصدة اللاحقة صحيحة.
 */
export function recalculateCustodyRows<T extends CustodyLedgerRow>(
  rows: T[],
  targetBalance?: number,
):
  | { ok: true; rows: T[]; balance: number }
  | { ok: false; error: string } {
  const creationTimes = rows.map((row) => creationTime(row.createdAt));
  const useCreationOrder =
    rows.length > 0 && creationTimes.every((time) => time !== null);
  const ordered = rows.map((row, index) => ({ row, index }));
  if (useCreationOrder) {
    ordered.sort((left, right) => {
      const delta = creationTimes[left.index]! - creationTimes[right.index]!;
      return delta === 0 ? left.index - right.index : delta;
    });
  }

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
          "هذا التعديل يجعل رصيد عهدة المركز سالبًا في حركة لاحقة. راجع المبالغ.",
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
