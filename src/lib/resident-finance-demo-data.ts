import type { ResidentFinanceBundle } from "@/lib/resident-finance-types";

export const demoResidentFinance: ResidentFinanceBundle = {
  records: [
    {
      residentNumber: 9001,
      residentId: null,
      matchScore: null,
      matchAmbiguous: false,
      residentName: "نزيل تجريبي",
      entries: [
        {
          id: 1,
          residentNumber: 9001,
          amount: 250,
          transactionDate: "2026-11-02",
          returnDate: "2026-11-16",
          voided: false,
          voidReason: "",
          voidedAt: null,
        },
      ],
    },
  ],
  unassignedEntries: [],
};
