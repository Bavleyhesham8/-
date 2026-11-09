import type { LookupData } from "@/lib/lookup-types";

export const demoLookupData: LookupData = {
  churches: [
    {
      id: 1,
      number: "DEMO-CH-1",
      name: "كنيسة تجريبية",
      acheshe: "",
      father: "",
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
    { id: 1, villaNumber: "١" },
    { id: 2, villaNumber: "٢" },
    { id: 3, villaNumber: "٣" },
  ],
};
