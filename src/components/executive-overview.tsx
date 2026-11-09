"use client";

import { useMemo } from "react";
import type { Resident } from "@/lib/demo-data";
import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";
import type { MeatSalesBundle } from "@/lib/meat-sales-types";
import type { TreatmentBundle } from "@/lib/treatment-types";
import type { ResidentFinanceBundle } from "@/lib/resident-finance-types";
import type { CustodyBundle } from "@/lib/custody-types";
import type { LookupData } from "@/lib/lookup-types";
import ClassicAccessNavigator from "@/components/classic-access-navigator";

type Props = {
  residents: Resident[];
  sales?: CanteenSalesBundle;
  meatSales?: MeatSalesBundle;
  treatment?: TreatmentBundle;
  residentFinance?: ResidentFinanceBundle;
  custody?: CustodyBundle;
  lookups: LookupData;
  onNavigate: (view: string, tab?: string) => void;
};

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 0,
});

const currencyFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 1,
});

export default function ExecutiveOverview({
  residents,
  sales,
  meatSales,
  treatment,
  residentFinance,
  custody,
  lookups,
  onNavigate,
}: Props) {
  // 1. حسابات النزلاء والإشغال
  const activeResidents = useMemo(() => residents.filter((r) => !r.archived), [residents]);
  const currentResidents = useMemo(() => activeResidents.filter((r) => r.status === "current"), [activeResidents]);
  const departedCount = useMemo(() => activeResidents.filter((r) => r.status === "departed").length, [activeResidents]);

  // إشغال الفلل
  const villaStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of lookups.villas) {
      if (v.villaNumber) counts[v.villaNumber] = 0;
    }
    for (const r of currentResidents) {
      if (r.villa) {
        counts[r.villa] = (counts[r.villa] || 0) + 1;
      }
    }
    return Object.entries(counts).map(([name, count]) => ({
      name: `فيلا ${name}`,
      count,
      percent: Math.min(100, Math.round((count / Math.max(1, currentResidents.length)) * 100)),
    }));
  }, [lookups.villas, currentResidents]);

  // 2. إجمالي المبيعات والماليات
  const totalCanteenSales = useMemo(() => {
    if (!sales) return 0;
    return sales.invoices
      .filter((inv) => !inv.voided)
      .reduce((sum, inv) => sum + (inv.lines?.reduce((s, l) => s + (l.total || 0), 0) || 0), 0);
  }, [sales]);

  const totalMeatSales = useMemo(() => {
    if (!meatSales) return 0;
    return meatSales.invoices
      .filter((inv) => !inv.voided)
      .reduce((sum, inv) => sum + (inv.lines?.reduce((s, l) => s + (l.total || 0), 0) || 0), 0);
  }, [meatSales]);

  const totalClinicExpenses = useMemo(() => {
    if (!treatment) return 0;
    return treatment.records.reduce((sum, r) => sum + r.totalBilled, 0);
  }, [treatment]);

  const totalResidentDeposits = useMemo(() => {
    if (!residentFinance) return 0;
    return residentFinance.records.reduce(
      (sum, r) =>
        sum +
        r.entries
          .filter((e) => !e.voided && e.amount)
          .reduce((s, e) => s + (e.amount || 0), 0),
      0,
    );
  }, [residentFinance]);

  const activeCustodyCount = useMemo(() => {
    if (!custody) return 0;
    return custody.records
      .filter((c) => !c.voided)
      .reduce(
        (sum, c) =>
          sum +
          c.details.reduce((itemSum, d) => itemSum + (d.outstandingQuantity > 0 ? 1 : 0), 0),
        0,
      );
  }, [custody]);

  // إجمالي الإيرادات المركبة
  const grandRevenue = totalCanteenSales + totalMeatSales;
  // إجمالي النشاط يشمل مبيعات الكانتين واللحوم ومستحقات العيادة،
  // وتُحسب نسب الرسم الدائري على هذا الأساس حتى يكتمل القوس 100%.
  const donutTotal = grandRevenue + totalClinicExpenses;
  const canteenPercent =
    donutTotal > 0 ? (totalCanteenSales / donutTotal) * 100 : 0;
  const meatPercent = donutTotal > 0 ? (totalMeatSales / donutTotal) * 100 : 0;
  const clinicPercent =
    donutTotal > 0 ? (totalClinicExpenses / donutTotal) * 100 : 0;

  return (
    <div className="space-y-8" dir="rtl">
      {/* البانر الترحيبي الإداري */}
      <div className="relative overflow-hidden rounded-3xl border border-white/40 bg-gradient-to-r from-teal-900/90 via-teal-800/85 to-slate-900/90 p-8 text-white shadow-xl backdrop-blur-md">
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/30 bg-teal-500/20 px-3.5 py-1 text-xs font-semibold text-teal-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>لوحة التحليلات التنفيذية الشاملة · نبض المركز اليوم</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              مركز قيثارة داود للتأهيل والتعافي
            </h1>
            <p className="max-w-2xl text-sm text-teal-100/90 leading-relaxed">
              متابعة حية وموحدة لكافة أنشطة البيت: إشغال النزلاء بالفلل، وحركة مبيعات الكانتين واللحوم، وصيدلية العيادة، ومستودع العهد، والأمانات المالية.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate("residents")}
              className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-teal-900 shadow-md transition hover:bg-teal-50"
            >
              إدارة النزلاء
            </button>
            <button
              onClick={() => onNavigate("sales")}
              className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              فواتير المبيعات
            </button>
          </div>
        </div>

        {/* دوائر جمالية ناعمة في الخلفية */}
        <div className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 right-1/4 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
      </div>

      {/* قائمة الوصول السريع المطابقة للبرنامج الأصلي الكلاسيكي */}
      <ClassicAccessNavigator onNavigate={onNavigate} />

      {/* بطاقات المؤشرات الرئيسية (Executive KPI Cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* بطاقة النزلاء والإشغال */}
        <div
          onClick={() => onNavigate("residents")}
          className="group cursor-pointer rounded-2xl border border-white/60 bg-white/95 p-5 shadow-sm backdrop-blur-md transition hover:-translate-y-1 hover:border-teal-400 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">النزلاء المقيمون الآن</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-xl text-teal-700 group-hover:bg-teal-600 group-hover:text-white transition">
              👥
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {numberFormatter.format(currentResidents.length)}
            </span>
            <span className="text-xs text-slate-600">نزيل</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-2">
            <span>إجمالي المسجلين: {activeResidents.length}</span>
            <span className="text-amber-700">غادروا: {departedCount}</span>
          </div>
        </div>

        {/* بطاقة إجمالي مبيعات الكانتين واللحوم */}
        <div
          onClick={() => onNavigate("sales")}
          className="group cursor-pointer rounded-2xl border border-white/60 bg-white/95 p-5 shadow-sm backdrop-blur-md transition hover:-translate-y-1 hover:border-emerald-400 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">مبيعات الكانتين واللحوم</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-xl text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
              🛒
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-700">
              {currencyFormatter.format(grandRevenue)}
            </span>
            <span className="text-xs text-emerald-900 font-bold">ج.م</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-2">
            <span>الكانتين: {currencyFormatter.format(totalCanteenSales)}</span>
            <span>اللحوم: {currencyFormatter.format(totalMeatSales)}</span>
          </div>
        </div>

        {/* بطاقة العيادة والصيدلية */}
        <div
          onClick={() => onNavigate("treatment")}
          className="group cursor-pointer rounded-2xl border border-white/60 bg-white/95 p-5 shadow-sm backdrop-blur-md transition hover:-translate-y-1 hover:border-cyan-400 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">أدوية العيادة المصروفة</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-xl text-cyan-700 group-hover:bg-cyan-600 group-hover:text-white transition">
              💊
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-cyan-800">
              {currencyFormatter.format(totalClinicExpenses)}
            </span>
            <span className="text-xs text-cyan-900 font-bold">ج.م</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-2">
            <span>تذاكر العلاج: {treatment?.records.length || 0}</span>
            <span className="text-teal-700">سارية ومعتمدة</span>
          </div>
        </div>

        {/* بطاقة أمانات وسندات النزلاء */}
        <div
          onClick={() => onNavigate("resident-finance")}
          className="group cursor-pointer rounded-2xl border border-white/60 bg-white/95 p-5 shadow-sm backdrop-blur-md transition hover:-translate-y-1 hover:border-amber-400 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">أمانات ومقبوضات النزلاء</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-xl text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition">
              🪙
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-800">
              {currencyFormatter.format(totalResidentDeposits)}
            </span>
            <span className="text-xs text-amber-900 font-bold">ج.م</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-2">
            <span>العهد المسلمة: {activeCustodyCount} عهدة</span>
            <span className="text-emerald-700">أرصدة نشطة</span>
          </div>
        </div>
      </div>

      {/* قسم الرسوم البيانية التفاعلية (Native SVG Charts) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* شارت توزيع إشغال الفلل (Villa Occupancy Chart) */}
        <div className="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-sm backdrop-blur-md lg:col-span-7">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                توزيع النزلاء المقيمين حسب الفلل
              </h3>
              <p className="text-xs text-slate-600">
                نسبة إشغال كل فيلا وفقاً للتسكين الحالي
              </p>
            </div>
            <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
              {currentResidents.length} نزيل مقيم
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {villaStats.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                لا توجد بيانات تسكين مسجلة حالياً.
              </div>
            ) : (
              villaStats.map((item) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>{item.name}</span>
                    <span className="text-slate-600">
                      {item.count} نزيل ({item.percent}%)
                    </span>
                  </div>
                  <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-700 transition-all duration-700"
                      style={{ width: `${Math.max(4, item.percent)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* شارت توزيع الإيرادات والمنصرفات (Financial Distribution Chart) */}
        <div className="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-sm backdrop-blur-md lg:col-span-5">
          <div className="pb-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900">
              توزيع حركة الإيرادات والمصروفات
            </h3>
            <p className="text-xs text-slate-600">
              مقارنة بين إجمالي الكانتين واللحوم والعيادة
            </p>
          </div>

          <div className="mt-6 flex flex-col items-center justify-center">
            {/* رسم بياني دائري تفاعلي SVG Donut Chart */}
            <div className="relative flex h-48 w-48 items-center justify-center">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                {/* خلفية الدائرة */}
                <path
                  className="text-slate-100"
                  strokeWidth="3.8"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                {/* الكانتين - أزرق */}
                <path
                  className="text-teal-600 transition-all duration-700"
                  strokeDasharray={`${canteenPercent}, 100`}
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                {/* اللحوم - أخضر */}
                <path
                  className="text-emerald-500 transition-all duration-700"
                  strokeDasharray={`${meatPercent}, 100`}
                  strokeDashoffset={`-${canteenPercent}`}
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                {/* العيادة - سماوي */}
                <path
                  className="text-cyan-600 transition-all duration-700"
                  strokeDasharray={`${clinicPercent}, 100`}
                  strokeDashoffset={`-${canteenPercent + meatPercent}`}
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-xs text-slate-400 font-medium">النشاط العام</span>
                <span className="text-lg font-black text-slate-900">
                  {currencyFormatter.format(donutTotal)}
                </span>
                <span className="text-[10px] text-teal-800 font-bold">ج.م</span>
              </div>
            </div>

            {/* مفتاح الرسم البياني */}
            <div className="mt-6 grid w-full grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2">
                <span className="inline-block h-2 w-2 rounded-full bg-teal-600 mb-1" />
                <span className="block text-[11px] font-semibold text-slate-600">الكانتين</span>
                <span className="text-xs font-bold text-teal-800">
                  {currencyFormatter.format(totalCanteenSales)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mb-1" />
                <span className="block text-[11px] font-semibold text-slate-600">اللحوم</span>
                <span className="text-xs font-bold text-emerald-800">
                  {currencyFormatter.format(totalMeatSales)}
                </span>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2">
                <span className="inline-block h-2 w-2 rounded-full bg-cyan-600 mb-1" />
                <span className="block text-[11px] font-semibold text-slate-600">العيادة</span>
                <span className="text-xs font-bold text-cyan-800">
                  {currencyFormatter.format(totalClinicExpenses)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

