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
  residentId: string | null;
  matchScore: number | null;
  matchAmbiguous: boolean;
  entries: ResidentFinanceEntry[];
};

export type ResidentFinanceBundle = {
  records: ResidentFinanceRecord[];
  unassignedEntries: ResidentFinanceEntry[];
};
