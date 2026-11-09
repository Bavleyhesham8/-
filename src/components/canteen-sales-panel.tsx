"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  createResidentInvoiceAction,
  recordInvoicePaymentAction,
  saveCanteenSalesItemAction,
  saveInvoiceCategoryAction,
  voidResidentInvoiceAction,
} from "@/app/actions/canteen-sales";
import { formatDate, localDateValue } from "@/lib/date-format";
import type { CanteenBundle, CanteenMovement } from "@/lib/canteen-types";
import type { Resident } from "@/lib/demo-data";
import type {
  CanteenSalesBundle,
  InvoicePayment,
  ResidentInvoice,
  ResidentInvoiceLine,
} from "@/lib/canteen-sales-types";
import type { LookupData } from "@/lib/lookup-types";

type Props = {
  sales: CanteenSalesBundle;
  lookups: LookupData;
  residents: Resident[];
  canteen: CanteenBundle;
  persistent: boolean;
  onSalesChange: (
    update: (current: CanteenSalesBundle) => CanteenSalesBundle,
  ) => void;
  onCanteenChange: (update: (current: CanteenBundle) => CanteenBundle) => void;
};

type DraftLine = {
  catalogId: string;
  quantity: string;
  categoryId: string;
  alternateCategory: string;
};

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

