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
  | "lookups"
  | "tracking"
  | "access";

type Props = {
  onNavigate: (view: ViewType, tab?: string) => void;
};

interface MenuColumn {
  title: string;
  headerColor: "green" | "gold" | "blue";
  items: {
    label: string;
    targetView: ViewType;
    targetTab?: string;
    itemColor?: "green" | "gold" | "blue" | "lightBlue";
  }[];
}

const classicColumns: MenuColumn[] = [
  {
    title: "النزلاء",
    headerColor: "green",
    items: [
      { label: "اسم النزيل", targetView: "residents", targetTab: "names", itemColor: "lightBlue" },
      { label: "عنوان النزيل", targetView: "residents", targetTab: "addresses", itemColor: "lightBlue" },
      { label: "بيانات النزلاء", targetView: "residents", targetTab: "data", itemColor: "lightBlue" },
      { label: "رقم الفيلا", targetView: "rooms", itemColor: "lightBlue" },
      { label: "المحافظة", targetView: "resident-reports", targetTab: "governorate", itemColor: "lightBlue" },
    ],
  },
  {
    title: "تقرير النزلاء",
    headerColor: "green",
    items: [
      { label: "تقرير الاسماء", targetView: "resident-reports", targetTab: "names", itemColor: "gold" },
      { label: "تقرير التشخيص", targetView: "resident-reports", targetTab: "diagnosis", itemColor: "gold" },
      { label: "تقرير المحافظة", targetView: "resident-reports", targetTab: "governorate", itemColor: "gold" },
      { label: "تقرير السكن", targetView: "resident-reports", targetTab: "housing", itemColor: "gold" },
    ],
  },
  {
    title: "الفترة الزمنية",
    headerColor: "green",
    items: [
      { label: "سن النزيل", targetView: "resident-stay-reports", targetTab: "age", itemColor: "blue" },
      { label: "فترة النزيل", targetView: "resident-stay-reports", targetTab: "stay", itemColor: "blue" },
    ],
  },
  {
    title: "بحث النزلاء",
    headerColor: "green",
    items: [
      { label: "بحث", targetView: "resident-search", itemColor: "green" },
    ],
  },
  {
    title: "دفتر اليومية",
    headerColor: "green",
    items: [
      { label: "المشتريات", targetView: "invoice-reports", targetTab: "purchases", itemColor: "green" },
      { label: "الحركات", targetView: "tracking", targetTab: "ledger", itemColor: "green" },
    ],
  },
  {
    title: "الثلاجة",
    headerColor: "green",
    items: [
      { label: "مبيعات الثلاجة", targetView: "meat-sales", targetTab: "sale", itemColor: "green" },
      { label: "فواتير البيع", targetView: "meat-sales", targetTab: "history", itemColor: "green" },
      { label: "تقرير الثلاجة", targetView: "meat-sales", targetTab: "report", itemColor: "green" },
      { label: "الأرصدة", targetView: "meat-sales", targetTab: "balances", itemColor: "green" },
      { label: "المنصرف والمتبقي", targetView: "meat-sales", targetTab: "balances", itemColor: "green" },
    ],
  },
  {
    title: "مخزن الأغذية",
    headerColor: "green",
    items: [
      { label: "أرصدة المخزن", targetView: "inventory", targetTab: "balances", itemColor: "green" },
      { label: "البحث عن تاريخ", targetView: "inventory", targetTab: "date-search", itemColor: "green" },
      { label: "الرصيد والمتبقي", targetView: "inventory", targetTab: "balances", itemColor: "green" },
      { label: "الأرصدة والمنصرف", targetView: "inventory", targetTab: "movements", itemColor: "green" },
    ],
  },
  {
    title: "الكانتين",
    headerColor: "green",
    items: [
      { label: "أرصدة الكانتين", targetView: "canteen", targetTab: "stock", itemColor: "green" },
      { label: "فواتير الكانتين", targetView: "sales", itemColor: "green" },
      { label: "مشتريات النزلاء", targetView: "invoice-reports", targetTab: "purchases", itemColor: "green" },
      { label: "الأرصدة والمنصرف", targetView: "canteen-reports", targetTab: "report", itemColor: "green" },
      { label: "إضافة أصناف للكانتين", targetView: "canteen", targetTab: "catalog", itemColor: "green" },
    ],
  },
  {
    title: "الإدارة",
    headerColor: "blue",
    items: [
      { label: "إدارة الوصول", targetView: "access", itemColor: "blue" },
      { label: "البيانات المرجعية", targetView: "lookups", itemColor: "blue" },
    ],
  },
];

