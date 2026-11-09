export type ResidentFinanceEntry = {
  id: number;
  residentNumber: number | null;
  amount: number | null;
  transactionDate: string | null;
  returnDate: string | null;
  voided: boolean;
  voidReason: string;
  voidedAt: string | null;
};

export type ResidentFinanceRecord = {
  residentNumber: number;
  residentName: string | null;
  entries: ResidentFinanceEntry[];
};

export type ResidentFinanceBundle = {
  records: ResidentFinanceRecord[];
  unassignedEntries: ResidentFinanceEntry[];
};
