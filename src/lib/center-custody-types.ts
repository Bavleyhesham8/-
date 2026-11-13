export type CenterCustodyTransaction = {
  id: string;
  kind: "expense" | "replenishment";
  transactionDate: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  targetBalance: number;
  balanceAfter: number;
};

export type CenterCustodyBundle = {
  targetBalance: number;
  balance: number;
  transactions: CenterCustodyTransaction[];
};
