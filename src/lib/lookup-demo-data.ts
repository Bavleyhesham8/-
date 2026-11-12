import type { LookupData } from "@/lib/lookup-types";

export const demoLookupData: LookupData = {
  churches: [
    {
      id: 1,
      number: "DEMO-CH-1",
      name: "كنيسة تجريبية",
      acheshe: "",
    },
  ],
  governorates: [
    {
      id: 1,
      governorate: "محافظة تجريبية",
      district: "مركز تجريبي",
    },
  ],
  days: [{ id: 1, day: "يوم تجريبي" }],
  alternateCategories: [{ id: 1, name: "فئة تجريبية" }],
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
