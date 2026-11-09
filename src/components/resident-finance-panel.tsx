"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  createResidentFinanceHeaderAction,
  recordResidentReceiptAction,
  voidResidentReceiptAction,
} from "@/app/actions/resident-finance";
import { formatDate, localDateValue } from "@/lib/date-format";
import type {
  ResidentFinanceBundle,
  ResidentFinanceEntry,
} from "@/lib/resident-finance-types";

type Props = {
  bundle: ResidentFinanceBundle;
  persistent: boolean;
  canManage: boolean;
  onBundleChange: (bundle: ResidentFinanceBundle) => void;
};

type VoidTarget = {
  detailId: number;
  residentName: string;
};

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

function nextEntryId(entries: ResidentFinanceEntry[]) {
  return Math.max(0, ...entries.map((entry) => entry.id)) + 1;
}

export default function ResidentFinancePanel({
  bundle,
  persistent,
  canManage,
  onBundleChange,
}: Props) {
  const [residentNumber, setResidentNumber] = useState("");
  const [residentName, setResidentName] = useState("");
  const [selectedResidentNumber, setSelectedResidentNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(localDateValue());
  const [returnDate, setReturnDate] = useState("");
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const [voidReason, setVoidReason] = useState("");
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
        residentLabel: "غير مرتبط بحساب نزيل",
      })),
    ],
    [bundle],
  );
  const receivedTotal = allEntries.reduce(
    (total, entry) =>
      total + (!entry.voided && entry.amount !== null ? entry.amount : 0),
    0,
  );

  async function submitHeader(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsedNumber = Number(residentNumber);
    if (
      !Number.isInteger(parsedNumber) ||
      parsedNumber <= 0 ||
      parsedNumber > 2_147_483_647 ||
      !residentName.trim()
    ) {
      setError("أدخل رقم نزيل موجبًا واسمه.");
      return;
    }
    if (bundle.records.some((record) => record.residentNumber === parsedNumber)) {
      setError("رقم النزيل مسجل بالفعل.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await createResidentFinanceHeaderAction({
          residentNumber: parsedNumber,
          residentName,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onBundleChange(result.bundle);
      } else {
        onBundleChange({
          ...bundle,
          records: [
            ...bundle.records,
            {
              residentNumber: parsedNumber,
              residentName: residentName.trim().normalize("NFC"),
              entries: [],
            },
          ].sort((left, right) => left.residentNumber - right.residentNumber),
        });
      }
      setSelectedResidentNumber(String(parsedNumber));
      setResidentNumber("");
      setResidentName("");
      setMessage("تم إنشاء سجل النزيل المالي.");
    } catch {
      setError("تعذر إنشاء السجل. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsedNumber = Number(selectedResidentNumber);
    const parsedAmount = Number(amount);
    if (
      !Number.isInteger(parsedNumber) ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0 ||
      !transactionDate
    ) {
      setError("اختر نزيلًا وأدخل مبلغًا موجبًا وتاريخ الإيصال.");
      return;
    }
    if (returnDate && returnDate < transactionDate) {
      setError("تاريخ التسوية المتوقع لا يمكن أن يسبق تاريخ الإيصال.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await recordResidentReceiptAction({
          residentNumber: parsedNumber,
          amount: parsedAmount,
          transactionDate,
          returnDate,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onBundleChange(result.bundle);
      } else {
        const entries = bundle.records.flatMap((record) => record.entries);
        const entry: ResidentFinanceEntry = {
          id: nextEntryId(entries),
          residentNumber: parsedNumber,
          amount: parsedAmount,
          transactionDate,
          returnDate: returnDate || null,
          voided: false,
          voidReason: "",
          voidedAt: null,
        };
        onBundleChange({
          ...bundle,
          records: bundle.records.map((record) =>
            record.residentNumber === parsedNumber
              ? { ...record, entries: [...record.entries, entry] }
              : record,
          ),
        });
      }
      setAmount("");
      setReturnDate("");
      setMessage("تم تسجيل الإيصال.");
    } catch {
      setError("تعذر تسجيل الإيصال. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!voidTarget || !voidReason.trim()) {
      setError("أدخل سببًا لإلغاء الإيصال.");
      return;
    }
    setError("");
    setMessage("");
    setSaving(true);
    try {
      if (persistent) {
        const result = await voidResidentReceiptAction({
          detailId: voidTarget.detailId,
          reason: voidReason,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onBundleChange(result.bundle);
      } else {
        const updateEntry = (entry: ResidentFinanceEntry) =>
          entry.id === voidTarget.detailId
            ? {
                ...entry,
                voided: true,
                voidReason: voidReason.trim(),
                voidedAt: new Date().toISOString(),
              }
            : entry;
        onBundleChange({
          records: bundle.records.map((record) => ({
            ...record,
            entries: record.entries.map(updateEntry),
          })),
          unassignedEntries: bundle.unassignedEntries.map(updateEntry),
        });
      }
      setVoidTarget(null);
      setVoidReason("");
      setMessage("تم إلغاء الإيصال مع الاحتفاظ بسجله؛ لم يُسجّل رد نقدي.");
    } catch {
      setError("تعذر إلغاء الإيصال. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-panel resident-finance-panel" dir="rtl">
      <div className="panel-heading">
        <div>
          <h3>السجلات المالية للنزلاء</h3>
          <p>
            سجل مستقل لجداول Access راس النزيل واطراف النزيل؛ لا يرتبط بسجل
            النزيل UUID ولا يستورد بيانات Access.
          </p>
        </div>
        <strong className="resident-finance-total">
          إجمالي الإيصالات غير الملغاة: {numberFormatter.format(receivedTotal)}
        </strong>
      </div>

      {!persistent && (
        <p className="lookup-demo-note">
          بيانات تجريبية فقط؛ التغييرات لا تُحفظ بعد تحديث الصفحة.
        </p>
      )}
      <p className="lookup-demo-note">
        الإدارة للمسؤول فقط. الإلغاء يحفظ السبب ولا يسجل استردادًا نقديًا.
      </p>

      {canManage && <div className="resident-finance-forms">
        <form className="lookup-form" onSubmit={submitHeader}>
          <h4>إضافة سجل نزيل مستقل</h4>
          <label className="form-field">
            رقم النزيل (يدوي)
            <input
              max={2_147_483_647}
              min={1}
              required
              type="number"
              value={residentNumber}
              onChange={(event) => setResidentNumber(event.target.value)}
            />
          </label>
          <label className="form-field">
            اسم النزيل
            <input
              maxLength={200}
              required
              value={residentName}
              onChange={(event) => setResidentName(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={saving} type="submit">
            إضافة سجل
          </button>
        </form>

        <form className="lookup-form" onSubmit={submitReceipt}>
          <h4>تسجيل إيصال</h4>
          <label className="form-field">
            النزيل
            <select
              required
              value={selectedResidentNumber}
              onChange={(event) => setSelectedResidentNumber(event.target.value)}
            >
              <option value="">اختر النزيل</option>
              {bundle.records.map((record) => (
                <option key={record.residentNumber} value={record.residentNumber}>
                  {record.residentName || "—"} — {record.residentNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            المبلغ المستلم
            <input
              min="0.01"
              required
              step="any"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="form-field">
            تاريخ الإيصال
            <input
              required
              type="date"
              value={transactionDate}
              onChange={(event) => setTransactionDate(event.target.value)}
            />
          </label>
          <label className="form-field">
            تاريخ التسوية المتوقع (اختياري)
            <input
              type="date"
              value={returnDate}
              onChange={(event) => setReturnDate(event.target.value)}
            />
          </label>
          <button
            className="primary-button"
            disabled={saving || !bundle.records.length}
            type="submit"
          >
            تسجيل الإيصال
          </button>
        </form>
      </div>}

      {error && (
        <p className="form-message form-message-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="form-message form-message-success" role="status">
          {message}
        </p>
      )}

      {canManage && voidTarget && (
        <form className="resident-finance-void-form" onSubmit={submitVoid}>
          <h4>إلغاء إيصال — {voidTarget.residentName}</h4>
          <label className="form-field">
            سبب الإلغاء
            <input
              autoFocus
              maxLength={500}
              required
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
            />
          </label>
          <button className="danger-button" disabled={saving} type="submit">
            تأكيد الإلغاء
          </button>
          <button
            className="secondary-button"
            disabled={saving}
            onClick={() => setVoidTarget(null)}
            type="button"
          >
            إغلاق
          </button>
        </form>
      )}

      <div className="table-wrap">
        <table className="resident-table">
          <thead>
            <tr>
              <th>رقم النزيل</th>
              <th>اسم النزيل</th>
              <th>عدد الإيصالات</th>
              <th>إجمالي المستلم</th>
            </tr>
          </thead>
          <tbody>
            {bundle.records.map((record) => (
              <tr key={record.residentNumber}>
                <td>{record.residentNumber}</td>
                <td>{record.residentName || "—"}</td>
                <td>{numberFormatter.format(record.entries.length)}</td>
                <td>
                  {numberFormatter.format(
                    record.entries.reduce(
                      (sum, entry) =>
                        sum +
                        (!entry.voided && entry.amount !== null
                          ? entry.amount
                          : 0),
                      0,
                    ),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!bundle.records.length && (
          <div className="empty-state">لا توجد سجلات نزلاء مالية.</div>
        )}
      </div>

      <div className="table-wrap">
        <table className="resident-table">
          <thead>
            <tr>
              <th>النزيل</th>
              <th>المبلغ المستلم</th>
              <th>تاريخ الإيصال</th>
              <th>التسوية المتوقعة</th>
              <th>الحالة</th>
              {canManage && <th>الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {allEntries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.residentLabel}</td>
                <td>
                  {entry.amount === null
                    ? "—"
                    : numberFormatter.format(entry.amount)}
                </td>
                <td>{formatDate(entry.transactionDate ?? "")}</td>
                <td>{formatDate(entry.returnDate ?? "")}</td>
                <td>
                  {entry.voided
                    ? `ملغى${entry.voidedAt ? ` في ${formatDate(entry.voidedAt.slice(0, 10))}` : ""}: ${entry.voidReason}`
                    : "مسجل"}
                </td>
                {canManage && <td>
                  {!entry.voided && (
                    <button
                      className="table-action danger"
                      disabled={saving}
                      onClick={() => {
                        setError("");
                        setVoidReason("");
                        setVoidTarget({
                          detailId: entry.id,
                          residentName: entry.residentLabel,
                        });
                      }}
                      type="button"
                    >
                      إلغاء الإيصال
                    </button>
                  )}
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!allEntries.length && (
          <div className="empty-state">لا توجد إيصالات مسجلة.</div>
        )}
      </div>
    </section>
  );
}
