"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getCenterCustodyBundleAction, recordCenterCustodyExpenseAction, renewCenterCustodyAction } from "@/app/actions/center-custody";
import { localDateValue, formatDate } from "@/lib/date-format";
import { printCurrentView } from "@/lib/print";
import type { CenterCustodyBundle } from "@/lib/center-custody-types";

const money = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 });
const initialBundle: CenterCustodyBundle = { targetBalance: 15000, balance: 0, transactions: [] };

export default function CenterCustodyPanel({ persistent, canManage }: { persistent: boolean; canManage: boolean }) {
  const [bundle, setBundle] = useState(initialBundle);
  const [loading, setLoading] = useState(persistent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [transactionDate, setTransactionDate] = useState(localDateValue());
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const [showRenewal, setShowRenewal] = useState(false);
  const [renewalAmount, setRenewalAmount] = useState("");
  const [renewalTarget, setRenewalTarget] = useState("15000");

  useEffect(() => {
    if (!persistent) return;
    let active = true;
    void getCenterCustodyBundleAction().then((data) => {
      if (active) {
        setBundle(data);
        setRenewalTarget(String(data.targetBalance));
      }
    }).catch(() => {
      if (active) setError("تعذر تحميل عهدة المركز.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [persistent]);

  const periodTransactions = useMemo(() => bundle.transactions.filter((row) =>
    (!reportStart || row.transactionDate >= reportStart) && (!reportEnd || row.transactionDate <= reportEnd)), [bundle.transactions, reportStart, reportEnd]);
  const expenseTotal = periodTransactions.filter((row) => row.kind === "expense").reduce((sum, row) => sum + row.amount, 0);
  const suggestedRenewal = Math.max(0, Number(renewalTarget) - bundle.balance);
  const draftTotal = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const expense = draftTotal;
      if (expense > bundle.balance + 1e-9) { setError("المصروف أكبر من الرصيد المتاح في عهدة المركز."); return; }
      if (persistent) {
        const result = await recordCenterCustodyExpenseAction({ transactionDate, description, unit, quantity: Number(quantity), unitPrice: Number(unitPrice) });
        if (!result.ok) { setError(result.error ?? "تعذر حفظ المصروف."); return; }
        setBundle(result.bundle);
      } else {
        const balanceAfter = bundle.balance - expense;
        setBundle((current) => ({ ...current, balance: balanceAfter, transactions: [{ id: crypto.randomUUID(), kind: "expense", transactionDate, description, unit, quantity: Number(quantity), unitPrice: Number(unitPrice), amount: expense, targetBalance: current.targetBalance, balanceAfter }, ...current.transactions] }));
      }
      setDescription(""); setUnit(""); setQuantity("1"); setUnitPrice("");
      setMessage("تم تسجيل المصروف وخصمه من عهدة المركز.");
    } catch { setError("تعذر حفظ المصروف."); }
    finally { setSaving(false); }
  }

  async function confirmRenewal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const amount = Number(renewalAmount);
      const target = Number(renewalTarget);
      if (suggestedRenewal <= 0) { setError("الرصيد وصل بالفعل للمبلغ المستهدف أو تجاوزه."); return; }
      if (persistent) {
        const result = await renewCenterCustodyAction({ transactionDate, targetBalance: target, amount });
        if (!result.ok) { setError(result.error ?? "تعذر تسجيل تجديد العهدة."); return; }
        setBundle(result.bundle);
      } else {
        const balanceAfter = bundle.balance + amount;
        setBundle((current) => ({ ...current, targetBalance: target, balance: balanceAfter, transactions: [{ id: crypto.randomUUID(), kind: "replenishment", transactionDate, description: "تجديد عهدة المركز", unit: "", quantity: 0, unitPrice: 0, amount, targetBalance: target, balanceAfter }, ...current.transactions] }));
      }
      setShowRenewal(false); setMessage("تم تسجيل تجديد عهدة المركز.");
    } catch { setError("تعذر تسجيل تجديد العهدة."); }
    finally { setSaving(false); }
  }

  return <section className="content-panel center-custody-panel" dir="rtl">
    <div className="panel-heading"><div><h3>عهدة المركز</h3><p>سجل المصروفات وتجديد الرصيد المستهدف يدويًا.</p></div><button type="button" className="secondary-button no-print" onClick={printCurrentView}>طباعة التقرير</button></div>
    <div className="inventory-summary">
      <div className="inventory-summary-card"><span>الرصيد الحالي</span><strong>{money.format(bundle.balance)} ج.م</strong></div>
      <div className="inventory-summary-card"><span>الرصيد المستهدف</span><strong>{money.format(bundle.targetBalance)} ج.م</strong></div>
      <div className="inventory-summary-card"><span>مصروفات الفترة</span><strong>{money.format(expenseTotal)} ج.م</strong></div>
      <div className="inventory-summary-card"><span>مبلغ التجديد المقترح</span><strong>{money.format(suggestedRenewal)} ج.م</strong></div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-message form-message-success" role="status">{message}</p>}
    {canManage && <>
      <form className="inventory-form" onSubmit={submitExpense}>
        <label className="form-field">البيان<input maxLength={255} value={description} onChange={(event) => setDescription(event.target.value)} required /></label>
        <label className="form-field">الوحدة<input maxLength={80} value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
        <label className="form-field">الكمية<input type="number" min="0.01" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <label className="form-field">السعر<input type="number" min="0" step="any" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} required /></label>
        <label className="form-field">التاريخ<input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} required /></label>
        <p className="access-note">إجمالي المصروف: <strong>{money.format(draftTotal)} ج.م</strong></p>
        <button className="primary-button" disabled={saving || !description.trim() || draftTotal <= 0}>تسجيل المصروف وخصمه</button>
      </form>
      <section className="inventory-section-heading"><div><h4>تجديد العهدة الأسبوعية</h4><p>التجديد يدوي. احسب الفرق إلى المبلغ المستهدف ثم راجعه قبل التسجيل.</p></div><button className="secondary-button no-print" type="button" onClick={() => { const suggested = Math.max(0, Number(renewalTarget) - bundle.balance); setRenewalAmount(String(suggested)); setShowRenewal(true); }}>تجديد العهدة</button></section>
      {showRenewal && <form className="inventory-form" onSubmit={confirmRenewal}>
        <label className="form-field">المبلغ المستهدف<input type="number" min="1" step="any" value={renewalTarget} onChange={(event) => setRenewalTarget(event.target.value)} required /></label>
        <label className="form-field">المبلغ المطلوب إضافته<input type="number" min="0.01" step="any" value={renewalAmount} onChange={(event) => setRenewalAmount(event.target.value)} required /></label>
        <p className="access-note">المقترح الحالي: {money.format(suggestedRenewal)} ج.م. يمكنك تعديل المبلغ قبل التأكيد.</p>
        <button className="primary-button" disabled={saving}>تأكيد وتسجيل التجديد</button><button className="secondary-button" type="button" onClick={() => setShowRenewal(false)}>إلغاء</button>
      </form>}
    </>}
    <div className="filter-list no-print"><label className="form-field">من تاريخ<input type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} /></label><label className="form-field">إلى تاريخ<input type="date" value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} /></label></div>
    {loading ? <div className="empty-state">جارٍ تحميل السجل...</div> : <div className="table-wrap"><table className="resident-table inventory-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th>الرصيد بعد الحركة</th></tr></thead><tbody>
      {periodTransactions.map((row) => <tr key={row.id}><td>{formatDate(row.transactionDate)}</td><td>{row.kind === "expense" ? "مصروف" : "تجديد"}</td><td>{row.description || "—"}</td><td>{row.unit || "—"}</td><td>{row.kind === "expense" ? money.format(row.quantity) : "—"}</td><td>{row.kind === "expense" ? money.format(row.unitPrice) : "—"}</td><td>{money.format(row.amount)} ج.م</td><td>{money.format(row.balanceAfter)} ج.م</td></tr>)}
      {!periodTransactions.length && <tr><td colSpan={8}><div className="empty-state">لا توجد حركات في الفترة المحددة.</div></td></tr>}
    </tbody></table></div>}
  </section>;
}
