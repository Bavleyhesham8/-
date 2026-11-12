"use client";

import { useMemo, useState } from "react";
import type { Resident } from "@/lib/demo-data";
import { canonicalVilla } from "@/lib/stay-location";
import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";
import type { MeatSalesBundle } from "@/lib/meat-sales-types";
import type { TreatmentBundle } from "@/lib/treatment-types";
import type { ResidentFinanceBundle } from "@/lib/resident-finance-types";
import type { LookupData } from "@/lib/lookup-types";

type Props = {
  residents: Resident[];
  sales?: CanteenSalesBundle;
  meatSales?: MeatSalesBundle;
  treatment?: TreatmentBundle;
  residentFinance?: ResidentFinanceBundle;
  lookups: LookupData;
  visibleViews: readonly string[];
  onNavigate: (view: string, tab?: string) => void;
};

type TrendRange = "30d" | "90d" | "12m";
type TrendKey = "sales" | "clinic" | "receipts";

type TrendBucket = { key: string; label: string };

function trendDateKey(value: string | null | undefined, monthly: boolean) {
  if (!value) return null;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return monthly ? date.slice(0, 7) : date;
}

function createTrendBuckets(range: TrendRange, now = new Date()): TrendBucket[] {
  if (range === "12m") {
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: new Intl.DateTimeFormat("ar-EG", { month: "short" }).format(date),
      };
    });
  }
  const length = range === "30d" ? 30 : 90;
  return Array.from({ length }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - length + index + 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "numeric" }).format(date),
    };
  });
}

