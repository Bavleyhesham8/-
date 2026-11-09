import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";

export const demoCanteenSales: CanteenSalesBundle = {
  items: [
    {
      id: 1,
      name: "مياه معبأة",
      price: 5,
      addToResidentAccount: true,
      canteenItemNumber: 1001,
    },
    {
      id: 2,
      name: "أرز",
      price: 20,
      addToResidentAccount: false,
      canteenItemNumber: 1002,
    },
    {
      id: 3,
      name: "مصاريف عامة",
      price: 25,
      addToResidentAccount: true,
      canteenItemNumber: null,
    },
  ],
  categories: [
    { id: 1, name: "مشتريات النزيل" },
    { id: 2, name: "مبيعات الكانتين" },
  ],
  invoices: [],
};
