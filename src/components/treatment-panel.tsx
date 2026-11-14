"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  editTreatmentEntryAction,
  recordTreatmentEntryAction,
  voidTreatmentEntryAction,
} from "@/app/actions/treatment";
import { formatDate, localDateValue } from "@/lib/date-format";
import ResidentPicker from "@/components/resident-picker";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
import { buildResidentAccount } from "@/lib/resident-account";
import { findResidentByName } from "@/lib/resident-matching";
import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";
import type { Resident } from "@/lib/demo-data";
import type { ResidentFinanceBundle } from "@/lib/resident-finance-types";
import type { TreatmentBundle, TreatmentDetailEntry } from "@/lib/treatment-types";

type Props = {
  bundle: TreatmentBundle;
  residents: Resident[];
  residentFinance?: ResidentFinanceBundle;
  sales?: CanteenSalesBundle;
  canManage: boolean;
  onBundleChange: (bundle: TreatmentBundle) => void;
  onOpenStatement?: (resident: Resident) => void;
};

type VoidTarget = {
  detailId: number;
  medicationName: string;
  residentName: string;
};

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

export default function TreatmentPanel({
  bundle,
  residents,
  residentFinance,
  sales,
  canManage,
  onBundleChange,
  onOpenStatement,
}: Props) {
  const [selectedResidentNumber, setSelectedResidentNumber] = useState("");
  const [selectedResidentName, setSelectedResidentName] = useState("");
  const [selectedResidentId, setSelectedResidentId] = useState("");

  const [medicationName, setMedicationName] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [treatmentDate, setTreatmentDate] = useState(localDateValue());

  const [search, setSearch] = useState("");
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [editTarget, setEditTarget] = useState<TreatmentDetailEntry | null>(null);
  const [editMedicationName, setEditMedicationName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editQuantity, setEditQuantity] = useState("1");
  const [editDiscount, setEditDiscount] = useState("0");
  const [editDate, setEditDate] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const allEntries = useMemo(
    () => [
      ...bundle.records.flatMap((record) =>
        record.entries.map((entry) => ({
          ...entry,
          residentLabel: `${record.residentName || "—"} (${record.residentNumber})`,
        })),
      ),
      ...bundle.unassignedEntries.map((entry) => ({
        ...entry,
        residentLabel: "غير مرتبط بنزيل",
      })),
    ],
    [bundle],
  );

  const totalMedicationBilled = useMemo(
    () =>
      allEntries.reduce(
        (sum, entry) => (!entry.voided ? sum + (entry.total || 0) : sum),
        0,
      ),
    [allEntries],
  );

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return bundle.records;
    const term = search.trim().toLowerCase();
    return bundle.records.filter(
      (r) =>
        r.residentName?.toLowerCase().includes(term) ||
        r.residentNumber.toString().includes(term) ||
        r.entries.some((e) => e.medicationName.toLowerCase().includes(term)),
    );
  }, [bundle.records, search]);
  const filteredMedicationTotal = filteredRecords.reduce(
    (total, record) => total + record.entries.reduce((sum, entry) => sum + (!entry.voided ? entry.total : 0), 0),
    0,
  );

  const selectedResident = useMemo(
    () => residents.find((resident) => resident.id === selectedResidentId) ?? null,
    [residents, selectedResidentId],
  );

  const selectedAccount = useMemo(
    () =>
      selectedResident
        ? buildResidentAccount(selectedResident, {
            residentFinance,
            sales,
            treatment: bundle,
          })
        : null,
    [selectedResident, residentFinance, sales, bundle],
  );

  const recordAccounts = useMemo(() => {
    const accounts = new Map<
      number,
      { resident: Resident; balance: number; treatment: number }
    >();
    for (const record of bundle.records) {
      const resident =
        residents.find((item) => item.id === record.residentId) ??
        findResidentByName(record.residentName, residents, record.residentNumber)
          ?.resident ??
        null;
      if (!resident) continue;
      const account = buildResidentAccount(resident, {
        residentFinance,
        sales,
        treatment: bundle,
      });
      accounts.set(record.residentNumber, {
        resident,
        balance: account.balance,
        treatment: account.treatment,
      });
    }
    return accounts;
  }, [bundle, residents, residentFinance, sales]);

  const liveCalculatedTotal = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    const qty = parseFloat(quantity) || 0;
    const disc = parseFloat(discount) || 0;
    return Math.max(0, amt * qty - disc);
  }, [amount, quantity, discount]);

  const projectedBalance = selectedAccount
    ? selectedAccount.balance - liveCalculatedTotal
    : null;

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const parsedNumber = Number(selectedResidentNumber);
    const parsedAmount = parseFloat(amount);
    const parsedQuantity = parseFloat(quantity);
    const parsedDiscount = parseFloat(discount || "0");

    if (!selectedResidentNumber || !Number.isInteger(parsedNumber)) {
      setError("يرجى اختيار النزيل.");
      return;
    }
    if (!medicationName.trim()) {
      setError("يرجى إدخال اسم الدواء.");
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("أدخل سعر دواء صحيح موجب.");
      return;
    }
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      setError("أدخل كمية صحيحة.");
      return;
    }

    setSaving(true);
    try {
      const result = await recordTreatmentEntryAction({
        residentNumber: parsedNumber,
        residentName: selectedResidentName,
        medicationName: medicationName.trim(),
        amount: parsedAmount,
        quantity: parsedQuantity,
        discount: isNaN(parsedDiscount) ? 0 : parsedDiscount,
        treatmentDate,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onBundleChange(result.bundle);
      setMedicationName("");
      setAmount("");
      setQuantity("1");
      setDiscount("0");
      setMessage("تم تسجيل صرف الدواء بنجاح.");
    } catch {
      setError("تعذر تسجيل صرف الدواء.");
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    const parsedAmount = Number(editAmount);
    const parsedQuantity = Number(editQuantity);
    const parsedDiscount = Number(editDiscount || 0);
    if (!editMedicationName.trim() || parsedAmount <= 0 || parsedQuantity <= 0 || parsedDiscount < 0 || parsedDiscount > parsedAmount * parsedQuantity || !editDate) {
      setError("راجع اسم الدواء والسعر والكمية والخصم والتاريخ.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await editTreatmentEntryAction({
        id: editTarget.id,
        medicationName: editMedicationName.trim(),
        amount: parsedAmount,
        quantity: parsedQuantity,
        discount: parsedDiscount,
        treatmentDate: editDate,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onBundleChange(result.bundle);
      setEditTarget(null);
      setMessage("تم حفظ تعديل قيد العلاج.");
    } catch {
      setError("تعذر حفظ تعديل قيد العلاج.");
    } finally {
      setSaving(false);
    }
  }

  async function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!voidTarget) return;

    if (!voidReason.trim() || voidReason.trim().length < 3) {
      setError("سبب الإلغاء مطلوب ويجب ألا يقل عن 3 أحرف.");
      return;
    }

    setSaving(true);
    try {
      const result = await voidTreatmentEntryAction({
        id: voidTarget.detailId,
        voidReason: voidReason.trim(),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onBundleChange(result.bundle);
      setVoidTarget(null);
      setVoidReason("");
      setMessage("تم إلغاء قيد الدواء بنجاح وحفظ سبب الإلغاء في سجل التدقيق.");
    } catch {
      setError("تعذر إلغاء قيد الدواء.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="treatment-panel space-y-6 text-right" dir="rtl">
      <PrintBrand
        title="تقرير صرف أدوية النزلاء"
        subtitle="صرف الدواء يُخصم من حساب النزيل ويظهر في كشف الحساب"
        meta={[
          { label: "البحث", value: search.trim() || "الكل" },
          {
            label: "عدد النزلاء",
            value: numberFormatter.format(filteredRecords.length),
          },
          {
            label: "إجمالي النتائج",
            value: `${numberFormatter.format(filteredMedicationTotal)} ج.م`,
          },
        ]}
      />

      {/* رأس اللوحة */}
      <div className="no-print rounded-2xl border border-teal-200/60 bg-gradient-to-r from-teal-50/70 via-emerald-50/40 to-teal-50/70 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">

              <span>العيادة والصيدلية</span>
            </div>
            <h2 className="mt-2 text-2xl font-bold text-slate-800">
              صرف أدوية النزلاء
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              تسجيل صرف الدواء مباشرة على حساب النزيل، مع إظهار الرصيد قبل
              الصرف وبعده وكشف حساب موحد للكانتين والعلاج.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-center">
            <div className="rounded-xl border border-teal-200 bg-white px-4 py-2.5 shadow-xs">
              <span className="block text-xs text-slate-500">النزلاء بالعيادة</span>
              <span className="text-xl font-bold text-teal-700">
                {numberFormatter.format(bundle.records.length)}
              </span>
            </div>
            <div className="rounded-xl border border-teal-200 bg-white px-4 py-2.5 shadow-xs">
              <span className="block text-xs text-slate-500">إجمالي الأدوية المصروفة</span>
              <span className="text-xl font-bold text-emerald-700">
                {numberFormatter.format(totalMedicationBilled)} ج.م
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* التنبيهات والرسائل */}
      {error && (
        <div className="no-print rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          ⚠️ {error}
        </div>
      )}
      {message && (
        <div className="no-print rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          ✓ {message}
        </div>
      )}

      {/* اختيار النزيل وتسجيل صرف الدواء مباشرة */}
      {canManage && <div className="no-print grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* اختيار النزيل */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-5">
          <h3 className="mb-3 text-base font-bold text-slate-800">اختيار النزيل</h3>
          <ResidentPicker
            residents={residents}
            value={selectedResidentName}
            onChange={(value, resident) => {
              setSelectedResidentName(value);
              setSelectedResidentNumber(resident?.residentNumber ?? "");
              setSelectedResidentId(resident?.id ?? "");
            }}
            placeholder="ابحث باسم النزيل أو رقم الملف..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-hidden"
            disabled={saving}
          />
          {selectedResidentName && !selectedResidentNumber && <p className="form-error">ملف هذا النزيل غير مرتبط برقم سجل علاجي.</p>}
          {selectedAccount && (
            <div className="mt-4 space-y-2 rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">إجمالي أدوية النزيل</span>
                <strong className="text-teal-800">
                  {numberFormatter.format(selectedAccount.treatment)} ج.م
                </strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">الرصيد الحالي في الحساب</span>
                <strong
                  className={
                    selectedAccount.balance < 0
                      ? "text-rose-700"
                      : "text-emerald-700"
                  }
                >
                  {numberFormatter.format(selectedAccount.balance)} ج.م
                </strong>
              </div>
              <p
                className={`text-xs ${
                  selectedAccount.balance < 0
                    ? "text-rose-700"
                    : "text-teal-800"
                }`}
              >
                {selectedAccount.balance < 0
                  ? "الرصيد سالب (مديونية مسموحة)، وسيُضاف مبلغ الصرف إليه."
                  : "سيُخصم مبلغ الصرف من الرصيد فور التسجيل."}
              </p>
              {onOpenStatement && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onOpenStatement(selectedAccount.resident)}
                >
                  كشف حساب النزيل
                </button>
              )}
            </div>
          )}
        </div>

        {/* صرف دواء */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7">
          <h3 className="mb-3 text-base font-bold text-slate-800">
            تسجيل صرف دواء للنزيل
          </h3>
          {selectedAccount && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs">
              <span className="text-slate-600">
                رصيد النزيل الحالي:{" "}
                <strong
                  className={
                    selectedAccount.balance < 0
                      ? "text-rose-700"
                      : "text-emerald-700"
                  }
                >
                  {numberFormatter.format(selectedAccount.balance)} ج.م
                </strong>
              </span>
              <span className="text-slate-600">
                إجمالي أدويته:{" "}
                <strong className="text-teal-800">
                  {numberFormatter.format(selectedAccount.treatment)} ج.م
                </strong>
              </span>
            </div>
          )}
          <form onSubmit={submitEntry} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  النزيل:
                </label>
                <span className="block rounded-lg border border-slate-200 px-3 py-2 text-sm">{selectedResidentName || "اختر النزيل من الحقل المجاور"}</span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  تاريخ الصرف:
                </label>
                <input
                  type="date"
                  value={treatmentDate}
                  onChange={(e) => setTreatmentDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-hidden"
                  disabled={saving}
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                اسم الدواء / العلاج:
              </label>
              <input
                type="text"
                value={medicationName}
                onChange={(e) => setMedicationName(e.target.value)}
                placeholder="مثال: أولابكس 5مجم - OLAPEX5mg أو تجريتول"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-hidden"
                disabled={saving}
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  السعر (ج.م):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-hidden"
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  الكمية:
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-hidden"
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  الخصم (ج.م):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-hidden"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-1 rounded-lg border border-teal-200 bg-teal-50/80 px-4 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-900">
                  الإجمالي المستحق للصرف:
                </span>
                <span className="text-base font-extrabold text-teal-800">
                  {numberFormatter.format(liveCalculatedTotal)} ج.م
                </span>
              </div>
              {projectedBalance !== null && (
                <div className="flex items-center justify-between border-t border-teal-200/60 pt-1">
                  <span className="text-xs font-semibold text-slate-600">
                    رصيد الحساب بعد الصرف:
                  </span>
                  <strong
                    className={
                      projectedBalance < 0
                        ? "text-rose-700"
                        : "text-emerald-700"
                    }
                  >
                    {numberFormatter.format(projectedBalance)} ج.م
                  </strong>
                </div>
              )}
              {projectedBalance !== null && projectedBalance < 0 && (
                <p className="text-[11px] font-semibold text-rose-700">
                  سيصبح الرصيد سالبًا (مديونية على النزيل) ويُسمح بالصرف.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "جاري التسجيل..." : "تسجيل صرف الدواء"}
            </button>
          </form>
        </div>
      </div>}

      {/* سجلات وأذون علاج النزلاء */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-bold text-slate-800">
            سجلات وأذون صرف أدوية النزلاء
          </h3>
          <div className="no-print w-full sm:w-72">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="بحث بالنزيل أو رقمه أو اسم الدواء..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-hidden"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm">إجمالي نتائج البحث: <strong>{numberFormatter.format(filteredMedicationTotal)} ج.م</strong></span>
            <button type="button" className="secondary-button no-print" onClick={printCurrentView}>طباعة التقرير</button>
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            لا توجد سجلات علاج مطابقة للبحث.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRecords.map((record) => (
              <div
                key={record.residentNumber}
                className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40"
              >
                <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800">
                      رقم {record.residentNumber}
                    </span>
                    <span className="font-bold text-slate-800">
                      {record.residentName || "نزيل بدون اسم"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-sm font-semibold text-slate-700">
                      إجمالي الأدوية:{" "}
                      <span className="font-bold text-teal-700">
                        {numberFormatter.format(record.totalBilled)} ج.م
                      </span>
                    </div>
                    {recordAccounts.get(record.residentNumber) && (
                      <>
                        <div className="text-sm font-semibold text-slate-700">
                          الرصيد الحالي:{" "}
                          <span
                            className={
                              (recordAccounts.get(record.residentNumber)
                                ?.balance ?? 0) < 0
                                ? "font-bold text-rose-700"
                                : "font-bold text-emerald-700"
                            }
                          >
                            {numberFormatter.format(
                              recordAccounts.get(record.residentNumber)
                                ?.balance ?? 0,
                            )}{" "}
                            ج.م
                          </span>
                        </div>
                        {onOpenStatement && (
                          <button
                            className="secondary-button no-print"
                            type="button"
                            onClick={() => {
                              const account = recordAccounts.get(
                                record.residentNumber,
                              );
                              if (account) onOpenStatement(account.resident);
                            }}
                          >
                            كشف الحساب
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto p-3">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="pb-2 font-semibold">التاريخ</th>
                        <th className="pb-2 font-semibold">اسم الدواء</th>
                        <th className="pb-2 font-semibold">السعر</th>
                        <th className="pb-2 font-semibold">الكمية</th>
                        <th className="pb-2 font-semibold">الخصم</th>
                        <th className="pb-2 font-semibold">الإجمالي</th>
                        <th className="pb-2 font-semibold">الحالة</th>
                        <th className="pb-2 text-left font-semibold">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {record.entries.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-4 text-center text-slate-400">
                            لم يتم تسجيل أدوية لهذا النزيل بعد.
                          </td>
                        </tr>
                      ) : (
                        record.entries.map((entry) => (
                          <tr
                            key={entry.id}
                            className={`hover:bg-white ${
                              entry.voided ? "bg-rose-50/40 text-slate-400 line-through" : ""
                            }`}
                          >
                            <td className="py-2.5">{entry.treatmentDate ? formatDate(entry.treatmentDate) : "—"}</td>
                            <td className="py-2.5 font-medium text-slate-800">{entry.medicationName}</td>
                            <td className="py-2.5">{numberFormatter.format(entry.amount)} ج.م</td>
                            <td className="py-2.5">{entry.quantity}</td>
                            <td className="py-2.5 text-amber-700">
                              {entry.discount > 0 ? `${numberFormatter.format(entry.discount)} ج.م` : "—"}
                            </td>
                            <td className="py-2.5 font-bold text-teal-800">
                              {numberFormatter.format(entry.total)} ج.م
                            </td>
                            <td className="py-2.5">
                              {entry.voided ? (
                                <span className="inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 no-underline" title={entry.voidReason}>
                                  ملغي: {entry.voidReason}
                                </span>
                              ) : (
                                <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                                  سارٍ
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 text-left">
                              {canManage && !entry.voided && (
                                <div className="flex flex-wrap justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditTarget(entry);
                                    setEditMedicationName(entry.medicationName);
                                    setEditAmount(String(entry.amount));
                                    setEditQuantity(String(entry.quantity));
                                    setEditDiscount(String(entry.discount));
                                    setEditDate(entry.treatmentDate ?? "");
                                    setError("");
                                  }}
                                  className="rounded border border-teal-200 bg-white px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50"
                                >تعديل</button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setVoidTarget({
                                      detailId: entry.id,
                                      medicationName: entry.medicationName,
                                      residentName: record.residentName || "النزيل",
                                    })
                                  }
                                  className="rounded border border-rose-200 bg-white px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50"
                                >
                                  إلغاء القيد
                                </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* نافذة تأكيد الإلغاء (Void Modal) */}
      {canManage && editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={submitEdit} className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-6 shadow-xl">
            <h4 className="text-lg font-bold text-teal-800">تعديل قيد العلاج</h4>
            <label className="form-field">اسم الدواء<input required maxLength={250} value={editMedicationName} onChange={(event) => setEditMedicationName(event.target.value)} /></label>
            <label className="form-field">السعر<input required type="number" min="0.01" step="any" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} /></label>
            <label className="form-field">الكمية<input required type="number" min="0.01" step="any" value={editQuantity} onChange={(event) => setEditQuantity(event.target.value)} /></label>
            <label className="form-field">الخصم<input required type="number" min="0" step="any" value={editDiscount} onChange={(event) => setEditDiscount(event.target.value)} /></label>
            <label className="form-field">تاريخ الصرف<input required type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label>
            <div className="flex gap-2"><button className="primary-button" disabled={saving} type="submit">حفظ التعديل</button><button className="secondary-button" disabled={saving} onClick={() => setEditTarget(null)} type="button">إلغاء</button></div>
          </form>
        </div>
      )}
      {canManage && voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h4 className="text-lg font-bold text-rose-700">إلغاء صرف دواء</h4>
            <p className="mt-2 text-sm text-slate-600">
              أنت على وشك إلغاء صرف دواء &quot;{voidTarget.medicationName}&quot; للنزيل &quot;{voidTarget.residentName}&quot;.
              سيتم الاحتفاظ بالعملية لأغراض التدقيق مع استبعاد المبلغ من الإجمالي.
            </p>
            <form onSubmit={submitVoid} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  سبب الإلغاء (إلزامي):
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="مثال: خطأ في إدخال الجرعة / تم إرجاع العبوة للصيدلية"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-rose-500 focus:outline-hidden"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {saving ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVoidTarget(null);
                    setVoidReason("");
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  تراجع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