function sumByTrendBucket(
  buckets: TrendBucket[],
  entries: { date: string | null | undefined; amount: number }[],
  monthly: boolean,
) {
  const totals = new Map(buckets.map((bucket) => [bucket.key, 0]));
  for (const entry of entries) {
    const key = trendDateKey(entry.date, monthly);
    if (key && totals.has(key) && Number.isFinite(entry.amount)) {
      totals.set(key, (totals.get(key) ?? 0) + entry.amount);
    }
  }
  return buckets.map((bucket) => totals.get(bucket.key) ?? 0);
}

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
  lookups,
  visibleViews,
  onNavigate,
}: Props) {
  const canNavigate = (view: string) => visibleViews.includes(view);
  const [trendRange, setTrendRange] = useState<TrendRange>("30d");
  const [enabledTrends, setEnabledTrends] = useState<TrendKey[]>([
    "sales",
    "clinic",
    "receipts",
  ]);
  // 1. حسابات النزلاء والإشغال
  const activeResidents = useMemo(() => residents.filter((r) => !r.archived), [residents]);
  const currentResidents = useMemo(() => activeResidents.filter((r) => r.status === "current"), [activeResidents]);
  const departedCount = useMemo(() => activeResidents.filter((r) => r.status === "departed").length, [activeResidents]);

  // إشغال الفلل
  const villaStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of lookups.villas) {
      const key = canonicalVilla(v.villaNumber);
      if (key) counts[key] = 0;
    }
    for (const r of currentResidents) {
      if (r.villa) {
        const key = canonicalVilla(r.villa);
        if (key) counts[key] = (counts[key] || 0) + 1;
      }
    }
    return Object.entries(counts).map(([name, count]) => ({
      name: `فيلا ${name}`,
      count,
      share: currentResidents.length
        ? Math.round((count / currentResidents.length) * 100)
        : 0,
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

  const totalResidentReceipts = useMemo(() => {
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

  const residentReceiptCount = useMemo(() => {
    if (!residentFinance) return 0;
    return residentFinance.records.reduce(
      (sum, record) => sum + record.entries.filter((entry) => !entry.voided).length,
      0,
    );
  }, [residentFinance]);

  const grandRevenue = totalCanteenSales + totalMeatSales;
  const trendBuckets = useMemo(() => createTrendBuckets(trendRange), [trendRange]);
  const trendSeries = useMemo(() => {
    const monthly = trendRange === "12m";
    const salesEvents = [
      ...(sales?.invoices ?? [])
        .filter((invoice) => !invoice.voided)
        .map((invoice) => ({
          date: invoice.invoiceDate,
          amount: invoice.lines.reduce((sum, line) => sum + (line.total || 0), 0),
        })),
      ...(meatSales?.invoices ?? [])
        .filter((invoice) => !invoice.voided)
        .map((invoice) => ({
          date: invoice.saleDate,
          amount: invoice.lines.reduce((sum, line) => sum + (line.total || 0), 0),
        })),
    ];
    const clinicEvents = (treatment?.records ?? []).flatMap((record) =>
      record.entries
        .filter((entry) => !entry.voided)
        .map((entry) => ({ date: entry.treatmentDate, amount: entry.total })),
    );
    const receiptEvents = (residentFinance?.records ?? []).flatMap((record) =>
      record.entries
        .filter((entry) => !entry.voided && entry.amount !== null)
        .map((entry) => ({ date: entry.transactionDate, amount: entry.amount ?? 0 })),
    );
    return [
      {
        key: "sales" as const,
        label: "مبيعات الكانتين واللحوم",
        color: "#0f766e",
        values: sumByTrendBucket(trendBuckets, salesEvents, monthly),
      },
      {
        key: "clinic" as const,
        label: "مطالبات العلاج",
        color: "#0284c7",
        values: sumByTrendBucket(trendBuckets, clinicEvents, monthly),
      },
      {
        key: "receipts" as const,
        label: "مقبوضات النزلاء",
        color: "#b45309",
        values: sumByTrendBucket(trendBuckets, receiptEvents, monthly),
      },
    ];
  }, [trendBuckets, trendRange, sales, meatSales, treatment, residentFinance]);
  const visibleTrendSeries = trendSeries.filter((series) =>
    enabledTrends.includes(series.key),
  );
  const trendScaleMax = Math.max(
    1,
    ...visibleTrendSeries.flatMap((series) => series.values),
  );
  const chart = { width: 720, height: 280, left: 54, right: 14, top: 18, bottom: 48 };
  const chartX = (index: number) =>
    chart.left +
    (index * (chart.width - chart.left - chart.right)) /
      Math.max(1, trendBuckets.length - 1);
  const chartY = (value: number) =>
    chart.height -
    chart.bottom -
    (value / trendScaleMax) * (chart.height - chart.top - chart.bottom);

  return (
    <div className="space-y-8" dir="rtl">
      {/* البانر الترحيبي الإداري */}
      <div className="relative overflow-hidden rounded-3xl border border-white/40 bg-gradient-to-r from-teal-900/90 via-teal-800/85 to-slate-900/90 p-8 text-white shadow-xl backdrop-blur-md">
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/30 bg-teal-500/20 px-3.5 py-1 text-xs font-semibold text-teal-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>لوحة النظرة العامة · ملخص السجلات المتاحة</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              مركز قيثارة داود للتأهيل والتعافي
            </h1>
            <p className="max-w-2xl text-sm text-teal-100/90 leading-relaxed">
              ملخص الإقامة والفلل، ومبيعات الكانتين واللحوم، ومطالبات العلاج، ومقبوضات النزلاء المسجلة.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {canNavigate("residents") && (
              <button
                onClick={() => onNavigate("residents")}
                className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-teal-900 shadow-md transition hover:bg-teal-50"
              >
                إدارة النزلاء
              </button>
            )}
            {canNavigate("sales") && (
              <button
                onClick={() => onNavigate("sales", "history")}
                className="rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                سجل فواتير الكانتين
              </button>
            )}
          </div>
        </div>

        {/* دوائر جمالية ناعمة في الخلفية */}
        <div className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 right-1/4 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl" />
      </div>

      {/* بطاقات المؤشرات الرئيسية (Executive KPI Cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* بطاقة النزلاء والإشغال */}
        <div
          onClick={
            canNavigate("residents")
              ? () => onNavigate("residents")
              : undefined
          }
          className={`group rounded-2xl border border-white/60 bg-white/95 p-5 shadow-sm backdrop-blur-md ${
            canNavigate("residents")
              ? "cursor-pointer transition hover:-translate-y-1 hover:border-teal-400 hover:shadow-md"
              : ""
          }`}
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
          onClick={
            canNavigate("sales")
              ? () => onNavigate("sales", "history")
              : undefined
          }
          className={`group rounded-2xl border border-white/60 bg-white/95 p-5 shadow-sm backdrop-blur-md ${
            canNavigate("sales")
              ? "cursor-pointer transition hover:-translate-y-1 hover:border-emerald-400 hover:shadow-md"
              : ""
          }`}
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
          onClick={
            canNavigate("treatment")
              ? () => onNavigate("treatment")
              : undefined
          }
          className={`group rounded-2xl border border-white/60 bg-white/95 p-5 shadow-sm backdrop-blur-md ${
            canNavigate("treatment")
              ? "cursor-pointer transition hover:-translate-y-1 hover:border-cyan-400 hover:shadow-md"
              : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">إجمالي العلاج غير الملغى</span>
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
            <span className="text-teal-700">مطالبات مسجلة</span>
          </div>
        </div>

        {/* بطاقة أمانات وسندات النزلاء */}
        <div
          onClick={
            canNavigate("resident-finance")
              ? () => onNavigate("resident-finance")
              : undefined
          }
          className={`group rounded-2xl border border-white/60 bg-white/95 p-5 shadow-sm backdrop-blur-md ${
            canNavigate("resident-finance")
              ? "cursor-pointer transition hover:-translate-y-1 hover:border-amber-400 hover:shadow-md"
              : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">إجمالي المقبوضات المسجلة</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-xl text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition">
              🪙
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-800">
              {currencyFormatter.format(totalResidentReceipts)}
            </span>
            <span className="text-xs text-amber-900 font-bold">ج.م</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600 border-t border-slate-100 pt-2">
            <span>عدد الإيصالات: {residentReceiptCount}</span>
            <span className="text-emerald-700">إيصالات غير ملغاة</span>
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
                حصة النزلاء المقيمين في كل فيلا من إجمالي المقيمين
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
                      {item.count} نزيل ({item.share}%)
                    </span>
                  </div>
                  <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-700 transition-all duration-700"
                      style={{ width: `${item.count > 0 ? Math.max(4, item.share) : 0}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-sm backdrop-blur-md lg:col-span-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">اتجاهات النشاط المالي</h3>
              <p className="mt-1 text-xs text-slate-600">إجماليات يومية أو شهرية من السجلات غير الملغاة</p>
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1" aria-label="الفترة الزمنية للرسم">
              {([
                ["30d", "30 يومًا"],
                ["90d", "90 يومًا"],
                ["12m", "12 شهرًا"],
              ] as const).map(([range, label]) => (
                <button
                  key={range}
                  type="button"
                  aria-pressed={trendRange === range}
                  onClick={() => setTrendRange(range)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${trendRange === range ? "bg-teal-800 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2" aria-label="اختيار المؤشرات الظاهرة">
            {trendSeries.map((series) => {
              const active = enabledTrends.includes(series.key);
              const total = series.values.reduce((sum, value) => sum + value, 0);
              return (
                <button
                  key={series.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setEnabledTrends((current) => active
                    ? current.filter((key) => key !== series.key)
                    : [...current, series.key])}
                  className={`rounded-xl border px-3 py-2 text-start transition ${active ? "border-slate-200 bg-white shadow-sm" : "border-transparent bg-slate-50 opacity-60"}`}
                >
                  <span className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} />
                    {series.label}
                  </span>
                  <span className="mt-1 block text-xs font-black text-slate-900">{currencyFormatter.format(total)} ج.م</span>
                </button>
              );
            })}
          </div>

          <div className="relative mt-3 min-h-56">
            <svg className="h-64 w-full overflow-visible" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="رسم اتجاهات المبيعات والعلاج والمقبوضات حسب الفترة المحددة">
              {[0, 1, 2, 3, 4].map((step) => {
                const value = trendScaleMax * (4 - step) / 4;
                const y = chartY(value);
                return (
                  <g key={step}>
                    <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={step === 4 ? undefined : "3 5"} />
                    <text x={chart.left - 7} y={y + 4} textAnchor="end" fill="#64748b" fontSize="10">{numberFormatter.format(value)}</text>
                  </g>
                );
              })}
              {visibleTrendSeries.map((series) => {
                const points = series.values.map((value, index) => `${chartX(index)},${chartY(value)}`).join(" ");
                return (
                  <g key={series.key}>
                    <polyline points={points} fill="none" stroke={series.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    {series.values.map((value, index) => (
                      <circle key={`${series.key}-${index}`} cx={chartX(index)} cy={chartY(value)} r="3" fill={series.color} stroke="white" strokeWidth="1.5">
                        <title>{`${trendBuckets[index].label}: ${series.label} — ${currencyFormatter.format(value)} ج.م`}</title>
                      </circle>
                    ))}
                  </g>
                );
              })}
              {[0, Math.floor((trendBuckets.length - 1) / 2), trendBuckets.length - 1].map((index) => (
                <text key={index} x={chartX(index)} y={chart.height - 15} textAnchor="middle" fill="#475569" fontSize="10">{trendBuckets[index]?.label}</text>
              ))}
            </svg>
            {visibleTrendSeries.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-500">اختر مؤشرًا واحدًا على الأقل لعرض الرسم.</div>
            )}
            {visibleTrendSeries.length > 0 && !visibleTrendSeries.some((series) => series.values.some((value) => value > 0)) && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-xs font-semibold text-slate-500">لا توجد حركات مسجلة في هذه الفترة.</div>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">المبيعات إجمالي بيع وليست ربحًا، والعلاج مطالبات مسجلة، والمقبوضات إيصالات غير ملغاة. اضغط على أسماء المؤشرات لإظهارها أو إخفائها.</p>
        </div>
      </div>
    </div>
  );
}