export default function CanteenSalesPanel({
  sales,
  lookups,
  residents,
  canteen,
  persistent,
  onSalesChange,
  onCanteenChange,
}: Props) {
  const [section, setSection] = useState<"sale" | "history" | "catalog">("sale");
  const [saleType, setSaleType] = useState<"resident" | "cash">("resident");
  const [residentId, setResidentId] = useState(residents[0]?.id ?? "");
  const [invoiceDate, setInvoiceDate] = useState(localDateValue());
  const [initialPayment, setInitialPayment] = useState("0");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    {
      catalogId: "",
      quantity: "1",
      categoryId: "",
      alternateCategory: "",
    },
  ]);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemStockNumber, setItemStockNumber] = useState("");
  const [itemAddFlag, setItemAddFlag] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [paymentTargetId, setPaymentTargetId] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(localDateValue());
  const [voidTargetId, setVoidTargetId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const stockBalances = useMemo(() => {
    const balances = new Map<number, number>();
    for (const movement of canteen.movements) {
      if (movement.voided) continue;
      balances.set(
        movement.itemNumber,
        (balances.get(movement.itemNumber) ?? 0) +
          (movement.incoming ?? 0) -
          (movement.outgoing ?? 0),
      );
    }
    return balances;
  }, [canteen.movements]);

  const preparedLines = draftLines.map((line) => {
    const catalogItem = sales.items.find(
      (item) => String(item.id) === line.catalogId,
    );
    const quantity = Number(line.quantity);
    const rawTotal = (catalogItem?.price ?? 0) * quantity;
    return {
      draft: line,
      catalogItem,
      quantity,
      total: Math.round(rawTotal),
      validTotal:
        Number.isFinite(rawTotal) &&
        rawTotal > 0 &&
        Math.abs(rawTotal - Math.round(rawTotal)) <= 1e-8,
    };
  });
  const draftTotal = preparedLines.reduce(
    (sum, line) => sum + (line.validTotal ? line.total : 0),
    0,
  );
  const canCreateInvoice =
    !!sales.items.length &&
    preparedLines.every(
      (line) => line.catalogItem && line.quantity > 0 && line.validTotal,
    ) &&
    draftTotal > 0;

  function updateDraftLine(index: number, patch: Partial<DraftLine>) {
    setDraftLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function clearDraft() {
    setSaleType("resident");
    setResidentId(residents[0]?.id ?? "");
    setInvoiceDate(localDateValue());
    setInitialPayment("0");
    setDraftLines([
      {
        catalogId: "",
        quantity: "1",
        categoryId: "",
        alternateCategory: "",
      },
    ]);
  }

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const initialPaid =
      saleType === "cash" ? draftTotal : Number(initialPayment);
    const items = preparedLines.map((line) => ({
      catalogId: line.catalogItem?.id ?? 0,
      quantity: line.quantity,
      categoryId: line.draft.categoryId
        ? Number(line.draft.categoryId)
        : null,
      alternateCategory: line.draft.alternateCategory.trim(),
    }));
    if (
      !canCreateInvoice ||
      !invoiceDate ||
      (saleType === "resident" && !residentId) ||
      !Number.isInteger(initialPaid) ||
      initialPaid < 0 ||
      initialPaid > draftTotal
    ) {
      setError("أكمل بيانات الفاتورة وتأكد من صحة المبالغ والكميات.");
      return;
    }
    for (const line of preparedLines) {
      const itemNumber = line.catalogItem?.canteenItemNumber;
      if (
        itemNumber !== null &&
        itemNumber !== undefined &&
        line.quantity >
          (stockBalances.get(itemNumber) ?? 0) + 1e-9
      ) {
        const totalRequested = preparedLines
          .filter((entry) => entry.catalogItem?.canteenItemNumber === itemNumber)
          .reduce((sum, entry) => sum + entry.quantity, 0);
        if (totalRequested > (stockBalances.get(itemNumber) ?? 0) + 1e-9) {
          setError(`الرصيد المتاح غير كافٍ للصنف ${line.catalogItem?.name}.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await createResidentInvoiceAction({
          saleType,
          residentId: saleType === "resident" ? residentId : null,
          invoiceDate,
          initialPayment: initialPaid,
          items,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSalesChange((current) => ({
          ...current,
          invoices: [result.invoice, ...current.invoices],
        }));
        onCanteenChange((current) => ({
          ...current,
          movements: [...result.stockMovements, ...current.movements],
        }));
      } else {
        const invoiceNumber =
          Math.max(0, ...sales.invoices.map((invoice) => invoice.invoiceNumber)) +
          1;
        const resident =
          saleType === "resident"
            ? residents.find((entry) => entry.id === residentId)
            : null;
        let nextMovementId = Math.max(
          0,
          ...canteen.movements.map((movement) => movement.id),
        );
        const remaining = new Map(stockBalances);
        const newMovements: CanteenMovement[] = [];
        const lines: ResidentInvoiceLine[] = [];
        for (const line of preparedLines) {
          if (!line.catalogItem) continue;
          let stockMovementId: number | null = null;
          if (line.catalogItem.canteenItemNumber !== null) {
            const itemNumber = line.catalogItem.canteenItemNumber;
            const balance =
              (remaining.get(itemNumber) ?? 0) - line.quantity;
            remaining.set(itemNumber, balance);
            nextMovementId += 1;
            stockMovementId = nextMovementId;
            newMovements.push({
              id: nextMovementId,
              itemNumber,
              itemName: line.catalogItem.name,
              balance,
              incoming: null,
              incomingDate: null,
              outgoing: line.quantity,
              outgoingDate: invoiceDate,
              recipient: resident?.name ?? "بيع نقدي",
              voucherId: nextMovementId,
              voided: false,
              voidReason: "",
            });
          }
          lines.push({
            id:
              Math.max(
                0,
                ...sales.invoices.flatMap((invoice) =>
                  invoice.lines.map((entry) => entry.id),
                ),
              ) +
              lines.length +
              1,
            itemName: line.catalogItem.name,
            unitPrice: line.catalogItem.price,
            quantity: line.quantity,
            total: line.total,
            categoryId: line.draft.categoryId
              ? Number(line.draft.categoryId)
              : null,
            alternateCategory: line.draft.alternateCategory.trim(),
            stockMovementId,
          });
        }
        const payments: InvoicePayment[] =
          initialPaid > 0
            ? [
                {
                  id:
                    Math.max(
                      0,
                      ...sales.invoices.flatMap((invoice) =>
                        invoice.payments.map((payment) => payment.id),
                      ),
                    ) + 1,
                  kind: "payment",
                  amount: initialPaid,
                  paymentDate: invoiceDate,
                },
              ]
            : [];
        const invoice: ResidentInvoice = {
          invoiceNumber,
          invoiceDate,
          saleType,
          residentId: saleType === "resident" ? residentId : null,
          residentName: resident?.name ?? "",
          lines,
          payments,
          total: draftTotal,
          paid: initialPaid,
          balance: draftTotal - initialPaid,
          voided: false,
          voidReason: "",
        };
        onSalesChange((current) => ({
          ...current,
          invoices: [invoice, ...current.invoices],
        }));
        onCanteenChange((current) => ({
          ...current,
          movements: [...newMovements, ...current.movements],
        }));
      }
      clearDraft();
      setSection("history");
    } catch {
      setError("تعذر حفظ الفاتورة. تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function submitSalesItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const price = Number(itemPrice);
    const canteenItemNumber = itemStockNumber
      ? Number(itemStockNumber)
      : null;
    if (
      !itemName.trim() ||
      !Number.isFinite(price) ||
      price < 0 ||
      (canteenItemNumber !== null &&
        !canteen.products.some(
          (item) => item.itemNumber === canteenItemNumber,
        ))
    ) {
      setError("أدخل اسمًا وسعرًا صحيحين واختر صنف مخزون موجودًا.");
      return;
    }
    setSaving(true);
    try {
      if (persistent) {
        const result = await saveCanteenSalesItemAction({
          name: itemName,
          price,
          addToResidentAccount: itemAddFlag,
          canteenItemNumber,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSalesChange((current) => ({
          ...current,
          items: [...current.items, result.item],
        }));
      } else {
        const item = {
          id: Math.max(0, ...sales.items.map((entry) => entry.id)) + 1,
          name: itemName.trim().normalize("NFC"),
          price,
          addToResidentAccount: itemAddFlag,
          canteenItemNumber,
        };
        onSalesChange((current) => ({
          ...current,
          items: [...current.items, item],
        }));
      }
      setItemName("");
      setItemPrice("");
      setItemStockNumber("");
      setItemAddFlag(false);
    } catch {
      setError("تعذر حفظ صنف المشتريات.");
    } finally {
      setSaving(false);
    }
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!categoryName.trim()) {
      setError("أدخل اسم الفئة.");
      return;
    }
    setSaving(true);
    try {
      if (persistent) {
        const result = await saveInvoiceCategoryAction({ name: categoryName });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSalesChange((current) => ({
          ...current,
          categories: [...current.categories, result.category],
        }));
      } else {
        const category = {
          id: Math.max(0, ...sales.categories.map((entry) => entry.id)) + 1,
          name: categoryName.trim().normalize("NFC"),
        };
        onSalesChange((current) => ({
          ...current,
          categories: [...current.categories, category],
        }));
      }
      setCategoryName("");
    } catch {
      setError("تعذر حفظ الفئة.");
    } finally {
      setSaving(false);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (paymentTargetId === null) return;
    setError("");
    const amount = Number(paymentAmount);
    if (!Number.isInteger(amount) || amount <= 0 || !paymentDate) {
      setError("أدخل مبلغًا صحيحًا وتاريخًا للدفعة.");
      return;
    }
    const invoice = sales.invoices.find(
      (entry) => entry.invoiceNumber === paymentTargetId,
    );
    if (!invoice || amount > invoice.balance) {
      setError("المبلغ أكبر من الرصيد المستحق.");
      return;
    }
    setSaving(true);
    try {
      if (persistent) {
        const result = await recordInvoicePaymentAction(
          paymentTargetId,
          amount,
          paymentDate,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSalesChange((current) => ({
          ...current,
          invoices: current.invoices.map((entry) =>
            entry.invoiceNumber === paymentTargetId
              ? {
                  ...entry,
                  payments: [...entry.payments, result.payment],
                  paid: entry.paid + amount,
                  balance: result.balance,
                }
              : entry,
          ),
        }));
      } else {
        const payment: InvoicePayment = {
          id:
            Math.max(
              0,
              ...sales.invoices.flatMap((entry) =>
                entry.payments.map((row) => row.id),
              ),
            ) + 1,
          kind: "payment",
          amount,
          paymentDate,
        };
        onSalesChange((current) => ({
          ...current,
          invoices: current.invoices.map((entry) =>
            entry.invoiceNumber === paymentTargetId
              ? {
                  ...entry,
                  payments: [...entry.payments, payment],
                  paid: entry.paid + amount,
                  balance: entry.balance - amount,
                }
              : entry,
          ),
        }));
      }
      setPaymentTargetId(null);
      setPaymentAmount("");
    } catch {
      setError("تعذر تسجيل الدفعة.");
    } finally {
      setSaving(false);
    }
  }

  async function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (voidTargetId === null) return;
    const invoice = sales.invoices.find(
      (entry) => entry.invoiceNumber === voidTargetId,
    );
    if (!invoice || !voidReason.trim()) {
      setError("أدخل سبب إلغاء الفاتورة.");
      return;
    }
    if (invoice.paid > 0 && !confirmRefund) {
      setError("أكد تنفيذ رد المبلغ قبل إلغاء الفاتورة المسددة.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      let movementIds = invoice.lines.flatMap((line) =>
        line.stockMovementId === null ? [] : [line.stockMovementId],
      );
      let refund: InvoicePayment | null = null;
      if (persistent) {
        const result = await voidResidentInvoiceAction(
          voidTargetId,
          voidReason,
          confirmRefund,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        movementIds = result.movementIds;
        refund = result.refund;
      } else if (invoice.paid > 0) {
        refund = {
          id:
            Math.max(
              0,
              ...sales.invoices.flatMap((entry) =>
                entry.payments.map((payment) => payment.id),
              ),
            ) + 1,
          kind: "refund",
          amount: invoice.paid,
          paymentDate: localDateValue(),
        };
      }
      onSalesChange((current) => ({
        ...current,
        invoices: current.invoices.map((entry) =>
          entry.invoiceNumber === voidTargetId
            ? {
                ...entry,
                payments: refund ? [...entry.payments, refund] : entry.payments,
                paid: 0,
                balance: 0,
                voided: true,
                voidReason: voidReason.trim(),
              }
            : entry,
        ),
      }));
      onCanteenChange((current) => ({
        ...current,
        movements: current.movements.map((movement) =>
          movementIds.includes(movement.id)
            ? { ...movement, voided: true, voidReason: voidReason.trim() }
            : movement,
        ),
      }));
      setVoidTargetId(null);
      setVoidReason("");
      setConfirmRefund(false);
    } catch {
      setError("تعذر إلغاء الفاتورة.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-panel inventory-panel sales-panel">
      <div className="panel-heading">
        <div>
          <h3>مبيعات الكانتين وفواتير النزلاء</h3>
          <p>
            تُخصم الأصناف المرتبطة بالمخزون عند حفظ الفاتورة. إدارة المبيعات
            للمسؤول فقط.
          </p>
        </div>
        <div className="action-group">
          <button
            className={section === "sale" ? "primary-button" : "secondary-button"}
            type="button"
            onClick={() => {
              setSection("sale");
              setError("");
            }}
          >
            فاتورة جديدة
          </button>
          <button
            className={
              section === "history" ? "primary-button" : "secondary-button"
            }
            type="button"
            onClick={() => {
              setSection("history");
              setError("");
            }}
          >
            سجل الفواتير
          </button>
          <button
            className={
              section === "catalog" ? "primary-button" : "secondary-button"
            }
            type="button"
            onClick={() => {
              setSection("catalog");
              setError("");
            }}
          >
            الأصناف والفئات
          </button>
        </div>
      </div>

      {error && (
        <p className="form-error sales-error" role="alert">
          {error}
        </p>
      )}

      {section === "sale" && (
        <form className="inventory-form sales-form" onSubmit={submitInvoice}>
          <label className="form-field">
            نوع الفاتورة
            <select
              value={saleType}
              onChange={(event) => {
                const next = event.target.value === "cash" ? "cash" : "resident";
                setSaleType(next);
                setInitialPayment(next === "cash" ? String(draftTotal) : "0");
              }}
            >
              <option value="resident">على حساب نزيل</option>
              <option value="cash">بيع نقدي</option>
            </select>
          </label>
          {saleType === "resident" && (
            <label className="form-field">
              النزيل
              <select
                required
                value={residentId}
                onChange={(event) => setResidentId(event.target.value)}
              >
                <option value="">اختر النزيل</option>
                {residents.map((resident) => (
                  <option key={resident.id} value={resident.id}>
                    {resident.name} — {resident.fileNumber}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="form-field">
            تاريخ الفاتورة
            <input
              type="date"
              required
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
            />
          </label>
          <label className="form-field">
            الدفعة الأولى
            <input
              type="number"
              min="0"
              step="1"
              required
              readOnly={saleType === "cash"}
              value={saleType === "cash" ? draftTotal : initialPayment}
              onChange={(event) => setInitialPayment(event.target.value)}
            />
          </label>

          <div className="sales-lines">
            {preparedLines.map((line, index) => (
              <div className="sales-line" key={index}>
                <label className="form-field">
                  الصنف
                  <select
                    required
                    value={line.draft.catalogId}
                    onChange={(event) =>
                      updateDraftLine(index, { catalogId: event.target.value })
                    }
                  >
                    <option value="">اختر الصنف</option>
                    {sales.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {numberFormatter.format(item.price)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  الكمية
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={line.draft.quantity}
                    onChange={(event) =>
                      updateDraftLine(index, { quantity: event.target.value })
                    }
                  />
                </label>
                <label className="form-field">
                  الفئة
                  <select
                    value={line.draft.categoryId}
                    onChange={(event) =>
                      updateDraftLine(index, { categoryId: event.target.value })
                    }
                  >
                    <option value="">بدون فئة</option>
                    {sales.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  الفئه
                  <select
                    value={line.draft.alternateCategory}
                    onChange={(event) =>
                      updateDraftLine(index, {
                        alternateCategory: event.target.value,
                      })
                    }
                  >
                    <option value="">بدون فئة بديلة</option>
                    {lookups.alternateCategories.map((category) =>
                      category.name ? (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ) : null,
                    )}
                  </select>
                </label>
                <span className="sales-line-total">
                  الإجمالي:{" "}
                  {line.validTotal
                    ? numberFormatter.format(line.total)
                    : "تحقق من السعر والكمية"}
                </span>
                {draftLines.length > 1 && (
                  <button
                    className="table-action"
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      setDraftLines((current) =>
                        current.filter((_, lineIndex) => lineIndex !== index),
                      )
                    }
                  >
                    حذف البند
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            className="secondary-button"
            type="button"
            disabled={saving || draftLines.length >= 100}
            onClick={() =>
              setDraftLines((current) => [
                ...current,
                {
                  catalogId: "",
                  quantity: "1",
                  categoryId: "",
                  alternateCategory: "",
                },
              ])
            }
          >
            إضافة بند
          </button>

          <div className="sales-total">
            إجمالي الفاتورة: <strong>{numberFormatter.format(draftTotal)}</strong>
            {saleType === "cash" && " — يلزم سداد القيمة كاملة"}
          </div>
          {!sales.items.length && (
            <p className="access-note">
              أضف أصناف المشتريات أولًا من تبويب الأصناف والفئات.
            </p>
          )}
          {saleType === "resident" && !residents.length && (
            <p className="access-note">لا يوجد نزلاء متاحون لإنشاء فاتورة.</p>
          )}
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={clearDraft}
            >
              مسح النموذج
            </button>
            <button
              className="primary-button"
              disabled={saving || !canCreateInvoice}
            >
              {saving ? "جارٍ الحفظ..." : "حفظ الفاتورة وخصم المخزون"}
            </button>
          </div>
        </form>
      )}

      {section === "catalog" && (
        <div className="sales-catalog">
          <form className="inventory-form sales-form" onSubmit={submitSalesItem}>
            <h4>مشتريات النزلاء</h4>
            <label className="form-field">
              الصنف
              <input
                required
                maxLength={160}
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
              />
            </label>
            <label className="form-field">
              السعر
              <input
                type="number"
                min="0"
                step="any"
                required
                value={itemPrice}
                onChange={(event) => setItemPrice(event.target.value)}
              />
            </label>
            <label className="form-field">
              صنف المخزون المرتبط
              <select
                value={itemStockNumber}
                onChange={(event) => setItemStockNumber(event.target.value)}
              >
                <option value="">لا يخصم من مخزون الكانتين</option>
                {canteen.products.map((item) => (
                  <option key={item.itemNumber} value={item.itemNumber}>
                    {item.name} — {item.itemNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={itemAddFlag}
                onChange={(event) => setItemAddFlag(event.target.checked)}
              />
              اضافة (حقل Access الأصلي)
            </label>
            <button className="primary-button" disabled={saving}>
              حفظ الصنف
            </button>
          </form>

          <form className="inventory-form sales-form" onSubmit={submitCategory}>
            <h4>الفئة</h4>
            <label className="form-field">
              اسم الفئة
              <input
                required
                maxLength={120}
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
              />
            </label>
            <button className="primary-button" disabled={saving}>
              إضافة فئة
            </button>
          </form>

          <div className="table-wrap">
            <table className="resident-table inventory-table">
              <thead>
                <tr>
                  <th scope="col">الصنف</th>
                  <th scope="col">السعر</th>
                  <th scope="col">اضافة</th>
                  <th scope="col">الارتباط بالمخزون</th>
                </tr>
              </thead>
              <tbody>
                {sales.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{numberFormatter.format(item.price)}</td>
                    <td>{item.addToResidentAccount ? "نعم" : "لا"}</td>
                    <td>
                      {canteen.products.find(
                        (product) =>
                          product.itemNumber === item.canteenItemNumber,
                      )?.name ?? "لا يوجد"}
                    </td>
                  </tr>
                ))}
                {!sales.items.length && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">لا توجد أصناف مسجلة.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="resident-table inventory-table">
              <thead>
                <tr>
                  <th scope="col">رقم الفئة</th>
                  <th scope="col">الفئة</th>
                </tr>
              </thead>
              <tbody>
                {sales.categories.map((category) => (
                  <tr key={category.id}>
                    <td>{category.id}</td>
                    <td>{category.name}</td>
                  </tr>
                ))}
                {!sales.categories.length && (
                  <tr>
                    <td colSpan={2}>
                      <div className="empty-state">لا توجد فئات مسجلة.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "history" && (
        <div className="sales-invoice-list">
          {sales.invoices.map((invoice) => (
            <article className="sales-invoice-card" key={invoice.invoiceNumber}>
              <div className="sales-invoice-heading">
                <div>
                  <h4>فاتورة رقم {invoice.invoiceNumber}</h4>
                  <p>
                    {formatDate(invoice.invoiceDate)} —{" "}
                    {invoice.saleType === "cash" ? "بيع نقدي" : invoice.residentName}
                  </p>
                </div>
                <div className="sales-invoice-totals">
                  <span>الإجمالي: {numberFormatter.format(invoice.total)}</span>
                  <span>المسدد: {numberFormatter.format(invoice.paid)}</span>
                  <strong>الرصيد: {numberFormatter.format(invoice.balance)}</strong>
                  <span>{invoice.voided ? `ملغاة: ${invoice.voidReason}` : "سارية"}</span>
                </div>
              </div>
              <div className="table-wrap">
                <table className="resident-table inventory-table">
                  <thead>
                    <tr>
                      <th scope="col">الصنف</th>
                      <th scope="col">السعر</th>
                      <th scope="col">الكمية</th>
                      <th scope="col">الاجمالى</th>
                      <th scope="col">الفئة</th>
                      <th scope="col">الفئه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.itemName}</td>
                        <td>{numberFormatter.format(line.unitPrice)}</td>
                        <td>{numberFormatter.format(line.quantity)}</td>
                        <td>{numberFormatter.format(line.total)}</td>
                        <td>
                          {sales.categories.find(
                            (category) => category.id === line.categoryId,
                          )?.name ?? "—"}
                        </td>
                        <td>{line.alternateCategory || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!!invoice.payments.length && (
                <p className="access-note">
                  سجل السداد:{" "}
                  {invoice.payments
                    .map(
                      (payment) =>
                        `${payment.kind === "refund" ? "رد" : "سداد"} ${numberFormatter.format(payment.amount)} (${formatDate(payment.paymentDate)})`,
                    )
                    .join(" — ")}
                </p>
              )}
              <div className="action-group sales-invoice-actions">
                {!invoice.voided &&
                  invoice.saleType === "resident" &&
                  invoice.balance > 0 &&
                  paymentTargetId !== invoice.invoiceNumber && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setPaymentTargetId(invoice.invoiceNumber);
                        setPaymentAmount("");
                        setPaymentDate(localDateValue());
                        setError("");
                      }}
                    >
                      تسجيل دفعة
                    </button>
                  )}
                {!invoice.voided && voidTargetId !== invoice.invoiceNumber && (
                  <button
                    className="table-action"
                    type="button"
                    onClick={() => {
                      setVoidTargetId(invoice.invoiceNumber);
                      setVoidReason("");
                      setConfirmRefund(false);
                      setError("");
                    }}
                  >
                    إلغاء الفاتورة
                  </button>
                )}
              </div>
              {paymentTargetId === invoice.invoiceNumber && (
                <form className="sales-inline-form" onSubmit={submitPayment}>
                  <label className="form-field">
                    مبلغ الدفعة
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      max={invoice.balance}
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    تاريخ الدفعة
                    <input
                      type="date"
                      required
                      value={paymentDate}
                      onChange={(event) => setPaymentDate(event.target.value)}
                    />
                  </label>
                  <button className="primary-button" disabled={saving}>
                    تسجيل الدفعة
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={saving}
                    onClick={() => setPaymentTargetId(null)}
                  >
                    تراجع
                  </button>
                </form>
              )}
              {voidTargetId === invoice.invoiceNumber && (
                <form className="sales-inline-form" onSubmit={submitVoid}>
                  <label className="form-field">
                    سبب الإلغاء
                    <input
                      required
                      maxLength={500}
                      value={voidReason}
                      onChange={(event) => setVoidReason(event.target.value)}
                    />
                  </label>
                  {invoice.paid > 0 && (
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={confirmRefund}
                        onChange={(event) =>
                          setConfirmRefund(event.target.checked)
                        }
                      />
                      أؤكد رد كامل المبلغ المسدد
                    </label>
                  )}
                  <button className="primary-button" disabled={saving}>
                    تأكيد الإلغاء ورد المخزون
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={saving}
                    onClick={() => setVoidTargetId(null)}
                  >
                    تراجع
                  </button>
                </form>
              )}
            </article>
          ))}
          {!sales.invoices.length && (
            <div className="empty-state">لا توجد فواتير مسجلة بعد.</div>
          )}
          <p className="access-note">
            تعرض الصفحة آخر 100 فاتورة. فواتير البيع النقدي تُسدد كاملة عند
            التسجيل؛ دفعات حساب النزيل يمكن أن تكون جزئية. إلغاء فاتورة مسددة
            يسجل رد المبلغ بعد تأكيد تنفيذه.
          </p>
        </div>
      )}
    </section>
  );
}
