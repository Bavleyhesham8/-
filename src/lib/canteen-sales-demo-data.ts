import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";

export const demoCanteenSales: CanteenSalesBundle = {
  items: [
    {
      id: 1,
      name: "مياه معبأة",
      price: 5,
      addToResidentAccount: true,
      canteenItemNumber: 1001,
      categoryId: 1,
      categoryName: "مشتريات النزيل",
    },
    {
      id: 2,
      name: "أرز",
      price: 20,
      addToResidentAccount: false,
      canteenItemNumber: 1002,
      categoryId: 1,
      categoryName: "مشتريات النزيل",
    },
    {
      id: 3,
      name: "مصاريف عامة",
      price: 25,
      addToResidentAccount: true,
      canteenItemNumber: null,
      categoryId: 2,
      categoryName: "مبيعات الكانتين",
    },
  ],
  categories: [
    { id: 1, name: "مشتريات النزيل" },
    { id: 2, name: "مبيعات الكانتين" },
  ],
  invoices: [],
};
