export type ResidentDepositKind = "account" | "stay";

export type ResidentFinanceEntry = {
  id: number;
  residentNumber: number | null;
  amount: number | null;
  transactionDate: string | null;
  returnDate: string | null;
  depositKind?: ResidentDepositKind;
  stayId?: string | null;
  stayLabel?: string | null;
  receiptNumber?: string | null;
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

export type ResidentStayOption = {
  id: string;
  residentId: string;
  residentName: string;
  fileNumber: string;
  admissionDate: string;
  exitDate: string;
  villa: string;
  room: string;
};

export type ResidentFinanceBundle = {
  records: ResidentFinanceRecord[];
  unassignedEntries: ResidentFinanceEntry[];
  stays?: ResidentStayOption[];
};
