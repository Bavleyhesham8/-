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
