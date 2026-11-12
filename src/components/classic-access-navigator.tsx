"use client";

import React, { useState } from "react";

type ViewType =
  | "overview"
  | "residents"
  | "resident-reports"
  | "resident-search"
  | "treatment"
  | "rooms"
  | "inventory"
  | "custody"
  | "resident-finance"
  | "canteen"
  | "canteen-reports"
  | "sales"
  | "invoice-reports"
  | "resident-stay-reports"
  | "meat-sales"
  | "staff"
  | "staff-attendance"
  | "lookups"
  | "tracking"
  | "access";

type Props = {
  onNavigate: (view: ViewType, tab?: string) => void;
  visibleViews: readonly string[];
  canIssueInvoices: boolean;
  canManageMeatSales: boolean;
  canViewResidentReferences: boolean;
  isAdministrator: boolean;
};

interface MenuColumn {
  title: string;
  headerColor: "green" | "gold" | "blue";
  items: {
    label: string;
    targetView: ViewType;
    targetTab?: string;
    itemColor?: "green" | "gold" | "blue" | "lightBlue";
    requiredCapability?:
      | "issue-invoices"
      | "manage-meat-sales"
      | "resident-references"
      | "administrator";
  }[];
}

const classicColumns: MenuColumn[] = [
  {
    title: "النزلاء والإقامة",
    headerColor: "green",
    items: [
      { label: "بحث عن نزيل", targetView: "resident-search", itemColor: "lightBlue" },
      { label: "قائمة النزلاء", targetView: "residents", itemColor: "lightBlue" },
      { label: "السكن والغرف", targetView: "rooms", itemColor: "lightBlue" },
      { label: "تقرير الدخول خلال فترة", targetView: "resident-stay-reports", itemColor: "blue" },
      { label: "تقرير أسماء النزلاء", targetView: "resident-reports", targetTab: "names", itemColor: "gold" },
      { label: "توزيع المحافظات", targetView: "resident-reports", targetTab: "governorate", itemColor: "gold" },
    ],
  },
  {
    title: "بحث مرجعي",
    headerColor: "green",
    items: [
      {
        label: "بحث بالكنيسة",
        targetView: "lookups",
        targetTab: "church",
        itemColor: "lightBlue",
        requiredCapability: "resident-references",
      },
    ],
  },
  {
    title: "الكانتين والثلاجة",
    headerColor: "green",
    items: [
      {
        label: "إضافة فاتورة كانتين",
        targetView: "sales",
        targetTab: "sale",
        itemColor: "green",
        requiredCapability: "issue-invoices",
      },
      { label: "سجل فواتير الكانتين", targetView: "sales", targetTab: "history", itemColor: "green" },
      { label: "مخزون الكانتين", targetView: "canteen", itemColor: "green" },
      {
        label: "مبيعات الثلاجة",
        targetView: "meat-sales",
        targetTab: "sale",
        itemColor: "green",
        requiredCapability: "manage-meat-sales",
      },
      { label: "سجل فواتير الثلاجة", targetView: "meat-sales", targetTab: "history", itemColor: "green" },
      { label: "أرصدة الثلاجة", targetView: "meat-sales", targetTab: "balances", itemColor: "green" },
    ],
  },
  {
    title: "المخزن والحركات",
    headerColor: "green",
    items: [
      { label: "مخزن الأغذية", targetView: "inventory", itemColor: "green" },
      { label: "مخزن العهدة", targetView: "custody", itemColor: "green" },
      { label: "مشتريات النزلاء", targetView: "invoice-reports", itemColor: "green" },
      { label: "أرصدة الكانتين", targetView: "canteen-reports", itemColor: "green" },
      { label: "التتبع العام", targetView: "tracking", itemColor: "green" },
    ],
  },
  {
    title: "الموظفون والإدارة",
    headerColor: "green",
    items: [
      { label: "الموظفون", targetView: "staff", itemColor: "blue" },
      { label: "الحضور والانصراف", targetView: "staff-attendance", itemColor: "blue" },
      {
        label: "إدارة القوائم المرجعية",
        targetView: "lookups",
        targetTab: "manage",
        itemColor: "blue",
        requiredCapability: "administrator",
      },
      {
        label: "إدارة الوصول والتدقيق",
        targetView: "access",
        itemColor: "blue",
        requiredCapability: "administrator",
      },
    ],
  },
];

export default function ClassicAccessNavigator({
  onNavigate,
  visibleViews,
  canIssueInvoices,
  canManageMeatSales,
  canViewResidentReferences,
  isAdministrator,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const visibleColumns = classicColumns
    .map((column) => ({
      ...column,
      items: column.items.filter((item) => {
        if (!visibleViews.includes(item.targetView)) return false;
        switch (item.requiredCapability) {
          case "issue-invoices":
            return canIssueInvoices;
          case "manage-meat-sales":
            return canManageMeatSales;
          case "resident-references":
            return canViewResidentReferences;
          case "administrator":
            return isAdministrator;
          default:
            return true;
        }
      }),
    }))
    .filter((column) => column.items.length > 0);
  const shortcutCount = visibleColumns.reduce(
    (count, column) => count + column.items.length,
    0,
  );

  if (shortcutCount === 0) return null;

  return (
    <section
      className="mb-6 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur-xl sm:p-4"
      dir="rtl"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-800 text-lg text-white shadow-sm" aria-hidden="true">✦</span>
          <div>
            <h2 className="text-sm font-black text-slate-900">الوصول السريع</h2>
            <p className="text-xs text-slate-600">تنقل مباشر بين الشاشات المسموحة لحسابك</p>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm font-bold text-teal-900 transition hover:border-teal-500 hover:bg-teal-50"
        >
          <span>{isOpen ? "إخفاء" : "فتح القائمة"}</span>
          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs">{shortcutCount}</span>
          <span aria-hidden="true">{isOpen ? "⌃" : "⌄"}</span>
        </button>
      </div>
      {isOpen && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="classic-access-grid">
            {visibleColumns.map((col) => (
              <div key={col.title} className="classic-access-column flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/90 p-3">
                <h3 className="rounded-lg bg-teal-900 px-3 py-2 text-center text-xs font-black text-white">{col.title}</h3>
                <div className="classic-access-column-items">
                  {col.items.map((item) => (
                    <button
                      key={`${item.targetView}-${item.targetTab ?? ""}-${item.label}`}
                      type="button"
                      onClick={() => onNavigate(item.targetView, item.targetTab)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-start text-xs font-bold text-slate-800 shadow-sm transition hover:border-teal-400 hover:bg-teal-50 hover:text-teal-900"
                      title={`الانتقال إلى: ${item.label}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