function getButtonGradient(color?: string) {
  switch (color) {
    case "gold":
      return "linear-gradient(180deg, #fef08a 0%, #ca8a04 100%)";
    case "blue":
      return "linear-gradient(180deg, #93c5fd 0%, #1d4ed8 100%)";
    case "lightBlue":
      return "linear-gradient(180deg, #67e8f9 0%, #0284c7 100%)";
    case "green":
    default:
      return "linear-gradient(180deg, #4ade80 0%, #15803d 100%)";
  }
}

function getButtonTextColor(color?: string) {
  switch (color) {
    case "gold":
      return "#451a03";
    case "blue":
    case "lightBlue":
      return "#ffffff";
    case "green":
    default:
      return "#ffffff";
  }
}

export default function ClassicAccessNavigator({ onNavigate }: Props) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div
      className="rounded-3xl border border-white/50 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-xl text-white"
      dir="rtl"
    >
      {/* الترويسة الأصلية الكلاسيكية */}
      <div className="flex flex-col md:flex-row items-center justify-between border-b border-white/10 pb-4 mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 text-lg font-bold">
            ⚡
          </div>
          <div>
            <h2 className="text-sm md:text-base font-black text-amber-300 tracking-wide">
              قائمة الوصول السريع الشاملة (مطابقة لبرنامج الآكسيس الأصلي)
            </h2>
            <p className="text-[11px] text-slate-300">
              ***** برنامج قاعدة بيانات مركز قيثارة داود - كنيسة مارمرقس - مصر الجديدة *****
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 text-xs font-semibold text-white hover:bg-white/20 transition flex items-center gap-1.5"
        >
          <span>{isOpen ? "طي القائمة الكلاسيكية" : "إظهار القوائم الـ 8"}</span>
          <span>{isOpen ? "▲" : "▼"}</span>
        </button>
      </div>

      {isOpen && (
        <div className="pb-2">
          <div className="classic-access-grid">
            {classicColumns.map((col, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-2 shadow-inner"
              >
                {/* رأس العمود */}
                <div
                  style={{
                    background: "linear-gradient(180deg, #15803d 0%, #064e3b 100%)",
                    border: "1px solid #34d399",
                    color: "#ffffff",
                    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                  }}
                  className="rounded-lg py-1.5 px-1 text-center font-black text-xs shadow-md tracking-wide"
                >
                  {col.title}
                </div>

                {/* أزرار العمود التفاعلية */}
                <div className="flex flex-col gap-1.5 mt-1">
                  {col.items.map((item, itemIdx) => {
                    const bg = getButtonGradient(item.itemColor);
                    const textColor = getButtonTextColor(item.itemColor);
                    return (
                      <button
                        key={itemIdx}
                        type="button"
                        onClick={() =>
                          onNavigate(item.targetView, item.targetTab)
                        }
                        style={{
                          background: bg,
                          color: textColor,
                          textShadow: textColor === "#ffffff" ? "0 1px 2px rgba(0,0,0,0.6)" : "none",
                          border: "1px solid rgba(255,255,255,0.4)",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.3)",
                        }}
                        className="classic-access-button rounded-lg py-1.5 px-1.5 text-center text-[11px] font-bold transition hover:scale-[1.03] hover:brightness-110 active:scale-[0.98] cursor-pointer leading-tight"
                        title={`الانتقال إلى: ${item.label}`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
