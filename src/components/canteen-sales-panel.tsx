"use client";

import PrintBrand from "@/components/print-brand";
import { printCurrentView, printSingleRecord } from "@/lib/print";

import { useMemo, useState, type FormEvent } from "react";
import {
  createResidentInvoiceAction,
  deleteCanteenSalesItemAction,
  deleteInvoiceCategoryAction,
  recordInvoicePaymentAction,
  saveCanteenSalesItemAction,
  saveInvoiceCategoryAction,
  voidResidentInvoiceAction,
} from "@/app/actions/canteen-sales";
import { formatDate, localDateValue } from "@/lib/date-format";
import ResidentPicker from "@/components/resident-picker";
import {
  filterCanteenInvoices,
  summarizeCanteenInvoices,
  UNLINKED_RESIDENT_FILTER,
} from "@/lib/canteen-sales-utils";
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
  canManage?: boolean;
  initialSection?: string | null;
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
  canManage = true,
  initialSection,
  onSalesChange,
  onCanteenChange,
}: Props) {
  const [section, setSection] = useState<"sale" | "history" | "catalog">(() => {
    if (!canManage) return "history";
    return initialSection === "history" || initialSection === "catalog"
      ? initialSection
      : "sale";
  });
  const [saleType, setSaleType] = useState<"resident" | "cash">("resident");
  const [saleMode, setSaleMode] = useState<"single" | "grouped">("single");
  const [residentId, setResidentId] = useState(residents[0]?.id ?? "");
  const [residentPickerValue, setResidentPickerValue] = useState(
    () => residents[0]?.name ?? "",
  );
  const [invoiceDate, setInvoiceDate] = useState(localDateValue());
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
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [saleCategoryFilter, setSaleCategoryFilter] = useState("");
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [paymentTargetId, setPaymentTargetId] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(localDateValue());
  const [voidTargetId, setVoidTargetId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [historyResidentId, setHistoryResidentId] = useState("");
  const [historyItemName, setHistoryItemName] = useState("");
  const [historyCategoryId, setHistoryCategoryId] = useState("");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [historySaleType, setHistorySaleType] = useState<
    "all" | "cash" | "resident"
  >("all");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const stockBalances = useMemo(() => {
    const balances = new Map<number, number>();
    for (const movement of canteen.movements) {
      if (movement.voided || movement.needsReview) continue;
      balances.set(
        movement.itemNumber,
        (balances.get(movement.itemNumber) ?? 0) +
          (movement.incoming ?? 0) -
          (movement.outgoing ?? 0),
      );
    }
    return balances;
  }, [canteen.movements]);

  const historyItemNames = useMemo(() => {
    const names = new Set<string>();
    for (const item of sales.items) names.add(item.name);
    for (const product of canteen.products) names.add(product.name);
    for (const invoice of sales.invoices) {
      for (const line of invoice.lines) names.add(line.itemName);
    }
    return [...names].sort((left, right) => left.localeCompare(right, "ar"));
  }, [canteen.products, sales.invoices, sales.items]);

  const filteredInvoices = useMemo(
    () =>
      filterCanteenInvoices(sales.invoices, {
        residentId: historyResidentId,
        itemName: historyItemName,
        categoryId: historyCategoryId,
        fromDate: historyFromDate,
        toDate: historyToDate,
        saleType: historySaleType,
      }),
    [
      sales.invoices,
      historyResidentId,
      historyItemName,
      historyCategoryId,
      historyFromDate,
      historyToDate,
      historySaleType,
    ],
  );

  const historySummary = useMemo(
    () => summarizeCanteenInvoices(filteredInvoices),
    [filteredInvoices],
  );

  const historyResidentLabel = useMemo(() => {
    if (!historyResidentId) return "";
    if (historyResidentId === UNLINKED_RESIDENT_FILTER) {
      return "غير مرتبط بنزيل";
    }
    return (
      residents.find((resident) => resident.id === historyResidentId)?.name ??
      ""
    );
  }, [historyResidentId, residents]);

  const hasUnlinkedInvoices = useMemo(
    () => sales.invoices.some((invoice) => invoice.residentId === null),
    [sales.invoices],
  );

  const historyFiltersDescription = [
    historyFromDate || historyToDate
      ? `الفترة: ${historyFromDate ? formatDate(historyFromDate) : "البداية"} — ${historyToDate ? formatDate(historyToDate) : "الآن"}`
      : "الفترة: كل الحركات",
    historyResidentLabel ? `النزيل: ${historyResidentLabel}` : null,
    historyItemName.trim() ? `الصنف: ${historyItemName.trim()}` : null,
    historyCategoryId
      ? `الفئة: ${
          sales.categories.find(
            (category) => String(category.id) === historyCategoryId,
          )?.name ?? ""
        }`
      : null,
    historySaleType === "cash"
      ? "النوع: بيع نقدي"
      : historySaleType === "resident"
        ? "النوع: على الحساب"
        : null,
  ]
    .filter(Boolean)
    .join(" — ");

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
      (line) =>
        line.catalogItem &&
        line.quantity > 0 &&
        line.validTotal &&
        Boolean(line.draft.categoryId),
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
    setSaleMode("single");
    const firstResident = residents[0];
    setResidentId(firstResident?.id ?? "");
    setResidentPickerValue(firstResident?.name ?? "");
    setInvoiceDate(localDateValue());
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
    const initialPaid = saleType === "cash" ? draftTotal : 0;
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
      setError("أكمل بيانات الحركة وتأكد من صحة المبالغ والكميات.");
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
      setError("تعذر حفظ الحركة. تحقق من الاتصال وحاول مرة أخرى.");
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
    const categoryId = itemCategoryId ? Number(itemCategoryId) : null;
    if (
      !itemName.trim() ||
      !Number.isFinite(price) ||
      price < 0 ||
      categoryId === null ||
      !sales.categories.some((category) => category.id === categoryId) ||
      (canteenItemNumber !== null &&
        !canteen.products.some(
          (item) => item.itemNumber === canteenItemNumber,
        ))
    ) {
      setError("أدخل اسمًا وسعرًا صحيحين واختر فئة للصنف.");
      return;
    }
    setSaving(true);
    try {
      if (persistent) {
        const result = await saveCanteenSalesItemAction({
          id: editingItemId,
          name: itemName,
          price,
          addToResidentAccount: itemAddFlag,
          canteenItemNumber,
          categoryId,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSalesChange((current) => ({
          ...current,
          items: editingItemId === null
            ? [...current.items, result.item]
            : current.items.map((item) => item.id === editingItemId ? result.item : item),
        }));
      } else {
        const item = {
          id: editingItemId ?? Math.max(0, ...sales.items.map((entry) => entry.id)) + 1,
          name: itemName.trim().normalize("NFC"),
          price,
          addToResidentAccount: itemAddFlag,
          canteenItemNumber,
          categoryId,
          categoryName:
            sales.categories.find((category) => category.id === categoryId)
              ?.name ?? "",
        };
        onSalesChange((current) => ({
          ...current,
          items: editingItemId === null
            ? [...current.items, item]
            : current.items.map((entry) => entry.id === editingItemId ? item : entry),
        }));
      }
      setEditingItemId(null);
      setItemName("");
      setItemPrice("");
      setItemStockNumber("");
      setItemAddFlag(false);
      setItemCategoryId("");
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
        const result = await saveInvoiceCategoryAction({ id: editingCategoryId, name: categoryName });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSalesChange((current) => ({
          ...current,
          categories: editingCategoryId === null
            ? [...current.categories, result.category]
            : current.categories.map((category) => category.id === editingCategoryId ? result.category : category),
        }));
      } else {
        const category = {
          id: editingCategoryId ?? Math.max(0, ...sales.categories.map((entry) => entry.id)) + 1,
          name: categoryName.trim().normalize("NFC"),
        };
        onSalesChange((current) => ({
          ...current,
          categories: editingCategoryId === null
            ? [...current.categories, category]
            : current.categories.map((entry) => entry.id === editingCategoryId ? category : entry),
        }));
      }
      setCategoryName("");
      setEditingCategoryId(null);
    } catch {
      setError("تعذر حفظ الفئة.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSalesItem(id: number, name: string) {
    if (!window.confirm(`حذف الصنف «${name}»؟ لا يمكن التراجع.`)) return;
    setError("");
    setSaving(true);
    try {
      if (persistent) {
        const result = await deleteCanteenSalesItemAction(id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      onSalesChange((current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== id),
      }));
      if (editingItemId === id) {
        setEditingItemId(null);
        setItemName("");
        setItemPrice("");
        setItemStockNumber("");
        setItemAddFlag(false);
        setItemCategoryId("");
      }
    } catch {
      setError("تعذر حذف الصنف.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(id: number, name: string) {
    if (!window.confirm(`حذف الفئة «${name}»؟ لا يمكن التراجع.`)) return;
    setError("");
    setSaving(true);
    try {
      if (persistent) {
        const result = await deleteInvoiceCategoryAction(id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      onSalesChange((current) => ({
        ...current,
        categories: current.categories.filter((category) => category.id !== id),
      }));
      if (editingCategoryId === id) {
        setEditingCategoryId(null);
        setCategoryName("");
      }
    } catch {
      setError("تعذر حذف الفئة.");
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
      setError("أدخل سبب إلغاء الحركة.");
      return;
    }
    if (invoice.paid > 0 && !confirmRefund) {
      setError("أكد تنفيذ رد المبلغ قبل إلغاء الحركة المسددة.");
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
      setError("تعذر إلغاء الحركة.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-panel inventory-panel sales-panel">
      <div className="panel-heading">
        <div>
          <h3>حركات ومبيعات الكانتين</h3>
          <p>
            سجّل حركة بيع نقدي أو على حساب نزيل، وتُخصم الأصناف المرتبطة
            بالمخزون فورًا. إدارة المبيعات للمسؤول فقط.
          </p>
        </div>
        <div className="action-group">
          {canManage && <button
            className={section === "sale" ? "primary-button" : "secondary-button"}
            type="button"
            onClick={() => {
              setSection("sale");
              setError("");
            }}
          >
            تسجيل حركة بيع جديدة
          </button>}
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
            سجل حركات البيع
          </button>
          {canManage && <button
            className={
              section === "catalog" ? "primary-button" : "secondary-button"
            }
            type="button"
            onClick={() => {
              setSection("catalog");
              setError("");
            }}
          >
            أصناف البيع والفئات
          </button>}
        </div>
      </div>

      {error && (
        <p className="form-error sales-error" role="alert">
          {error}
        </p>
      )}

      {canManage && section === "sale" && (
        <form className="inventory-form sales-form" onSubmit={submitInvoice}>
          <label className="form-field">
            نمط البيع
            <select
              value={saleMode}
              onChange={(event) => {
                const next = event.target.value === "grouped" ? "grouped" : "single";
                setSaleMode(next);
                if (next === "single") {
                  setDraftLines((current) => current.slice(0, 1));
                }
              }}
            >
              <option value="single">بيع مفرد — صنف واحد</option>
              <option value="grouped">بيع مجمّع — عدة أصناف</option>
            </select>
          </label>
          <label className="form-field">
            طريقة البيع
            <select
              value={saleType}
              onChange={(event) => {
                const next = event.target.value === "cash" ? "cash" : "resident";
                setSaleType(next);
              }}
            >
              <option value="resident">على حساب نزيل</option>
              <option value="cash">بيع نقدي</option>
            </select>
          </label>
          {saleType === "resident" && (
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          )}
          <label className="form-field">
            تاريخ الحركة
            <input
              type="date"
              required
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
            />
          </label>
          {saleType === "cash" && <label className="form-field">
            المبلغ المدفوع نقدًا
            <input type="number" value={draftTotal} readOnly />
          </label>}

          <label className="form-field">
            تصفية الأصناف بالفئة
            <select
              value={saleCategoryFilter}
              onChange={(event) => setSaleCategoryFilter(event.target.value)}
            >
              <option value="">كل الفئات</option>
              {sales.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <div className="sales-lines">
            {preparedLines.map((line, index) => (
              <div className="sales-line" key={index}>
                <label className="form-field">
                  الصنف
                  <select
                    required
                    value={line.draft.catalogId}
                    onChange={(event) => {
                      const item = sales.items.find(
                        (entry) => String(entry.id) === event.target.value,
                      );
                      updateDraftLine(index, {
                        catalogId: event.target.value,
                        categoryId: item?.categoryId
                          ? String(item.categoryId)
                          : "",
                      });
                    }}
                  >
                    <option value="">اختر الصنف</option>
                    {sales.items
                      .filter(
                        (item) =>
                          !saleCategoryFilter ||
                          String(item.categoryId ?? "") === saleCategoryFilter,
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — {numberFormatter.format(item.price)}
                          {item.categoryName ? ` — ${item.categoryName}` : ""}
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
                  فئة الصنف
                  <select
                    required
                    value={line.draft.categoryId}
                    onChange={(event) =>
                      updateDraftLine(index, { categoryId: event.target.value })
                    }
                  >
                    <option value="">اختر الفئة</option>
                    {sales.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                {saleMode === "grouped" && (
                  <label className="form-field">
                    فئة المصدر القديمة
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
                )}
                <span className="sales-line-total">
                  الإجمالي:{" "}
                  {line.validTotal
                    ? numberFormatter.format(line.total)
                    : "تحقق من السعر والكمية"}
                </span>
                {saleMode === "grouped" && draftLines.length > 1 && (
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

          {saleMode === "grouped" && (
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
          )}

          <div className="sales-total">
            إجمالي الحركة: <strong>{numberFormatter.format(draftTotal)}</strong>
            {saleType === "cash" && " — يلزم سداد القيمة كاملة"}
            {saleType === "resident" && " — يُضاف كامل المبلغ إلى حساب النزيل"}
          </div>
          {saleType === "resident" && (
            <p className="access-note">
              سيُخصم المبلغ من حساب النزيل فورًا، ويُسمح بأن يصبح الرصيد سالبًا
              (مديونية على النزيل).
            </p>
          )}
          {!sales.items.length && (
            <p className="access-note">
              أضف أصناف البيع أولًا من تبويب الأصناف والفئات.
            </p>
          )}
          {saleType === "resident" && !residents.length && (
            <p className="access-note">لا يوجد نزلاء متاحون لتسجيل حركة على الحساب.</p>
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
              {saving ? "جارٍ الحفظ..." : "تسجيل حركة البيع وخصم المخزون"}
            </button>
          </div>
        </form>
      )}

      {canManage && section === "catalog" && (
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
              فئة الصنف *
              <select
                required
                value={itemCategoryId}
                onChange={(event) => setItemCategoryId(event.target.value)}
              >
                <option value="">اختر الفئة</option>
                {sales.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
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
              إضافة إلى الحركة
            </label>
            <button className="primary-button" disabled={saving}>
              حفظ الصنف
            </button>
          </form>

          <form className="inventory-form sales-form" onSubmit={submitCategory}>
            <h4>فئات الأصناف</h4>
            <label className="form-field">
              اسم فئة الصنف
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

          <div className="sales-catalog-filters">
            <label className="form-field">
              بحث باسم الصنف
              <input
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                placeholder="ابحث..."
              />
            </label>
            <label className="form-field">
              تصفية بالفئة
              <select
                value={catalogCategoryFilter}
                onChange={(event) => setCatalogCategoryFilter(event.target.value)}
              >
                <option value="">كل الفئات</option>
                {sales.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table className="resident-table inventory-table">
              <thead>
                <tr>
                  <th scope="col">الصنف</th>
                  <th scope="col">الفئة</th>
                  <th scope="col">السعر</th>
                  <th scope="col">اضافة</th>
                  <th scope="col">الارتباط بالمخزون</th>
                  <th scope="col">المراجعة</th>
                  <th scope="col">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {sales.items
                  .filter(
                    (item) =>
                      (!catalogCategoryFilter ||
                        String(item.categoryId ?? "") ===
                          catalogCategoryFilter) &&
                      (!catalogSearch.trim() ||
                        item.name.includes(catalogSearch.trim())),
                  )
                  .map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.categoryName || "بدون فئة"}</td>
                    <td>{numberFormatter.format(item.price)}</td>
                    <td>{item.addToResidentAccount ? "نعم" : "لا"}</td>
                    <td>
                      {canteen.products.find(
                        (product) =>
                          product.itemNumber === item.canteenItemNumber,
                      )?.name ?? "لا يوجد"}
                    </td>
                    <td>{item.needsReview || item.price <= 0 ? "يحتاج مراجعة" : "سليم"}</td>
                    <td>
                      <div className="action-group">
                        <button
                          className="table-action"
                          disabled={saving}
                          onClick={() => {
                            setEditingItemId(item.id);
                            setItemName(item.name);
                            setItemPrice(String(item.price));
                            setItemStockNumber(item.canteenItemNumber?.toString() ?? "");
                            setItemAddFlag(item.addToResidentAccount);
                            setItemCategoryId(item.categoryId?.toString() ?? "");
                          }}
                          type="button"
                        >تعديل</button>
                        <button
                          className="table-action danger-action"
                          disabled={saving}
                          onClick={() => void removeSalesItem(item.id, item.name)}
                          type="button"
                        >حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!sales.items.length && (
                  <tr>
                    <td colSpan={7}>
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
                  <th scope="col">اسم الفئة</th>
                  <th scope="col">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {sales.categories.map((category) => (
                  <tr key={category.id}>
                    <td>{category.id}</td>
                    <td>{category.name}</td>
                    <td>
                      <div className="action-group">
                        <button
                          className="table-action"
                          type="button"
                          onClick={() => {
                            setEditingCategoryId(category.id);
                            setCategoryName(category.name);
                          }}
                        >
                          تعديل
                        </button>
                        <button
                          className="table-action danger-action"
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            void removeCategory(category.id, category.name)
                          }
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!sales.categories.length && (
                  <tr>
                    <td colSpan={3}>
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
          <div className="sales-history-heading">
            <div>
              <h4>سجل حركات البيع</h4>
              <p className="access-note">
                ابحث بالنزيل أو الصنف أو الفترة، ثم اطبع نتائج البحث كما تظهر
                على الشاشة.
              </p>
            </div>
            <div className="action-group no-print">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setHistoryResidentId("");
                  setHistoryItemName("");
                  setHistoryCategoryId("");
                  setHistoryFromDate("");
                  setHistoryToDate("");
                  setHistorySaleType("all");
                }}
              >
                مسح البحث
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={printCurrentView}
                disabled={!filteredInvoices.length}
              >
                طباعة نتائج البحث
              </button>
            </div>
          </div>

          <div className="canteen-report-filters sales-history-filters">
            <label>
              النزيل
              <select
                value={historyResidentId}
                onChange={(event) => setHistoryResidentId(event.target.value)}
              >
                <option value="">كل النزلاء</option>
                {hasUnlinkedInvoices && (
                  <option value={UNLINKED_RESIDENT_FILTER}>
                    غير مرتبط بنزيل
                  </option>
                )}
                {residents.map((resident) => (
                  <option key={resident.id} value={resident.id}>
                    {resident.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              الصنف
              <select
                value={historyItemName}
                onChange={(event) => setHistoryItemName(event.target.value)}
              >
                <option value="">كل الأصناف</option>
                {historyItemNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              الفئة
              <select
                value={historyCategoryId}
                onChange={(event) => setHistoryCategoryId(event.target.value)}
              >
                <option value="">كل الفئات</option>
                {sales.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              نوع البيع
              <select
                value={historySaleType}
                onChange={(event) =>
                  setHistorySaleType(
                    event.target.value === "cash"
                      ? "cash"
                      : event.target.value === "resident"
                        ? "resident"
                        : "all",
                  )
                }
              >
                <option value="all">النقدي والحساب</option>
                <option value="cash">بيع نقدي</option>
                <option value="resident">على حساب نزيل</option>
              </select>
            </label>
            <label>
              من تاريخ
              <input
                type="date"
                value={historyFromDate}
                onChange={(event) => setHistoryFromDate(event.target.value)}
              />
            </label>
            <label>
              إلى تاريخ
              <input
                type="date"
                value={historyToDate}
                onChange={(event) => setHistoryToDate(event.target.value)}
              />
            </label>
          </div>
          <p className="sales-history-filter-note">
            {historyFiltersDescription}
            {historySummary.voided > 0
              ? ` — ${numberFormatter.format(historySummary.voided)} حركة ملغاة لا تدخل في الإجماليات`
              : ""}
          </p>

          <div className="canteen-report-summary report-summary sales-history-summary">
            <article>
              <span>إجمالي البيع النقدي</span>
              <strong>{numberFormatter.format(historySummary.cash)}</strong>
            </article>
            <article>
              <span>إجمالي البيع على الحساب</span>
              <strong>{numberFormatter.format(historySummary.account)}</strong>
            </article>
            <article>
              <span>إجمالي حركات البيع</span>
              <strong>{numberFormatter.format(historySummary.total)}</strong>
            </article>
            <article>
              <span>عدد الحركات</span>
              <strong>{numberFormatter.format(historySummary.count)}</strong>
            </article>
          </div>

          <div className="report-detail">
          {filteredInvoices.map((invoice) => (
            <article className="sales-invoice-card" key={invoice.invoiceNumber}>
              <PrintBrand
                title={`حركة بيع رقم ${invoice.invoiceNumber}`}
                subtitle={`${formatDate(invoice.invoiceDate)} — ${invoice.saleType === "cash" ? "بيع نقدي" : invoice.residentName}`}
                meta={[
                  { label: "الإجمالي", value: numberFormatter.format(invoice.total) },
                  { label: "المسدد", value: numberFormatter.format(invoice.paid) },
                  { label: "الرصيد", value: numberFormatter.format(invoice.balance) },
                  { label: "البحث", value: historyFiltersDescription },
                ]}
              />
              <div className="sales-invoice-heading">
                <div>
                  <h4>حركة بيع رقم {invoice.invoiceNumber}</h4>
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
                  <button
                    className="secondary-button no-print"
                    type="button"
                    onClick={(event) => {
                      const card = event.currentTarget.closest(".sales-invoice-card");
                      if (card instanceof HTMLElement) printSingleRecord(card);
                    }}
                  >
                    طباعة الحركة
                  </button>
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
                      <th scope="col">فئة الصنف</th>
                      <th scope="col">فئة المصدر</th>
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
              {canManage && <div className="action-group sales-invoice-actions">
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
                    إلغاء الحركة
                  </button>
                )}
              </div>}
              {canManage && paymentTargetId === invoice.invoiceNumber && (
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
              {canManage && voidTargetId === invoice.invoiceNumber && (
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
          </div>
          {!filteredInvoices.length && (
            <div className="empty-state">
              {sales.invoices.length
                ? "لا توجد حركات بيع مطابقة لعوامل التصفية."
                : "لا توجد حركات بيع مسجلة بعد."}
            </div>
          )}
          <p className="access-note">
            تعرض الصفحة كل حركات البيع المسجلة مرتبة من الأقدم إلى الأحدث.
            البيع النقدي يُسدد كاملًا عند التسجيل؛ والبيع على الحساب يظهر
            كمدين في كشف حساب النزيل ويُسمح بالرصيد السالب. إلغاء حركة مسددة
            يسجل رد المبلغ بعد تأكيد تنفيذه.
          </p>
        </div>
      )}
    </section>
  );
}
