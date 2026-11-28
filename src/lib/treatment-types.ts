export type TreatmentDetailEntry = {
  id: number;
  residentNumber: number | null;
  invoiceId?: string | null;
  invoiceNumber?: number | null;
  invoiceDate?: string | null;
  invoiceTotal?: number | null;
  invoiceVoided?: boolean;
  prescriptionUrl?: string | null;
  notes?: string;
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
  residentId: string | null;
  matchScore: number | null;
  matchAmbiguous: boolean;
  entries: TreatmentDetailEntry[];
  totalBilled: number;
};

export type TreatmentBundle = {
  records: TreatmentRecord[];
  unassignedEntries: TreatmentDetailEntry[];
};
