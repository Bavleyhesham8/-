export type TreatmentDetailEntry = {
  id: number;
  residentNumber: number | null;
  medicationName: string;
  amount: number;
  quantity: number;
  discount: number;
  total: number;
  treatmentDate: string | null;
  voided: boolean;
  voidReason: string;
  voidedAt: string | null;
};

export type TreatmentRecord = {
  residentNumber: number;
  residentName: string | null;
  entries: TreatmentDetailEntry[];
  totalBilled: number;
};

export type TreatmentBundle = {
  records: TreatmentRecord[];
  unassignedEntries: TreatmentDetailEntry[];
};

