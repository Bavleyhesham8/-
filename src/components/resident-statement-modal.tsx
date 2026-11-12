"use client";

import { useMemo } from "react";
import type { Resident } from "@/lib/demo-data";
import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";
import type { TreatmentBundle } from "@/lib/treatment-types";
import type { ResidentFinanceBundle } from "@/lib/resident-finance-types";
import { formatDate } from "@/lib/date-format";
import PrintBrand from "@/components/print-brand";
import { printDocument } from "@/lib/print";
import { findRecordForResident } from "@/lib/resident-matching";

type Props = {
  resident: Resident;
  sales?: CanteenSalesBundle;
  treatment?: TreatmentBundle;
  residentFinance?: ResidentFinanceBundle;
  onClose: () => void;
};

type LedgerItem = {
  id: string;
  date: string;
  type: "deposit" | "canteen" | "medication";
  typeLabel: string;
  description: string;
  debit: number; // مدين (عليه)
  credit: number; // دائن (له / مقبوضات)
  status: string;
};

const currencyFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

export default function ResidentStatementModal({
  resident,
  sales,
  treatment,
  residentFinance,
  onClose,
}: Props) {
  // 1. تجميع المقبوضات والأمانات (له - Credit)
  const deposits = useMemo(() => {
    if (!residentFinance) return [];
    const record = findRecordForResident(resident, residentFinance.records);
    if (!record) return [];
    return record.entries
      .filter((e) => !e.voided && e.amount)
      .map(
        (e): LedgerItem => ({
          id: `dep-${e.id}`,
          date: e.transactionDate || "",
          type: "deposit",
          typeLabel: "سند قبض / أمانات",
          description: `إيداع نقدي لحساب النزيل ${e.returnDate ? `(تاريخ الاستحقاق: ${formatDate(e.returnDate)})` : ""}`,
          debit: 0,
          credit: e.amount || 0,
          status: "مقبوض",
        }),
      );
  }, [residentFinance, resident]);

  // 2. تجميع فواتير الكانتين (عليه - Debit)
  const canteenPurchases = useMemo(() => {
    if (!sales) return [];
    const matchedInvoices = sales.invoices.filter(
      (inv) => !inv.voided && inv.residentId === resident.id,
    );

    const items: LedgerItem[] = [];
    for (const inv of matchedInvoices) {
      for (const line of inv.lines || []) {
        items.push({
          id: `inv-${inv.invoiceNumber}-${line.id}`,
          date: inv.invoiceDate,
          type: "canteen",
          typeLabel: "مشتريات كانتين",
          description: `${line.itemName} (كمية: ${line.quantity} × ${line.unitPrice} ج.م)`,
          debit: line.total,
          credit: 0,
          status: "فاتورة مبيعات",
        });
      }
    }
    return items;
  }, [sales, resident]);

  const canteenPayments = useMemo(() => {
    if (!sales) return [];
    return sales.invoices
      .filter((invoice) => !invoice.voided && invoice.residentId === resident.id)
      .flatMap((invoice) => invoice.payments.map((payment): LedgerItem => ({
        id: `payment-${invoice.invoiceNumber}-${payment.id}`,
        date: payment.paymentDate,
        type: "deposit",
        typeLabel: payment.kind === "refund" ? "استرداد من فاتورة" : "سداد فاتورة كانتين",
        description: `فاتورة رقم ${invoice.invoiceNumber}`,
        debit: 0,
        credit: payment.kind === "refund" ? -payment.amount : payment.amount,
        status: payment.kind === "refund" ? "مسترد" : "مسدد",
      })));
  }, [sales, resident]);

  // 3. تجميع أدوية العيادة (عليه - Debit)
  const clinicMedications = useMemo(() => {
    if (!treatment) return [];
    const record = findRecordForResident(resident, treatment.records);
    if (!record) return [];
    return record.entries
      .filter((e) => !e.voided)
      .map(
        (e): LedgerItem => ({
          id: `med-${e.id}`,
          date: e.treatmentDate || "",
          type: "medication",
          typeLabel: "أدوية وعلاج",
          description: `${e.medicationName} (كمية: ${e.quantity} · سعر: ${e.amount} ج.م ${e.discount > 0 ? `· خصم: ${e.discount} ج.م` : ""})`,
          debit: e.total,
          credit: 0,
          status: "إذن صرف عيادة",
        }),
      );
  }, [treatment, resident]);

  // 4. دمج السجل الزمني
  const ledger = useMemo(() => {
    const combined = [...deposits, ...canteenPayments, ...canteenPurchases, ...clinicMedications];
    return combined.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [deposits, canteenPayments, canteenPurchases, clinicMedications]);

  const totalDeposits = useMemo(() => deposits.reduce((s, i) => s + i.credit, 0), [deposits]);
  const totalInvoicePayments = useMemo(() => canteenPayments.reduce((s, i) => s + i.credit, 0), [canteenPayments]);
  const totalCanteen = useMemo(() => canteenPurchases.reduce((s, i) => s + i.debit, 0), [canteenPurchases]);
  const totalMedications = useMemo(() => clinicMedications.reduce((s, i) => s + i.debit, 0), [clinicMedications]);
  const totalDebits = totalCanteen + totalMedications;
  const netBalance = totalDeposits + totalInvoicePayments - totalDebits; // موجب = رصيد له / سالب = مديونية عليه

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm print:p-0 print:bg-white"
      dir="rtl"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl print:max-h-none print:shadow-none print:rounded-none printable-document-content">
        <div className="statement-print-brand">
          <PrintBrand
            title="كشف الحساب المالي الموحد للنزيل"
            subtitle={`النزيل: ${resident.name} — رقم الملف: ${resident.fileNumber}`}
          />
        </div>
        {/* رأس التقرير / النافذة */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 p-6 text-white print:hidden">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-teal-500/20 px-2.5 py-0.5 text-xs font-semibold text-teal-200 print:text-black">
              <span>مركز قيثارة داود للتأهيل والتعافي</span>
            </div>
            <h2 className="mt-1 text-2xl font-black">
              كشف الحساب المالي الموحد للنزيل
            </h2>
            <p className="text-xs text-teal-100/90 print:text-slate-600">
              بيان شامل بكافة المقبوضات والأمانات ومشتريات الكانتين وأدوية العيادة
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={printDocument}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-teal-900 shadow-sm hover:bg-teal-50"
            >
              <span>🖨️</span>
              <span>طباعة كشف الحساب</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-xl bg-white/10 p-2 text-white hover:bg-white/20"
            >
              ✕
            </button>
          </div>
        </div>

        {/* بطاقة بيانات النزيل والملخص المالي */}
        <div className="overflow-y-auto p-6 space-y-6 print:overflow-visible print:p-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div>
              <span className="block text-xs text-slate-500 font-semibold">اسم النزيل</span>
              <strong className="text-sm font-bold text-slate-800">{resident.name}</strong>
            </div>
            <div>
              <span className="block text-xs text-slate-500 font-semibold">رقم الملف</span>
              <strong className="text-sm font-bold text-teal-800">{resident.fileNumber}</strong>
            </div>
            <div>
              <span className="block text-xs text-slate-500 font-semibold">الإقامة الحالية</span>
              <strong className="text-sm font-bold text-slate-800">
                {resident.villa ? `فيلا ${resident.villa}` : "بدون فيلا"} {resident.room ? `· غرفة ${resident.room}` : ""}
              </strong>
            </div>
            <div>
              <span className="block text-xs text-slate-500 font-semibold">حالة الإقامة</span>
              <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                {resident.status === "current" ? "مقيم حالياً" : "غادر المركز"}
              </span>
            </div>
          </div>

          {/* بطاقات الملخص المالي الثلاثية */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5 text-center">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <span className="block text-xs font-bold text-emerald-800 mb-1">إجمالي الأمانات المودعة (+)</span>
              <span className="text-xl font-black text-emerald-700">
                {currencyFormatter.format(totalDeposits)} ج.م
              </span>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
              <span className="block text-xs font-bold text-blue-800 mb-1">مسددات فواتير الكانتين</span>
              <span className="text-xl font-black text-blue-700">
                {currencyFormatter.format(totalInvoicePayments)} ج.م
              </span>
            </div>

            <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
              <span className="block text-xs font-bold text-teal-800 mb-1">مشتريات الكانتين (-)</span>
              <span className="text-xl font-black text-teal-700">
                {currencyFormatter.format(totalCanteen)} ج.م
              </span>
            </div>

            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4">
              <span className="block text-xs font-bold text-cyan-800 mb-1">أدوية العيادة (-)</span>
              <span className="text-xl font-black text-cyan-700">
                {currencyFormatter.format(totalMedications)} ج.م
              </span>
            </div>

            <div
              className={`rounded-2xl border p-4 shadow-sm ${
                netBalance >= 0
                  ? "border-emerald-300 bg-emerald-100/70 text-emerald-950"
                  : "border-rose-300 bg-rose-100/70 text-rose-950"
              }`}
            >
              <span className="block text-xs font-bold mb-1">
                {netBalance >= 0 ? "صافي الرصيد المتبقي له (أمانات)" : "صافي المديونية المستحقة عليه"}
              </span>
              <span className="text-2xl font-black">
                {currencyFormatter.format(Math.abs(netBalance))} ج.م
              </span>
            </div>
          </div>

          {/* جدول الحركات التفصيلي الموحد */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-100/80 px-4 py-3 border-b border-slate-200">
              <h4 className="text-sm font-bold text-slate-800">
                سجل الحركات التفصيلي (الماليات · الكانتين · العيادة)
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="p-3 font-semibold">التاريخ</th>
                    <th className="p-3 font-semibold">النوع</th>
                    <th className="p-3 font-semibold">البيان والتفاصيل</th>
                    <th className="p-3 font-semibold text-rose-700">مدين (منصرف)</th>
                    <th className="p-3 font-semibold text-emerald-700">دائن (مقبوض)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        لا توجد أي حركات مالية أو مشتريات مسجلة لهذا النزيل حتى الآن.
                      </td>
                    </tr>
                  ) : (
                    ledger.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="p-3 text-slate-600">{item.date ? formatDate(item.date) : "—"}</td>
                        <td className="p-3">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              item.type === "deposit"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.type === "canteen"
                                  ? "bg-teal-100 text-teal-800"
                                  : "bg-cyan-100 text-cyan-800"
                            }`}
                          >
                            {item.typeLabel}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-800">{item.description}</td>
                        <td className="p-3 font-bold text-rose-700">
                          {item.debit > 0 ? `${currencyFormatter.format(item.debit)} ج.م` : "—"}
                        </td>
                        <td className="p-3 font-bold text-emerald-700">
                          {item.credit > 0 ? `${currencyFormatter.format(item.credit)} ج.م` : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

