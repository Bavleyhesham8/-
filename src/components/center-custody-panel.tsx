"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  getCenterCustodyBundleAction,
  recordCenterCustodyExpenseAction,
  renewCenterCustodyAction,
  updateCenterCustodyTransactionAction,
} from "@/app/actions/center-custody";
import PrintBrand from "@/components/print-brand";
import ResidentPicker from "@/components/resident-picker";
import {
  CENTER_CUSTODY_TARGET,
  canCoverExpense,
  expenseAmount,
  recalculateCustodyRows,
  remainingToTarget,
  renewalOutcome,
  roundMoney,
  suggestedRenewal,
} from "@/lib/center-custody-utils";
import { localDateValue, formatDate } from "@/lib/date-format";
import { printCurrentView } from "@/lib/print";
import type {
  CenterCustodyBundle,
  CenterCustodyTransaction,
  ResidentCustodyCharge,
} from "@/lib/center-custody-types";
import { residentChargesFromTransactions } from "@/lib/center-custody-types";
import type { Resident } from "@/lib/demo-data";

const money = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 });
const initialBundle: CenterCustodyBundle = {
  targetBalance: CENTER_CUSTODY_TARGET,
  balance: 0,
  transactions: [],
};

export default function CenterCustodyPanel({
  persistent,
  canManage,
  residents = [],
  onResidentChargesChange,
}: {
  persistent: boolean;
  canManage: boolean;
  residents?: Resident[];
  onResidentChargesChange?: (charges: ResidentCustodyCharge[]) => void;
}) {
  const [bundle, setBundle] = useState(initialBundle);
  const [loading, setLoading] = useState(persistent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [transactionDate, setTransactionDate] = useState(localDateValue());
  const [expenseKind, setExpenseKind] = useState<"free" | "resident">("free");
  const [description, setDescription] = useState("");
  const [residentId, setResidentId] = useState("");
  const [residentPickerValue, setResidentPickerValue] = useState("");
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
  const [renewalDate, setRenewalDate] = useState(localDateValue());
  const [editingTransaction, setEditingTransaction] =
    useState<CenterCustodyTransaction | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editExpenseKind, setEditExpenseKind] = useState<"free" | "resident">(
    "free",
  );
  const [editDescription, setEditDescription] = useState("");
  const [editResidentId, setEditResidentId] = useState("");
  const [editResidentPickerValue, setEditResidentPickerValue] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnitPrice, setEditUnitPrice] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editTarget, setEditTarget] = useState("");

  useEffect(() => {
    if (!persistent) return;
    let active = true;
    void getCenterCustodyBundleAction()
      .then((data) => {
        if (active) {
          setBundle(data);
          setRenewalTarget(String(data.targetBalance));
          onResidentChargesChange?.(
            residentChargesFromTransactions(data.transactions),
          );
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
  }, [persistent, onResidentChargesChange]);

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
  const residentExpenseTotal = periodTransactions
    .filter((row) => row.kind === "expense" && row.residentId)
    .reduce((sum, row) => sum + row.amount, 0);
  const currentRemaining = remainingToTarget(
    bundle.balance,
    bundle.targetBalance,
  );
  const currentSuggestedRenewal = suggestedRenewal(
    bundle.balance,
    bundle.targetBalance,
  );
  const selectedResident =
    residents.find((resident) => resident.id === residentId) ?? null;
  const draftQuantity = expenseKind === "resident" ? 1 : Number(quantity) || 0;
  const draftTotal = expenseAmount(
    draftQuantity,
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
    if (expenseKind === "resident" && !selectedResident) {
      setError("اختر النزيل الذي تُخصم منه مصاريف النزلاء.");
      return;
    }
    if (expenseKind === "free" && !description.trim()) {
      setError("أدخل بيان المصروف.");
      return;
    }
    if (!canCoverExpense(bundle.balance, draftTotal)) {
      setError("المصروف أكبر من الرصيد المتاح في عهدة المركز.");
      return;
    }
    const expenseDescription =
      expenseKind === "resident" && selectedResident
        ? `مصاريف النزلاء - ${selectedResident.name}`
        : description;
    setSaving(true);
    try {
      if (persistent) {
        const result = await recordCenterCustodyExpenseAction({
          transactionDate,
          description: expenseKind === "free" ? description : "",
          residentId:
            expenseKind === "resident" ? selectedResident?.id ?? null : null,
          unit: expenseKind === "resident" ? "" : unit,
          quantity: draftQuantity,
          unitPrice: Number(unitPrice),
        });
        if (!result.ok) {
          setError(result.error ?? "تعذر حفظ المصروف.");
          return;
        }
        setBundle(result.bundle);
        onResidentChargesChange?.(
          residentChargesFromTransactions(result.bundle.transactions),
        );
      } else {
        const recalculated = recalculateCustodyRows(
          [
            ...bundle.transactions,
            {
              id: crypto.randomUUID(),
              kind: "expense" as const,
              transactionDate,
              description: expenseDescription,
              residentId:
                expenseKind === "resident" ? selectedResident?.id ?? null : null,
              residentName:
                expenseKind === "resident" ? selectedResident?.name ?? "" : "",
              unit: expenseKind === "resident" ? "" : unit,
              quantity: draftQuantity,
              unitPrice: Number(unitPrice),
              amount: draftTotal,
              targetBalance: bundle.targetBalance,
              balanceAfter: 0,
            },
          ],
          bundle.targetBalance,
        );
        if (!recalculated.ok) {
          setError(recalculated.error);
          return;
        }
        const nextBundle = {
          targetBalance: bundle.targetBalance,
          balance: recalculated.balance,
          transactions: recalculated.rows,
        };
        setBundle(nextBundle);
        onResidentChargesChange?.(
          residentChargesFromTransactions(nextBundle.transactions),
        );
      }
      setDescription("");
      setUnit("");
      setQuantity("1");
      setUnitPrice("");
      setResidentId("");
      setResidentPickerValue("");
      setSuccess(
        expenseKind === "resident"
          ? "تم تسجيل مصاريف النزيل وخصمها من عهدة المركز وحسابه."
          : "تم تسجيل المصروف وخصمه من عهدة المركز.",
      );
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
    setRenewalDate(localDateValue());
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
          transactionDate: renewalDate,
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
        const recalculated = recalculateCustodyRows(
          [
            ...bundle.transactions,
            {
              id: crypto.randomUUID(),
              kind: "replenishment" as const,
              transactionDate: renewalDate,
              description: "تجديد عهدة المركز",
              unit: "",
              quantity: 0,
              unitPrice: 0,
              amount: renewalAmountValue,
              residentId: null,
              residentName: "",
              targetBalance: renewalTargetValue,
              balanceAfter: 0,
            },
          ],
          renewalTargetValue,
        );
        if (!recalculated.ok) {
          setError(recalculated.error);
          return;
        }
        setBundle({
          targetBalance: renewalTargetValue,
          balance: recalculated.balance,
          transactions: recalculated.rows,
        });
      }
      setShowRenewal(false);
      setMessage("تم تسجيل تجديد عهدة المركز.");
    } catch {
      setError("تعذر تسجيل تجديد العهدة.");
    } finally {
      setSaving(false);
    }
  }

  function startEditTransaction(row: CenterCustodyTransaction) {
    if (!canManage) return;
    setEditingTransaction(row);
    setEditDate(row.transactionDate);
    setEditExpenseKind(row.residentId ? "resident" : "free");
    setEditDescription(row.description);
    setEditResidentId(row.residentId ?? "");
    setEditResidentPickerValue(row.residentName);
    setEditUnit(row.unit);
    setEditQuantity(String(row.quantity));
    setEditUnitPrice(String(row.unitPrice));
    setEditAmount(String(row.amount));
    setEditTarget(String(row.targetBalance));
    setError("");
    setMessage("");
  }

  async function submitTransactionEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTransaction) return;
    setError("");
    setMessage("");

    const isExpense = editingTransaction.kind === "expense";
    const editUsesResident = isExpense && editExpenseKind === "resident";
    const editSelectedResident =
      residents.find((resident) => resident.id === editResidentId) ?? null;
    const nextQuantity = isExpense
      ? editUsesResident
        ? 1
        : Number(editQuantity)
      : 0;
    const nextUnitPrice = isExpense ? Number(editUnitPrice) : 0;
    const nextAmount = isExpense
      ? expenseAmount(nextQuantity, nextUnitPrice)
      : Number(editAmount);
    const nextTarget = Number(editTarget);
    const nextDescription = isExpense
      ? editUsesResident
        ? `مصاريف النزلاء - ${editSelectedResident?.name ?? ""}`
        : editDescription
      : editDescription || "تجديد عهدة المركز";

    if (!editDate) {
      setError("أدخل تاريخ الحركة.");
      return;
    }
    if (editUsesResident && !editSelectedResident) {
      setError("اختر النزيل الذي تُخصم منه مصاريف النزلاء.");
      return;
    }
    if (isExpense && !editUsesResident && !editDescription.trim()) {
      setError("أدخل بيان المصروف.");
      return;
    }
    if (isExpense && nextAmount <= 0) {
      setError("أدخل كمية وسعرًا صحيحين للمصروف.");
      return;
    }
    if (!isExpense && nextAmount <= 0) {
      setError("أدخل مبلغ تجديد صحيحًا.");
      return;
    }
    if (!Number.isFinite(nextTarget) || nextTarget <= 0) {
      setError("أدخل الرصيد المستهدف بشكل صحيح.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await updateCenterCustodyTransactionAction({
          id: editingTransaction.id,
          transactionDate: editDate,
          description: editUsesResident ? "" : nextDescription,
          residentId: isExpense
            ? editUsesResident
              ? editSelectedResident?.id ?? null
              : null
            : null,
          unit: isExpense && !editUsesResident ? editUnit : "",
          quantity: nextQuantity,
          unitPrice: nextUnitPrice,
          amount: isExpense ? undefined : nextAmount,
          targetBalance: nextTarget,
        });
        if (!result.ok) {
          setError(result.error ?? "تعذر تعديل حركة العهدة.");
          return;
        }
        setBundle(result.bundle);
        onResidentChargesChange?.(
          residentChargesFromTransactions(result.bundle.transactions),
        );
        setRenewalTarget(String(result.bundle.targetBalance));
      } else {
        const updatedRows = bundle.transactions.map((row) =>
          row.id === editingTransaction.id
            ? {
                ...row,
                transactionDate: editDate,
                description: nextDescription,
                residentId: isExpense
                  ? editUsesResident
                    ? editSelectedResident?.id ?? null
                    : null
                  : null,
                residentName: isExpense
                  ? editUsesResident
                    ? editSelectedResident?.name ?? ""
                    : ""
                  : "",
                unit: isExpense && !editUsesResident ? editUnit : "",
                quantity: nextQuantity,
                unitPrice: nextUnitPrice,
                amount: nextAmount,
              }
            : row,
        );
        const recalculated = recalculateCustodyRows(updatedRows, nextTarget);
        if (!recalculated.ok) {
          setError(recalculated.error);
          return;
        }
        const nextBundle = {
          targetBalance: nextTarget,
          balance: recalculated.balance,
          transactions: recalculated.rows,
        };
        setBundle(nextBundle);
        onResidentChargesChange?.(
          residentChargesFromTransactions(nextBundle.transactions),
        );
        setRenewalTarget(String(nextTarget));
      }
      setEditingTransaction(null);
      setSuccess("تم تعديل الحركة وإعادة حساب الأرصدة اللاحقة.");
    } catch {
      setError("تعذر تعديل حركة العهدة.");
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
          {
            label: "مصاريف النزلاء",
            value: `${money.format(residentExpenseTotal)} ج.م`,
          },
        ]}
      />
      <div className="panel-heading">
        <div>
          <h3>عهدة المركز</h3>
          <p>
            سجل المصروفات وتجديد الرصيد المستهدف يدويًا. المصروف يُخصم فورًا،
            والتجديد يقترح الفرق حتى الهدف مع إمكانية تعديله. اختر «مصاريف
            النزلاء» لربط المصروف بحساب نزيل ليظهر في كشف حسابه.
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
      <div className="inventory-summary report-summary">
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
          <span>مصاريف النزلاء بالفترة</span>
          <strong>{money.format(residentExpenseTotal)} ج.م</strong>
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
              نوع البيان
              <select
                value={expenseKind}
                onChange={(event) => {
                  const nextKind =
                    event.target.value === "resident" ? "resident" : "free";
                  setExpenseKind(nextKind);
                  if (nextKind === "resident") {
                    setQuantity("1");
                    setUnit("");
                  }
                }}
              >
                <option value="free">بيان حر</option>
                <option value="resident" disabled={!residents.length}>
                  مصاريف النزلاء
                </option>
              </select>
            </label>
            {expenseKind === "free" ? (
              <label className="form-field">
                البيان
                <input
                  maxLength={255}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  required
                />
              </label>
            ) : (
              <label className="form-field">
                النزيل
                <ResidentPicker
                  residents={residents}
                  value={residentPickerValue}
                  onChange={(value, resident) => {
                    setResidentPickerValue(value);
                    setResidentId(resident?.id ?? "");
                  }}
                  placeholder="ابحث باسم النزيل..."
                  required
                  disabled={saving}
                />
              </label>
            )}
            {expenseKind === "free" && (
              <>
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
              </>
            )}
            <label className="form-field">
              {expenseKind === "resident" ? "المبلغ المحتسب" : "السعر"}
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
              {expenseKind === "resident" && selectedResident ? (
                <>
                  {" "}
                  — يُخصم من حساب النزيل:{" "}
                  <strong>{selectedResident.name}</strong>
                </>
              ) : null}
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
                (expenseKind === "free"
                  ? !description.trim()
                  : !selectedResident) ||
                !canCoverExpense(bundle.balance, draftTotal)
              }
            >
              تسجيل المصروف وخصمه
            </button>
          </form>
          <section className="inventory-section-heading">
            <button
              className="secondary-button no-print custody-renewal-button"
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
              <label className="form-field">
                تاريخ التجديد
                <input
                  type="date"
                  value={renewalDate}
                  onChange={(event) => setRenewalDate(event.target.value)}
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
          {editingTransaction && (
            <form
              className="inventory-form no-print"
              onSubmit={submitTransactionEdit}
            >
              <div className="inventory-section-heading">
                <div>
                  <h4>
                    تعديل حركة{" "}
                    {editingTransaction.kind === "expense"
                      ? "مصروف"
                      : "تجديد"}
                  </h4>
                  <p>
                    يمكن تعديل كل الحقول، وسيُعاد حساب الرصيد بعد الحركة
                    والحركات اللاحقة تلقائيًا.
                  </p>
                </div>
              </div>
              <label className="form-field">
                التاريخ
                <input
                  type="date"
                  value={editDate}
                  onChange={(event) => setEditDate(event.target.value)}
                  required
                />
              </label>
              {editingTransaction.kind === "expense" && (
                <label className="form-field">
                  نوع البيان
                  <select
                    value={editExpenseKind}
                    onChange={(event) => {
                      const nextKind =
                        event.target.value === "resident"
                          ? "resident"
                          : "free";
                      setEditExpenseKind(nextKind);
                      if (nextKind === "resident") {
                        setEditQuantity("1");
                        setEditUnit("");
                      }
                    }}
                  >
                    <option value="free">بيان حر</option>
                    <option value="resident" disabled={!residents.length}>
                      مصاريف النزلاء
                    </option>
                  </select>
                </label>
              )}
              {editingTransaction.kind === "expense" &&
              editExpenseKind === "resident" ? (
                <label className="form-field">
                  النزيل
                  <ResidentPicker
                    residents={residents}
                    value={editResidentPickerValue}
                    onChange={(value, resident) => {
                      setEditResidentPickerValue(value);
                      setEditResidentId(resident?.id ?? "");
                    }}
                    placeholder="ابحث باسم النزيل..."
                    required
                    disabled={saving}
                  />
                </label>
              ) : (
                <label className="form-field">
                  البيان
                  <input
                    maxLength={255}
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                    placeholder={
                      editingTransaction.kind === "replenishment"
                        ? "تجديد عهدة المركز"
                        : "بيان المصروف"
                    }
                    required={editingTransaction.kind === "expense"}
                  />
                </label>
              )}
              {editingTransaction.kind === "expense" ? (
                <>
                  {editExpenseKind === "free" && (
                    <>
                      <label className="form-field">
                        الوحدة
                        <input
                          maxLength={80}
                          value={editUnit}
                          onChange={(event) => setEditUnit(event.target.value)}
                        />
                      </label>
                      <label className="form-field">
                        الكمية
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={editQuantity}
                          onChange={(event) =>
                            setEditQuantity(event.target.value)
                          }
                          required
                        />
                      </label>
                    </>
                  )}
                  <label className="form-field">
                    {editExpenseKind === "resident"
                      ? "المبلغ المحتسب"
                      : "سعر الوحدة"}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={editUnitPrice}
                      onChange={(event) => setEditUnitPrice(event.target.value)}
                      required
                    />
                  </label>
                </>
              ) : (
                <label className="form-field">
                  مبلغ التجديد
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={editAmount}
                    onChange={(event) => setEditAmount(event.target.value)}
                    required
                  />
                </label>
              )}
              <label className="form-field">
                الرصيد المستهدف
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={editTarget}
                  onChange={(event) => setEditTarget(event.target.value)}
                  required
                />
              </label>
              <div className="action-group">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={saving}
                  onClick={() => setEditingTransaction(null)}
                >
                  إلغاء
                </button>
                <button className="primary-button" disabled={saving}>
                  {saving ? "جارٍ الحفظ..." : "حفظ التعديل"}
                </button>
              </div>
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
        <div className="table-wrap report-detail">
          <table className="resident-table inventory-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>النزيل</th>
                <th>البيان</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
                <th>الرصيد بعد الحركة</th>
                <th>المتبقي للهدف</th>
                {canManage && <th>الإجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {periodTransactions.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.transactionDate)}</td>
                  <td>{row.kind === "expense" ? "مصروف" : "تجديد"}</td>
                  <td>{row.residentName || "—"}</td>
                  <td>{row.description || "—"}</td>
                  <td>{row.unit || "—"}</td>
                  <td>
                    {row.kind === "expense" && !row.residentId
                      ? money.format(row.quantity)
                      : "—"}
                  </td>
                  <td>
                    {row.kind === "expense"
                      ? money.format(
                          row.residentId ? row.amount : row.unitPrice,
                        )
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
                  {canManage && (
                    <td>
                      <button
                        className="table-action no-print"
                        type="button"
                        disabled={saving}
                        onClick={() => startEditTransaction(row)}
                      >
                        تعديل
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!periodTransactions.length && (
                <tr>
                  <td colSpan={canManage ? 11 : 10}>
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
