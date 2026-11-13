import type { InvoiceReportData } from "@/lib/invoice-report-types";

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayName(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function monthName(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`));
}

export function getDemoInvoiceReport(): InvoiceReportData {
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return {
    categories: [
      { id: 1, name: "مشتريات النزيل" },
      { id: 2, name: "مبيعات الكانتين" },
    ],
    rows: [
      {
        invoiceNumber: 9001,
        invoiceDate: todayValue,
        saleType: "resident",
        residentId: null,
        residentNumber: 9001,
        residentName: "نموذج تجريبي ٠١",
        balance: 15,
        alternateCategory: "",
        categoryId: 1,
        itemName: "مياه معبأة",
        unitPrice: "15",
        quantity: "1",
        categoryName: "مشتريات النزيل",
        total: 15,
        lineDate: todayValue,
        dayName: dayName(todayValue),
        monthName: monthName(todayValue),
      },
      {
        invoiceNumber: 9001,
        invoiceDate: todayValue,
        saleType: "resident",
        residentId: null,
        residentNumber: 9001,
        residentName: "نموذج تجريبي ٠١",
        balance: 30,
        alternateCategory: "",
        categoryId: 2,
        itemName: "وجبة",
        unitPrice: "30",
        quantity: "1",
        categoryName: "مبيعات الكانتين",
        total: 30,
        lineDate: todayValue,
        dayName: dayName(todayValue),
        monthName: monthName(todayValue),
      },
      {
        invoiceNumber: 9002,
        invoiceDate: shiftDate(todayValue, -1),
        saleType: "cash",
        residentId: null,
        residentNumber: null,
        residentName: "",
        balance: 0,
        alternateCategory: "مبيعات نقدية",
        categoryId: 2,
        itemName: "مصاريف عامة",
        unitPrice: "25",
        quantity: "1",
        categoryName: "مبيعات الكانتين",
        total: 25,
        lineDate: shiftDate(todayValue, -1),
        dayName: dayName(shiftDate(todayValue, -1)),
        monthName: monthName(shiftDate(todayValue, -1)),
      },
    ],
  };
}
