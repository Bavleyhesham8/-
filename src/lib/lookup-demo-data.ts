import type { LookupData } from "@/lib/lookup-types";

export const demoLookupData: LookupData = {
  churches: [
    {
      id: 1,
      number: null,
      name: "كنيسة العذراء مريم",
      acheshe: "أب الاعتراف تادرس",
    },
  ],
  governorates: [
    {
      id: 1,
      governorate: "القاهرة",
      district: "المعادي",
    },
  ],
  days: [{ id: 1, day: "الأحد" }],
  alternateCategories: [{ id: 1, name: "مشتريات النزلاء" }],
  villas: [
    { id: 1, villaNumber: "A" },
    { id: 2, villaNumber: "B" },
    { id: 3, villaNumber: "C" },
    { id: 4, villaNumber: "D" },
  ],
  rooms: [
    { id: 5, villaNumber: "غرفة1" },
    { id: 6, villaNumber: "غرفة 2" },
  ],
};
