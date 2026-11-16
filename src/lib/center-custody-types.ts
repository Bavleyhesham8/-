export type CenterCustodyTransaction = {
  id: string;
  kind: "expense" | "replenishment";
  transactionDate: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  residentId: string | null;
  residentName: string;
  targetBalance: number;
  balanceAfter: number;
};

export type CenterCustodyBundle = {
  targetBalance: number;
  balance: number;
  transactions: CenterCustodyTransaction[];
};

/** حركة مصروف في عهدة المركز مرتبطة بحساب نزيل. */
export type ResidentCustodyCharge = {
  id: string;
  transactionDate: string;
  description: string;
  amount: number;
  residentId: string;
  residentName: string;
};

export function residentChargesFromTransactions(
  transactions: CenterCustodyTransaction[],
): ResidentCustodyCharge[] {
  return transactions
    .filter(
      (row): row is CenterCustodyTransaction & { residentId: string } =>
        row.kind === "expense" && Boolean(row.residentId),
    )
    .map((row) => ({
      id: row.id,
      transactionDate: row.transactionDate,
      description: row.description,
      amount: row.amount,
      residentId: row.residentId,
      residentName: row.residentName,
    }));
}
