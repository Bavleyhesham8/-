"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  createResidentFinanceHeaderAction,
  editResidentReceiptAction,
  recordResidentReceiptAction,
  voidResidentReceiptAction,
} from "@/app/actions/resident-finance";
import { formatDate, localDateValue } from "@/lib/date-format";
import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";
import type { Resident } from "@/lib/demo-data";
import {
  buildResidentAccounts,
  findUnmatchedFinanceRecords,
} from "@/lib/resident-account";
import type {
  ResidentFinanceBundle,
  ResidentFinanceEntry,
} from "@/lib/resident-finance-types";
import type { TreatmentBundle } from "@/lib/treatment-types";

type Props = {
  bundle: ResidentFinanceBundle;
  residents: Resident[];
  sales?: CanteenSalesBundle;
  treatment?: TreatmentBundle;
  persistent: boolean;
  canManage: boolean;
  onBundleChange: (bundle: ResidentFinanceBundle) => void;
  onOpenStatement?: (resident: Resident) => void;
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
  residents,
  sales,
  treatment,
  persistent,
  canManage,
  onBundleChange,
  onOpenStatement,
}: Props) {
  const [residentNumber, setResidentNumber] = useState("");
  const [residentName, setResidentName] = useState("");
  const [selectedResidentNumber, setSelectedResidentNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(localDateValue());
  const [returnDate, setReturnDate] = useState("");
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [editTarget, setEditTarget] = useState<ResidentFinanceEntry | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editTransactionDate, setEditTransactionDate] = useState("");
  const [editReturnDate, setEditReturnDate] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const accounts = useMemo(
    () =>
      buildResidentAccounts(residents, {
        residentFinance: bundle,
        sales,
        treatment,
      }),
    [residents, bundle, sales, treatment],
  );
  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((account) =>
      [
        account.resident.name,
        account.resident.fileNumber,
        account.resident.residentNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [accounts, search]);
  const totals = useMemo(
    () =>
      accounts.reduce(
        (sum, account) => ({
          deposits: sum.deposits + account.deposits,
          canteen: sum.canteen + account.canteenPurchases,
          treatment: sum.treatment + account.treatment,
          balance: sum.balance + account.balance,
        }),
        { deposits: 0, canteen: 0, treatment: 0, balance: 0 },
      ),
    [accounts],
  );
  const unmatchedRecords = useMemo(
    () => findUnmatchedFinanceRecords(bundle, residents),
    [bundle, residents],
  );

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
              residentId: null,
              matchScore: null,
              matchAmbiguous: false,
              entries: [],
            },
          ].sort((left, right) => left.residentNumber - right.residentNumber),
        });
      }
      setSelectedResidentNumber(String(parsedNumber));
      setResidentNumber("");
      setResidentName("");
      setMessage("تم فتح حساب مالي مستقل.");
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
      setError("اختر نزيلًا وأدخل مبلغًا موجبًا وتاريخ الإيداع.");
      return;
    }
    if (returnDate && returnDate < transactionDate) {
      setError("تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الإيداع.");
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
      setMessage("تم تسجيل الإيداع في الحساب.");
    } catch {
      setError("تعذر تسجيل الإيداع. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!voidTarget || !voidReason.trim()) {
      setError("أدخل سببًا لإلغاء الإيداع.");
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
      setMessage("تم إلغاء الإيداع مع الاحتفاظ بسجله؛ لم يُسجّل رد نقدي.");
    } catch {
      setError("تعذر إلغاء الإيداع. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    const parsedAmount = Number(editAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !editTransactionDate) {
      setError("أدخل مبلغًا موجبًا وتاريخ الإيداع.");
      return;
    }
    if (editReturnDate && editReturnDate < editTransactionDate) {
      setError("تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الإيداع.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (persistent) {
        const result = await editResidentReceiptAction({
          detailId: editTarget.id,
          amount: parsedAmount,
          transactionDate: editTransactionDate,
          returnDate: editReturnDate,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onBundleChange(result.bundle);
      } else {
        const updateEntry = (entry: ResidentFinanceEntry) => entry.id === editTarget.id
          ? { ...entry, amount: parsedAmount, transactionDate: editTransactionDate, returnDate: editReturnDate || null }
          : entry;
        onBundleChange({
          records: bundle.records.map((record) => ({ ...record, entries: record.entries.map(updateEntry) })),
          unassignedEntries: bundle.unassignedEntries.map(updateEntry),
        });
      }
      setEditTarget(null);
      setMessage("تم حفظ تعديل الإيداع.");
    } catch {
      setError("تعذر حفظ تعديل الإيداع.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-panel resident-finance-panel" dir="rtl">
      <div className="panel-heading">
        <div>
          <h3>حسابات النزلاء</h3>
          <p>
            رصيد كل نزيل من الإيداعات ومشتريات الكانتين والعلاج، مع كشف حساب
            تفصيلي. الرصيد السالب يعني مديونية على النزيل.
          </p>
        </div>
        <strong className="resident-finance-total">
          إجمالي الإيداعات: {numberFormatter.format(receivedTotal)} ج.م
        </strong>
      </div>

      {!persistent && (
        <p className="lookup-demo-note">
          بيانات تجريبية فقط؛ التغييرات لا تُحفظ بعد تحديث الصفحة.
        </p>
      )}
      <p className="lookup-demo-note">
        الإدارة للمسؤول فقط. إلغاء الإيداع يحفظ السبب ولا يسجل استردادًا نقديًا.
      </p>

      <div className="resident-account-summary report-summary">
        <article>
          <span>إجمالي الإيداعات</span>
          <strong>{numberFormatter.format(totals.deposits)} ج.م</strong>
        </article>
        <article>
          <span>مشتريات الكانتين</span>
          <strong>{numberFormatter.format(totals.canteen)} ج.م</strong>
        </article>
        <article>
          <span>مستحقات العلاج</span>
          <strong>{numberFormatter.format(totals.treatment)} ج.م</strong>
        </article>
        <article>
          <span>صافي أرصدة النزلاء</span>
          <strong className={totals.balance < 0 ? "resident-account-negative" : ""}>
            {numberFormatter.format(totals.balance)} ج.م
          </strong>
        </article>
      </div>

      <div className="resident-account-toolbar">
        <label className="form-field">
          بحث بالاسم أو رقم الملف
          <input
            type="search"
            value={search}
            maxLength={200}
            placeholder="اسم النزيل أو رقم الملف..."
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span>
          النتائج: {numberFormatter.format(filteredAccounts.length)} من{" "}
          {numberFormatter.format(accounts.length)}
        </span>
      </div>

      <div className="table-wrap">
        <table className="resident-table">
          <thead>
            <tr>
              <th>النزيل</th>
              <th>رقم الملف</th>
              <th>الإيداعات</th>
              <th>مشتريات الكانتين</th>
              <th>العلاج</th>
              <th>الرصيد الحالي</th>
              <th>كشف الحساب</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.map((account) => (
              <tr key={account.resident.id}>
                <td>
                  {account.resident.name}
                  {account.financeAmbiguous && (
                    <span
                      className="resident-account-flag"
                      title="توجد مطابقة مالية قديمة تحتاج مراجعة"
                    >
                      مطابقة تحتاج مراجعة
                    </span>
                  )}
                </td>
                <td>{account.resident.fileNumber}</td>
                <td>{numberFormatter.format(account.deposits)}</td>
                <td>{numberFormatter.format(account.canteenPurchases)}</td>
                <td>{numberFormatter.format(account.treatment)}</td>
                <td>
                  <strong
                    className={
                      account.balance < 0
                        ? "resident-account-negative"
                        : "resident-account-positive"
                    }
                  >
                    {numberFormatter.format(account.balance)} ج.م
                  </strong>
                  {account.balance < 0 && (
                    <span className="resident-account-debt">مديونية</span>
                  )}
                </td>
                <td>
                  {onOpenStatement && (
                    <button
                      className="table-action"
                      type="button"
                      onClick={() => onOpenStatement(account.resident)}
                    >
                      كشف الحساب
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filteredAccounts.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    {accounts.length
                      ? "لا توجد حسابات مطابقة للبحث."
                      : "لا يوجد نزلاء لعرض حساباتهم."}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!!unmatchedRecords.length && (
        <section className="resident-account-unmatched">
          <h4>إيداعات قديمة غير مرتبطة بنزيل</h4>
          <p>
            هذه سجلات مالية لم تُطابق أي نزيل في السجل الحديث. تظهر للمراجعة ولا
            تُضاف إلى أرصدة النزلاء.
          </p>
          <div className="table-wrap">
            <table className="resident-table">
              <thead>
                <tr>
                  <th>رقم السجل المالي</th>
                  <th>الاسم المسجل</th>
                  <th>عدد الإيداعات</th>
                  <th>إجمالي الإيداعات</th>
                </tr>
              </thead>
              <tbody>
                {unmatchedRecords.map((record) => (
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
          </div>
        </section>
      )}

      {canManage && (
        <div className="resident-finance-forms">
          <form className="lookup-form" onSubmit={submitReceipt}>
            <h4>إيداع في الحساب</h4>
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
              المبلغ المودع
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
              تاريخ الإيداع
              <input
                required
                type="date"
                value={transactionDate}
                onChange={(event) => setTransactionDate(event.target.value)}
              />
            </label>
            <label className="form-field">
              تاريخ الاستحقاق المتوقع (اختياري)
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
              تسجيل الإيداع
            </button>
          </form>

          <form className="lookup-form" onSubmit={submitHeader}>
            <h4>فتح حساب مالي مستقل (سجلات قديمة)</h4>
            <p className="access-note">
              استخدمه فقط لإيداعات قديمة لا يوجد لها نزيل مطابق في السجل الحديث.
            </p>
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
              فتح الحساب
            </button>
          </form>
        </div>
      )}

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
          <h4>إلغاء إيداع — {voidTarget.residentName}</h4>
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

      {canManage && editTarget && (
        <form className="resident-finance-void-form" onSubmit={submitEdit}>
          <h4>تعديل إيداع — {editTarget.residentNumber ?? "غير مرتبط"}</h4>
          <label className="form-field">المبلغ
            <input type="number" min="0.01" step="any" required value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />
          </label>
          <label className="form-field">تاريخ الإيداع
            <input type="date" required value={editTransactionDate} onChange={(event) => setEditTransactionDate(event.target.value)} />
          </label>
          <label className="form-field">تاريخ الاستحقاق المتوقع
            <input type="date" value={editReturnDate} onChange={(event) => setEditReturnDate(event.target.value)} />
          </label>
          <button className="primary-button" disabled={saving} type="submit">حفظ التعديل</button>
          <button className="secondary-button" disabled={saving} onClick={() => setEditTarget(null)} type="button">إلغاء</button>
        </form>
      )}

      <div className="table-wrap">
        <table className="resident-table">
          <thead>
            <tr>
              <th>النزيل</th>
              <th>المبلغ المودع</th>
              <th>تاريخ الإيداع</th>
              <th>الاستحقاق المتوقع</th>
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
                    <>
                    <button
                      className="table-action"
                      disabled={saving}
                      onClick={() => {
                        setEditTarget(entry);
                        setEditAmount(String(entry.amount ?? ""));
                        setEditTransactionDate(entry.transactionDate ?? "");
                        setEditReturnDate(entry.returnDate ?? "");
                        setError("");
                      }}
                      type="button"
                    >تعديل</button>
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
                      إلغاء الإيداع
                    </button>
                    </>
                  )}
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!allEntries.length && (
          <div className="empty-state">لا توجد إيداعات مسجلة.</div>
        )}
      </div>
    </section>
  );
}
