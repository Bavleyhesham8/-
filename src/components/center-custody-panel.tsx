"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  getCenterCustodyBundleAction,
  recordCenterCustodyExpenseAction,
  renewCenterCustodyAction,
} from "@/app/actions/center-custody";
import PrintBrand from "@/components/print-brand";
import {
  CENTER_CUSTODY_TARGET,
  canCoverExpense,
  expenseAmount,
  remainingToTarget,
  renewalOutcome,
  roundMoney,
  suggestedRenewal,
} from "@/lib/center-custody-utils";
import { localDateValue, formatDate } from "@/lib/date-format";
import { printCurrentView } from "@/lib/print";
import type { CenterCustodyBundle } from "@/lib/center-custody-types";

const money = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 });
const initialBundle: CenterCustodyBundle = {
  targetBalance: CENTER_CUSTODY_TARGET,
  balance: 0,
  transactions: [],
};

export default function CenterCustodyPanel({
  persistent,
  canManage,
}: {
  persistent: boolean;
  canManage: boolean;
}) {
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
  const [renewalTarget, setRenewalTarget] = useState(
    String(CENTER_CUSTODY_TARGET),
  );

  useEffect(() => {
    if (!persistent) return;
    let active = true;
    void getCenterCustodyBundleAction()
      .then((data) => {
        if (active) {
          setBundle(data);
          setRenewalTarget(String(data.targetBalance));
        }
      })
      .catch(() => {
        if (active) setError("تعذر تحميل عهدة المركز.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [persistent]);

  const periodTransactions = useMemo(
    () =>
      bundle.transactions.filter(
        (row) =>
          (!reportStart || row.transactionDate >= reportStart) &&
          (!reportEnd || row.transactionDate <= reportEnd),
      ),
    [bundle.transactions, reportStart, reportEnd],
  );
  const expenseTotal = periodTransactions
    .filter((row) => row.kind === "expense")
    .reduce((sum, row) => sum + row.amount, 0);
  const currentRemaining = remainingToTarget(
    bundle.balance,
    bundle.targetBalance,
  );
  const currentSuggestedRenewal = suggestedRenewal(
    bundle.balance,
    bundle.targetBalance,
  );
  const draftTotal = expenseAmount(
    Number(quantity) || 0,
    Number(unitPrice) || 0,
  );
  const balanceAfterExpense = roundMoney(bundle.balance - draftTotal);
  const remainingAfterExpense = remainingToTarget(
    balanceAfterExpense,
    bundle.targetBalance,
  );
  const renewalTargetValue = Number(renewalTarget) || 0;
  const renewalAmountValue = Number(renewalAmount) || 0;
  const renewalResult = renewalOutcome(
    bundle.balance,
    renewalTargetValue,
    renewalAmountValue,
  );

  function setSuccess(text: string) {
    setError("");
    setMessage(text);
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!canCoverExpense(bundle.balance, draftTotal)) {
      setError("المصروف أكبر من الرصيد المتاح في عهدة المركز.");
      return;
    }
    setSaving(true);
    try {
      if (persistent) {
        const result = await recordCenterCustodyExpenseAction({
          transactionDate,
          description,
          unit,
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
        });
        if (!result.ok) {
          setError(result.error ?? "تعذر حفظ المصروف.");
          return;
        }
        setBundle(result.bundle);
      } else {
        const balanceAfter = roundMoney(bundle.balance - draftTotal);
        setBundle((current) => ({
          ...current,
          balance: balanceAfter,
          transactions: [
            {
              id: crypto.randomUUID(),
              kind: "expense",
              transactionDate,
              description,
              unit,
              quantity: Number(quantity),
              unitPrice: Number(unitPrice),
              amount: draftTotal,
              targetBalance: current.targetBalance,
              balanceAfter,
            },
            ...current.transactions,
          ],
        }));
      }
      setDescription("");
      setUnit("");
      setQuantity("1");
      setUnitPrice("");
      setSuccess("تم تسجيل المصروف وخصمه من عهدة المركز.");
    } catch {
      setError("تعذر حفظ المصروف.");
    } finally {
      setSaving(false);
    }
  }

  function openRenewal() {
    const target = bundle.targetBalance || CENTER_CUSTODY_TARGET;
    setRenewalTarget(String(target));
    setRenewalAmount(String(suggestedRenewal(bundle.balance, target)));
    setShowRenewal(true);
    setError("");
    setMessage("");
  }

  async function confirmRenewal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (renewalTargetValue <= 0) {
      setError("أدخل مبلغًا مستهدفًا صحيحًا.");
      return;
    }
    if (renewalAmountValue <= 0) {
      setError("أدخل مبلغ تجديد أكبر من صفر.");
      return;
    }
    if (suggestedRenewal(bundle.balance, renewalTargetValue) <= 0) {
      setError("الرصيد وصل بالفعل للمبلغ المستهدف أو تجاوزه.");
      return;
    }
    setSaving(true);
    try {
      if (persistent) {
        const result = await renewCenterCustodyAction({
          transactionDate,
          targetBalance: renewalTargetValue,
          amount: renewalAmountValue,
        });
        if (!result.ok) {
          setError(result.error ?? "تعذر تسجيل تجديد العهدة.");
          return;
        }
        setBundle(result.bundle);
        setRenewalTarget(String(result.bundle.targetBalance));
      } else {
        const balanceAfter = roundMoney(bundle.balance + renewalAmountValue);
        setBundle((current) => ({
          ...current,
          targetBalance: renewalTargetValue,
          balance: balanceAfter,
          transactions: [
            {
              id: crypto.randomUUID(),
              kind: "replenishment",
              transactionDate,
              description: "تجديد عهدة المركز",
              unit: "",
              quantity: 0,
              unitPrice: 0,
              amount: renewalAmountValue,
              targetBalance: renewalTargetValue,
              balanceAfter,
            },
            ...current.transactions,
          ],
        }));
      }
      setShowRenewal(false);
      setMessage("تم تسجيل تجديد عهدة المركز.");
    } catch {
      setError("تعذر تسجيل تجديد العهدة.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-panel center-custody-panel" dir="rtl">
      <PrintBrand
        title="تقرير عهدة المركز"
        subtitle="المصروفات والتجديدات والرصيد المتبقي"
        meta={[
          {
            label: "من",
            value: reportStart ? formatDate(reportStart) : "بداية السجل",
          },
          {
            label: "إلى",
            value: reportEnd ? formatDate(reportEnd) : "آخر السجل",
          },
          {
            label: "الرصيد الحالي",
            value: `${money.format(bundle.balance)} ج.م`,
          },
          {
            label: "الرصيد المستهدف",
            value: `${money.format(bundle.targetBalance)} ج.م`,
          },
          {
            label: "مصروفات الفترة",
            value: `${money.format(expenseTotal)} ج.م`,
          },
        ]}
      />
      <div className="panel-heading">
        <div>
          <h3>عهدة المركز</h3>
          <p>
            سجل المصروفات وتجديد الرصيد المستهدف يدويًا. المصروف يُخصم فورًا،
            والتجديد يقترح الفرق حتى الهدف مع إمكانية تعديله.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button no-print"
          onClick={printCurrentView}
        >
          طباعة التقرير
        </button>
      </div>
      <div className="inventory-summary">
        <div className="inventory-summary-card">
          <span>الرصيد الحالي</span>
          <strong>{money.format(bundle.balance)} ج.م</strong>
        </div>
        <div className="inventory-summary-card">
          <span>الرصيد المستهدف</span>
          <strong>{money.format(bundle.targetBalance)} ج.م</strong>
        </div>
        <div className="inventory-summary-card">
          <span>المتبقي للوصول إلى الهدف</span>
          <strong>{money.format(currentRemaining)} ج.م</strong>
        </div>
        <div className="inventory-summary-card">
          <span>مصروفات الفترة</span>
          <strong>{money.format(expenseTotal)} ج.م</strong>
        </div>
        <div className="inventory-summary-card">
          <span>مبلغ التجديد المقترح</span>
          <strong>{money.format(currentSuggestedRenewal)} ج.م</strong>
        </div>
      </div>
      {error && (
        <p className="form-error no-print" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="form-message form-message-success no-print" role="status">
          {message}
        </p>
      )}
      {canManage && (
        <>
          <form className="inventory-form no-print" onSubmit={submitExpense}>
            <label className="form-field">
              البيان
              <input
                maxLength={255}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </label>
            <label className="form-field">
              الوحدة
              <input
                maxLength={80}
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
              />
            </label>
            <label className="form-field">
              الكمية
              <input
                type="number"
                min="0.01"
                step="any"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </label>
            <label className="form-field">
              السعر
              <input
                type="number"
                min="0"
                step="any"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                required
              />
            </label>
            <label className="form-field">
              التاريخ
              <input
                type="date"
                value={transactionDate}
                onChange={(event) => setTransactionDate(event.target.value)}
                required
              />
            </label>
            <p className="access-note">
              إجمالي المصروف: <strong>{money.format(draftTotal)} ج.م</strong>
              {draftTotal > 0 ? (
                <>
                  {" "}
                  — الرصيد بعده:{" "}
                  <strong>{money.format(balanceAfterExpense)} ج.م</strong> —
                  المتبقي للهدف:{" "}
                  <strong>{money.format(remainingAfterExpense)} ج.م</strong>
                </>
              ) : null}
            </p>
            <button
              className="primary-button"
              disabled={
                saving ||
                !description.trim() ||
                !canCoverExpense(bundle.balance, draftTotal)
              }
            >
              تسجيل المصروف وخصمه
            </button>
          </form>
          <section className="inventory-section-heading">
            <div>
              <h4>تجديد العهدة الأسبوعية</h4>
              <p>
                التجديد يدوي. يُقترح الفرق إلى المبلغ المستهدف، ويمكنك تعديل
                المبلغ ورؤية الرصيد الناتج قبل التأكيد.
              </p>
            </div>
            <button
              className="secondary-button no-print"
              type="button"
              onClick={openRenewal}
            >
              تجديد العهدة
            </button>
          </section>
          {showRenewal && (
            <form className="inventory-form no-print" onSubmit={confirmRenewal}>
              <label className="form-field">
                المبلغ المستهدف
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={renewalTarget}
                  onChange={(event) => setRenewalTarget(event.target.value)}
                  required
                />
              </label>
              <label className="form-field">
                المبلغ المطلوب إضافته
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={renewalAmount}
                  onChange={(event) => setRenewalAmount(event.target.value)}
                  required
                />
              </label>
              <p className="access-note">
                المقترح الحالي:{" "}
                {money.format(
                  suggestedRenewal(bundle.balance, renewalTargetValue),
                )}{" "}
                ج.م. الرصيد بعد التجديد:{" "}
                <strong>{money.format(renewalResult.balanceAfter)} ج.م</strong>{" "}
                — المتبقي للهدف:{" "}
                <strong>{money.format(renewalResult.remaining)} ج.م</strong>.
                {renewalResult.remaining > 0 ? (
                  <>
                    {" "}
                    المبلغ المدخل لا يصل بالرصيد إلى الهدف، وسيبقى{" "}
                    {money.format(renewalResult.remaining)} ج.م.
                  </>
                ) : null}
                {renewalResult.excess > 0 ? (
                  <>
                    {" "}
                    الرصيد سيتجاوز الهدف بمقدار{" "}
                    {money.format(renewalResult.excess)} ج.م.
                  </>
                ) : null}
              </p>
              <button
                className="primary-button"
                disabled={
                  saving ||
                  renewalTargetValue <= 0 ||
                  renewalAmountValue <= 0
                }
              >
                تأكيد وتسجيل التجديد
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowRenewal(false)}
              >
                إلغاء
              </button>
            </form>
          )}
        </>
      )}
      <div className="filter-list no-print">
        <label className="form-field">
          من تاريخ
          <input
            type="date"
            value={reportStart}
            onChange={(event) => setReportStart(event.target.value)}
          />
        </label>
        <label className="form-field">
          إلى تاريخ
          <input
            type="date"
            value={reportEnd}
            onChange={(event) => setReportEnd(event.target.value)}
          />
        </label>
      </div>
      {loading ? (
        <div className="empty-state">جارٍ تحميل السجل...</div>
      ) : (
        <div className="table-wrap">
          <table className="resident-table inventory-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>البيان</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
                <th>الرصيد بعد الحركة</th>
                <th>المتبقي للهدف</th>
              </tr>
            </thead>
            <tbody>
              {periodTransactions.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.transactionDate)}</td>
                  <td>{row.kind === "expense" ? "مصروف" : "تجديد"}</td>
                  <td>{row.description || "—"}</td>
                  <td>{row.unit || "—"}</td>
                  <td>
                    {row.kind === "expense"
                      ? money.format(row.quantity)
                      : "—"}
                  </td>
                  <td>
                    {row.kind === "expense"
                      ? money.format(row.unitPrice)
                      : "—"}
                  </td>
                  <td>{money.format(row.amount)} ج.م</td>
                  <td>{money.format(row.balanceAfter)} ج.م</td>
                  <td>
                    {money.format(
                      remainingToTarget(row.balanceAfter, row.targetBalance),
                    )}{" "}
                    ج.م
                  </td>
                </tr>
              ))}
              {!periodTransactions.length && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      لا توجد حركات في الفترة المحددة.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
