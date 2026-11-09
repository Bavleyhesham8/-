import type { TreatmentBundle } from "@/lib/treatment-types";

export const demoTreatmentBundle: TreatmentBundle = {
  records: [
    {
      residentNumber: 1,
      residentName: "يعقوب إبراهيم متي",
      totalBilled: 150,
      entries: [
        {
          id: 1,
          residentNumber: 1,
          medicationName: "أولابكس 5مجم - OLAPEX5mg",
          amount: 160,
          quantity: 1,
          discount: 10,
          total: 150,
          treatmentDate: "2026-10-13",
          voided: false,
          voidReason: "",
          voidedAt: null,
        },
      ],
    },
    {
      residentNumber: 2,
      residentName: "سامح بخيت شجع",
      totalBilled: 100,
      entries: [
        {
          id: 2,
          residentNumber: 2,
          medicationName: "تجريتول- tegretol CR",
          amount: 106,
          quantity: 1,
          discount: 6,
          total: 100,
          treatmentDate: "2026-10-13",
          voided: false,
          voidReason: "",
          voidedAt: null,
        },
      ],
    },
  ],
  unassignedEntries: [],
};

