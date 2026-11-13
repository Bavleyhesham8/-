"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  createMeatSaleAction,
  recordRefrigeratorReceiptAction,
  saveRefrigeratorProductAction,
  voidMeatSaleAction,
} from "@/app/actions/meat-sales";
import PrintBrand from "@/components/print-brand";
import { formatDate, localDateValue } from "@/lib/date-format";
import { printCurrentView, printSingleRecord } from "@/lib/print";
import type {
  MeatSaleInvoice,
  MeatSaleLine,
  MeatSalePayment,
  MeatSalesBundle,
  RefrigeratorMovement,
} from "@/lib/meat-sales-types";

type Props = {
  sales: MeatSalesBundle;
  persistent: boolean;
  canManage?: boolean;
  initialSection?: string | null;
  onSalesChange: (
    update: (current: MeatSalesBundle) => MeatSalesBundle,
  ) => void;
};

type DraftLine = {
  itemNumber: string;
  price: string;
  quantity: string;
};

type PanelSection =
  | "sale"
  | "stock"
  | "catalog"
  | "history"
  | "report"
  | "balances";

function normalizeSection(value?: string | null): PanelSection {
  return value === "stock" ||
    value === "catalog" ||
    value === "history" ||
    value === "report" ||
    value === "balances"
    ? value
    : "sale";
}

function monthStartValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
}

function firstRecordedDate(sales: MeatSalesBundle) {
  const dates = [
    ...sales.movements.flatMap((movement) => [
      movement.receivedDate,
      movement.outgoingDate,
    ]),
    ...sales.invoices.map((invoice) => invoice.saleDate),
  ].filter((date): date is string => Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date)));
  return dates.sort()[0] ?? monthStartValue();
}

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

function formatOptionalNumber(value: number | null) {
  return value === null ? "—" : numberFormatter.format(value);
}

export default function MeatSalesPanel({
  sales,
  persistent,
  canManage = true,
  initialSection,
  onSalesChange,
}: Props) {
  const [section, setSection] = useState<PanelSection>(() =>
    canManage ? normalizeSection(initialSection) : "history",
  );
  const [reportStartDate, setReportStartDate] = useState(() =>
    firstRecordedDate(sales),
  );
  const [reportEndDate, setReportEndDate] = useState(localDateValue);
  const [appliedReportStartDate, setAppliedReportStartDate] =
    useState(() => firstRecordedDate(sales));
  const [appliedReportEndDate, setAppliedReportEndDate] =
    useState(localDateValue);
  const [reportItemNumber, setReportItemNumber] = useState("all");
  const [appliedReportItemNumber, setAppliedReportItemNumber] = useState("all");
  const [reportError, setReportError] = useState("");
  const [saleDate, setSaleDate] = useState(localDateValue());
  const [permitNumber, setPermitNumber] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { itemNumber: "", price: "", quantity: "1" },
  ]);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [catalogQuantity, setCatalogQuantity] = useState("0");
  const [receiptItemNumber, setReceiptItemNumber] = useState("");
  const [receiptQuantity, setReceiptQuantity] = useState("");
  const [receiptPrice, setReceiptPrice] = useState("");
  const [receiptDate, setReceiptDate] = useState(localDateValue());
  const [voidTargetId, setVoidTargetId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const balances = useMemo(() => {
    const result = new Map<number, number>();
    for (const movement of sales.movements) {
      if (movement.voided || movement.needsReview) continue;
      result.set(
        movement.itemNumber,
        (result.get(movement.itemNumber) ?? 0) +
          (movement.quantity ?? 0) -
          (movement.outgoing ?? 0),
      );
    }
    return result;
  }, [sales.movements]);
  function fridgeItemName(movement: RefrigeratorMovement) {
    const product = sales.products.find((entry) => entry.itemNumber === movement.itemNumber);
    const catalogItem = product ? sales.catalog.find((entry) => entry.id === product.catalogId) : null;
    return movement.itemCategory.trim() || product?.itemCategory || catalogItem?.itemCategory || "صنف غير معروف";
  }

  const reportMovements = useMemo(
    () =>
      sales.movements.filter((movement) => {
        const date = movement.receivedDate ?? movement.outgoingDate ?? "";
        return (
          (!appliedReportStartDate || date >= appliedReportStartDate) &&
          (!appliedReportEndDate || date <= appliedReportEndDate) &&
          (appliedReportItemNumber === "all" || String(movement.itemNumber) === appliedReportItemNumber)
        );
      }),
    [sales.movements, appliedReportStartDate, appliedReportEndDate, appliedReportItemNumber],
  );

  const reportInvoices = useMemo(
    () =>
      sales.invoices.filter(
        (invoice) =>
          (!appliedReportStartDate ||
            invoice.saleDate >= appliedReportStartDate) &&
          (!appliedReportEndDate || invoice.saleDate <= appliedReportEndDate) &&
          (appliedReportItemNumber === "all" || invoice.lines.some((line) => String(line.refrigeratorItemNumber) === appliedReportItemNumber)),
      ),
    [sales.invoices, appliedReportStartDate, appliedReportEndDate, appliedReportItemNumber],
  );

  const reportSummary = useMemo(() => {
    let incomingQuantity = 0;
    let incomingValue = 0;
    let incomingValueComplete = true;
    let outgoingQuantity = 0;
    let outgoingValue = 0;
    let outgoingValueComplete = true;
    for (const movement of reportMovements) {
      if (movement.voided) continue;
      if (movement.quantity !== null) {
        incomingQuantity += movement.quantity;
        if (movement.price === null) incomingValueComplete = false;
        else incomingValue += movement.quantity * movement.price;
      }
      if (movement.outgoing !== null) {
        outgoingQuantity += movement.outgoing;
        if (movement.price === null) outgoingValueComplete = false;
        else outgoingValue += movement.outgoing * movement.price;
      }
    }
    const activeInvoices = reportInvoices.filter(
      (invoice) => !invoice.voided,
    );
    return {
      incomingQuantity,
      incomingValue: incomingValueComplete ? incomingValue : null,
      outgoingQuantity,
      outgoingValue: outgoingValueComplete ? outgoingValue : null,
      remainingQuantity: incomingQuantity - outgoingQuantity,
      remainingValue:
        incomingValueComplete && outgoingValueComplete
          ? incomingValue - outgoingValue
          : null,
      invoiceCount: activeInvoices.length,
      invoiceTotal: activeInvoices.every((invoice) => invoice.total !== null)
        ? activeInvoices.reduce((sum, invoice) => sum + (appliedReportItemNumber === "all" ? (invoice.total ?? 0) : invoice.lines.filter((line) => String(line.refrigeratorItemNumber) === appliedReportItemNumber).reduce((lineTotal, line) => lineTotal + (line.total ?? line.price * line.quantity), 0)), 0)
        : null,
      invoicePaid: activeInvoices.reduce((sum, invoice) => {
        if (appliedReportItemNumber === "all") return sum + invoice.paid;
        const selectedTotal = invoice.lines
          .filter((line) => String(line.refrigeratorItemNumber) === appliedReportItemNumber)
          .reduce((lineTotal, line) => lineTotal + (line.total ?? line.price * line.quantity), 0);
        return sum + (invoice.total ? invoice.paid * selectedTotal / invoice.total : 0);
      }, 0),
      invoiceOutstanding: activeInvoices.every((invoice) => invoice.total !== null)
        ? activeInvoices.reduce(
            (sum, invoice) => {
              if (appliedReportItemNumber === "all") return sum + Math.max(0, (invoice.total ?? 0) - invoice.paid);
              const selectedTotal = invoice.lines
                .filter((line) => String(line.refrigeratorItemNumber) === appliedReportItemNumber)
                .reduce((lineTotal, line) => lineTotal + (line.total ?? line.price * line.quantity), 0);
              const allocatedPaid = invoice.total ? invoice.paid * selectedTotal / invoice.total : 0;
              return sum + Math.max(0, selectedTotal - allocatedPaid);
            },
            0,
          )
        : null,
    };
  }, [reportMovements, reportInvoices, appliedReportItemNumber]);

  const reportBalances = useMemo(() => {
    const result = new Map<number, number>();
    for (const movement of sales.movements) {
      if (movement.voided) continue;
      result.set(
        movement.itemNumber,
        (result.get(movement.itemNumber) ?? 0) +
          (movement.quantity ?? 0) -
          (movement.outgoing ?? 0),
      );
    }
    return result;
  }, [sales.movements]);

  const balanceRows = useMemo(
    () =>
      sales.products.map((product) => {
        const catalogItem = sales.catalog.find(
          (item) => item.id === product.catalogId,
        );
        let incoming = 0;
        let outgoing = 0;
        for (const movement of sales.movements) {
          if (
            movement.voided ||
            movement.needsReview ||
            movement.itemNumber !== product.itemNumber
          ) {
            continue;
          }
          incoming += movement.quantity ?? 0;
          outgoing += movement.outgoing ?? 0;
        }
        const price = catalogItem?.price ?? 0;
        return {
          product,
          price,
          incoming,
          outgoing,
          remaining: incoming - outgoing,
          incomingValue: incoming * price,
          outgoingValue: outgoing * price,
          remainingValue: (incoming - outgoing) * price,
        };
      }),
    [sales.products, sales.catalog, sales.movements],
  );

  function applyReportDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      reportStartDate &&
      reportEndDate &&
      reportStartDate > reportEndDate
    ) {
      setReportError("تاريخ البداية يجب أن يكون قبل تاريخ النهاية.");
      return;
    }
    setReportError("");
    setAppliedReportStartDate(reportStartDate);
    setAppliedReportEndDate(reportEndDate);
    setAppliedReportItemNumber(reportItemNumber);
  }

  const preparedLines = draftLines.map((line) => {
    const itemNumber = Number(line.itemNumber);
    const product = sales.products.find(
      (item) => item.itemNumber === itemNumber,
    );
    const price = Number(line.price);
    const quantity = Number(line.quantity);
    const total = price * quantity;
    return {
      draft: line,
      product,
      price,
      quantity,
      total,
      valid:
        !!product &&
        Number.isFinite(price) &&
        price >= 0 &&
        Number.isFinite(quantity) &&
        quantity > 0 &&
        Number.isFinite(total),
    };
  });
  const total = preparedLines.reduce(
    (sum, line) => sum + (line.valid ? line.total : 0),
    0,
  );
  const canSaveSale =
    !!sales.products.length &&
    preparedLines.every((line) => line.valid) &&
    total > 0;

  function updateDraft(index: number, patch: Partial<DraftLine>) {
    setDraftLines((current) =>
      current.map((line, lineIndex) =>
        index === lineIndex ? { ...line, ...patch } : line,
      ),
    );
  }

  function selectDraftProduct(index: number, value: string) {
    const itemNumber = Number(value);
    const product = sales.products.find((item) => item.itemNumber === itemNumber);
    const catalogItem = product
      ? sales.catalog.find((item) => item.id === product.catalogId)
      : null;
    updateDraft(index, {
      itemNumber: value,
      price: catalogItem ? String(catalogItem.price) : "",
    });
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const price = Number(productPrice);
    const quantity = Number(catalogQuantity);
    if (
      !productName.trim() ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isFinite(quantity) ||
      quantity < 0
    ) {
      setError("أدخل اسم الصنف والسعر وكمية الدليل بصورة صحيحة.");
      return;
    }
    if (
      sales.catalog.some(
        (item) =>
          item.itemCategory.normalize("NFC") ===
          productName.trim().normalize("NFC"),
      )
    ) {
      setError("اسم الصنف مسجل بالفعل.");
      return;
    }
    setSaving(true);
    try {
      if (persistent) {
        const result = await saveRefrigeratorProductAction({
          itemCategory: productName,
          price,
          quantity,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSalesChange((current) => ({
          ...current,
          catalog: [...current.catalog, result.catalogItem],
          products: [...current.products, result.product],
        }));
      } else {
        const catalogItem = {
          id: Math.max(0, ...sales.catalog.map((item) => item.id)) + 1,
          itemCategory: productName.trim().normalize("NFC"),
          price,
          quantity,
        };
        const itemNumber =
          Math.max(2000, ...sales.products.map((item) => item.itemNumber)) + 1;
        onSalesChange((current) => ({
          ...current,
          catalog: [...current.catalog, catalogItem],
          products: [
            ...current.products,
            {
              id: Math.max(0, ...current.products.map((item) => item.id)) + 1,
              itemNumber,
              catalogId: catalogItem.id,
              itemCategory: catalogItem.itemCategory,
              voucherNumber: null,
              beneficiary: "",
            },
          ],
        }));
      }
      setProductName("");
      setProductPrice("");
      setCatalogQuantity("0");
    } catch {
      setError("تعذر حفظ صنف الثلاجة.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const itemNumber = Number(receiptItemNumber);
    const quantity = Number(receiptQuantity);
    const price = Number(receiptPrice);
    if (
      !sales.products.some((item) => item.itemNumber === itemNumber) ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(price) ||
      price < 0 ||
      !receiptDate
    ) {
      setError("راجع صنف الوارد والكمية والسعر والتاريخ.");
      return;
    }
    setSaving(true);
    try {
      if (persistent) {
        const result = await recordRefrigeratorReceiptAction({
          itemNumber,
          quantity,
          price,
          receivedDate: receiptDate,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSalesChange((current) => ({
          ...current,
          movements: [result.movement, ...current.movements],
        }));
      } else {
        const product = sales.products.find(
          (item) => item.itemNumber === itemNumber,
        );
        if (!product) {
          setError("لم يتم العثور على صنف الثلاجة.");
          return;
        }
        onSalesChange((current) => ({
          ...current,
          movements: [
            {
              id:
                Math.max(0, ...current.movements.map((item) => item.id)) + 1,
              itemNumber,
              itemCategory: product.itemCategory,
              direction: "in",
              quantity,
              price,
              total: quantity * price,
              outgoing: null,
              receivedDate: receiptDate,
              outgoingDate: null,
              issuePermitNumber: null,
              recipient: "",
              needsReview: false,
              voided: false,
              voidReason: "",
            },
            ...current.movements,
          ],
        }));
      }
      setReceiptQuantity("");
      setReceiptPrice("");
      setReceiptDate(localDateValue());
    } catch {
      setError("تعذر تسجيل وارد الثلاجة.");
    } finally {
      setSaving(false);
    }
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsedPermit = permitNumber.trim() ? Number(permitNumber) : null;
    if (
      !canSaveSale ||
      !saleDate ||
      !beneficiary.trim() ||
      (parsedPermit !== null &&
        (!Number.isFinite(parsedPermit) || parsedPermit <= 0))
    ) {
      setError("أكمل بيانات الفاتورة وتأكد من صحة السعر والكمية.");
      return;
    }

    const requested = new Map<number, number>();
    for (const line of preparedLines) {
      if (!line.product) continue;
      requested.set(
        line.product.itemNumber,
        (requested.get(line.product.itemNumber) ?? 0) + line.quantity,
      );
    }
    for (const [itemNumber, quantity] of requested) {
      if (quantity > (balances.get(itemNumber) ?? 0) + 1e-9) {
        const product = sales.products.find(
          (item) => item.itemNumber === itemNumber,
        );
        setError(`الرصيد المتاح غير كافٍ للصنف ${product?.itemCategory ?? ""}.`);
        return;
      }
    }

    const saleItems = preparedLines.map((line) => ({
      itemNumber: line.product?.itemNumber ?? 0,
      price: line.price,
      quantity: line.quantity,
    }));
    setSaving(true);
    try {
      if (persistent) {
        const result = await createMeatSaleAction({
          saleDate,
          issuePermitNumber: parsedPermit,
          beneficiary: beneficiary.trim(),
          items: saleItems,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSalesChange((current) => ({
          ...current,
          invoices: [result.invoice, ...current.invoices],
          movements: [...result.movements, ...current.movements],
        }));
      } else {
        let nextMovementId = Math.max(
          0,
          ...sales.movements.map((movement) => movement.id),
        );
        const remaining = new Map(balances);
        const movementRows: RefrigeratorMovement[] = [];
        const lines: MeatSaleLine[] = [];
        for (const line of preparedLines) {
          if (!line.product) continue;
          const balance =
            (remaining.get(line.product.itemNumber) ?? 0) - line.quantity;
          remaining.set(line.product.itemNumber, balance);
          nextMovementId += 1;
          const movementId = nextMovementId;
          movementRows.push({
            id: movementId,
            itemNumber: line.product.itemNumber,
            itemCategory: line.product.itemCategory,
            direction: "out",
            quantity: null,
            price: line.price,
            total: line.total,
            outgoing: line.quantity,
            receivedDate: null,
            outgoingDate: saleDate,
            issuePermitNumber: parsedPermit,
            recipient: beneficiary.trim(),
            needsReview: false,
            voided: false,
            voidReason: "",
          });
          lines.push({
            id:
              Math.max(
                0,
                ...sales.invoices.flatMap((invoice) =>
                  invoice.lines.map((item) => item.id),
                ),
              ) +
              lines.length +
              1,
            itemCategory: line.product.itemCategory,
            price: line.price,
            quantity: line.quantity,
            total: line.total,
            refrigeratorItemNumber: line.product.itemNumber,
            movementId,
          });
        }
        const invoiceNumber =
          Math.max(0, ...sales.invoices.map((item) => item.invoiceNumber)) + 1;
        const payment: MeatSalePayment = {
          id:
            Math.max(
              0,
              ...sales.invoices.flatMap((invoice) =>
                invoice.payments.map((item) => item.id),
              ),
            ) + 1,
          kind: "payment",
          amount: total,
          paymentDate: saleDate,
        };
        const invoice: MeatSaleInvoice = {
          invoiceNumber,
          saleDate,
          issuePermitNumber: parsedPermit,
          beneficiary: beneficiary.trim(),
          lines,
          total,
          paid: total,
          voided: false,
          voidReason: "",
          payments: [payment],
        };
        onSalesChange((current) => ({
          ...current,
          invoices: [invoice, ...current.invoices],
          movements: [...movementRows, ...current.movements],
        }));
      }
      setSaleDate(localDateValue());
      setPermitNumber("");
      setBeneficiary("");
      setDraftLines([{ itemNumber: "", price: "", quantity: "1" }]);
      setSection("history");
    } catch {
      setError("تعذر حفظ فاتورة بيع اللحوم.");
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
      setError("أكد رد المبلغ قبل إلغاء الفاتورة المسددة.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      let movementIds = invoice.lines.flatMap((line) =>
        line.movementId === null ? [] : [line.movementId],
      );
      let refund: MeatSalePayment | null = null;
      if (persistent) {
        const result = await voidMeatSaleAction(
          invoice.invoiceNumber,
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
                voided: true,
                voidReason: voidReason.trim(),
              }
            : entry,
        ),
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
      setError("تعذر إلغاء فاتورة بيع اللحوم.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-panel inventory-panel meat-sales-panel">
      <div className="panel-heading">
        <div>
          <h3>مبيعات اللحوم ومخزون الثلاجة</h3>
          <p>
            تُسجل الفاتورة والسداد وخصم الثلاجة معًا. الأسعار مأخوذة من دليل
            الأصناف ويمكن تعديلها لكل عملية بيع.
          </p>
        </div>
        <div className="action-group">
          {canManage && <button
            className={section === "sale" ? "primary-button" : "secondary-button"}
            type="button"
            onClick={() => setSection("sale")}
          >
            فاتورة بيع
          </button>}
          {canManage && <button
            className={section === "stock" ? "primary-button" : "secondary-button"}
            type="button"
            onClick={() => setSection("stock")}
          >
            وارد الثلاجة
          </button>}
          {canManage && <button
            className={
              section === "catalog" ? "primary-button" : "secondary-button"
            }
            type="button"
            onClick={() => setSection("catalog")}
          >
            دليل الأصناف
          </button>}
          <button
            className={
              section === "history" ? "primary-button" : "secondary-button"
            }
            type="button"
            onClick={() => setSection("history")}
          >
            سجل الفواتير
          </button>
          <button
            className={
              section === "report" ? "primary-button" : "secondary-button"
            }
            type="button"
            onClick={() => setSection("report")}
          >
            تقرير الثلاجة
          </button>
          <button
            className={
              section === "balances" ? "primary-button" : "secondary-button"
            }
            type="button"
            onClick={() => setSection("balances")}
          >
            الأرصدة
          </button>
        </div>
      </div>

      {error && (
        <p className="form-error sales-error" role="alert">
          {error}
        </p>
      )}
      {canManage && section === "catalog" && (
        <>
          <form className="inventory-form sales-form" onSubmit={submitProduct}>
            <label className="form-field">
              اسم الصنف
              <input
                required
                maxLength={160}
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
              />
            </label>
            <label className="form-field">
              السعر المحفوظ
              <input
                type="number"
                min="0"
                step="any"
                required
                value={productPrice}
                onChange={(event) => setProductPrice(event.target.value)}
              />
            </label>
            <label className="form-field">
              الكمية (حقل الدليل الأصلي)
              <input
                type="number"
                min="0"
                step="any"
                required
                value={catalogQuantity}
                onChange={(event) => setCatalogQuantity(event.target.value)}
              />
            </label>
            <p className="access-note sales-wide">
              رصيد الثلاجة الفعلي يُحسب من إيصالات الوارد وحركات البيع، ولا
              يُستنتج من كمية دليل الأصناف.
            </p>
            <button className="primary-button" disabled={saving}>
              إضافة الصنف إلى الثلاجة
            </button>
          </form>
          <div className="table-wrap">
            <table className="resident-table inventory-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">اسم الصنف</th>
                  <th scope="col">السعر</th>
                  <th scope="col">الكمية</th>
                  <th scope="col">رقم الصنف بالثلاجة</th>
                </tr>
              </thead>
              <tbody>
                {sales.catalog.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.itemCategory}</td>
                    <td>{numberFormatter.format(item.price)}</td>
                    <td>{numberFormatter.format(item.quantity)}</td>
                    <td>
                      {sales.products.find(
                        (product) => product.catalogId === item.id,
                      )?.itemNumber ?? "—"}
                    </td>
                  </tr>
                ))}
                {!sales.catalog.length && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">لا توجد أصناف مسجلة.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {canManage && section === "stock" && (
        <>
          <form className="inventory-form sales-form" onSubmit={submitReceipt}>
            <label className="form-field">
              الصنف
              <select
                required
                value={receiptItemNumber}
                onChange={(event) => {
                  const value = event.target.value;
                  setReceiptItemNumber(value);
                  const product = sales.products.find(
                    (item) => String(item.itemNumber) === value,
                  );
                  const catalogItem = product
                    ? sales.catalog.find((item) => item.id === product.catalogId)
                    : null;
                  setReceiptPrice(catalogItem ? String(catalogItem.price) : "");
                }}
              >
                <option value="">اختر الصنف</option>
                {sales.products.map((product) => (
                  <option key={product.itemNumber} value={product.itemNumber}>
                    {product.itemCategory} — {product.itemNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              كمية الوارد
              <input
                type="number"
                min="0.01"
                step="any"
                required
                value={receiptQuantity}
                onChange={(event) => setReceiptQuantity(event.target.value)}
              />
            </label>
            <label className="form-field">
              سعر الوحدة
              <input
                type="number"
                min="0"
                step="any"
                required
                value={receiptPrice}
                onChange={(event) => setReceiptPrice(event.target.value)}
              />
            </label>
            <label className="form-field">
              تاريخ الوارد
              <input
                type="date"
                required
                value={receiptDate}
                onChange={(event) => setReceiptDate(event.target.value)}
              />
            </label>
            <button className="primary-button" disabled={saving}>
              تسجيل الوارد
            </button>
          </form>
          <div className="inventory-summary">
            {sales.products.map((product) => (
              <div className="inventory-summary-card" key={product.itemNumber}>
                <span>
                  {product.itemCategory} — {product.itemNumber}
                </span>
                <strong>
                  {numberFormatter.format(balances.get(product.itemNumber) ?? 0)}
                </strong>
                <span>الرصيد المتاح</span>
              </div>
            ))}
            {!sales.products.length && (
              <p className="access-note">أضف صنفًا إلى دليل الثلاجة أولًا.</p>
            )}
          </div>
          <div className="panel-heading inventory-history-heading">
            <div>
              <h3>حركات الثلاجة</h3>
              <p>الوارد والبيع والإلغاءات محفوظة كسجل.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="resident-table inventory-table">
              <thead>
                <tr>
                  <th scope="col">التاريخ</th>
                  <th scope="col">رقم الصنف</th>
                  <th scope="col">اسم الصنف</th>
                  <th scope="col">الوارد</th>
                  <th scope="col">المنصرف</th>
                  <th scope="col">الرصيد الحالي</th>
                  <th scope="col">المستفيد / الحالة</th>
                </tr>
              </thead>
              <tbody>
                {sales.movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>
                      {formatDate(
                        movement.receivedDate ?? movement.outgoingDate ?? "",
                      )}
                    </td>
                    <td>{movement.itemNumber}</td>
                    <td>{fridgeItemName(movement)}</td>
                    <td>
                      {movement.quantity === null
                        ? "—"
                        : numberFormatter.format(movement.quantity)}
                    </td>
                    <td>
                      {movement.outgoing === null
                        ? "—"
                        : numberFormatter.format(movement.outgoing)}
                    </td>
                    <td>
                      {numberFormatter.format(
                        balances.get(movement.itemNumber) ?? 0,
                      )}
                    </td>
                    <td>
                      {movement.needsReview
                        ? "قيد المراجعة"
                        : movement.voided
                        ? `ملغاة: ${movement.voidReason}`
                        : movement.recipient || "سارية"}
                    </td>
                  </tr>
                ))}
                {!sales.movements.length && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">لا توجد حركات مسجلة.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {canManage && section === "sale" && (
        <form className="inventory-form sales-form" onSubmit={submitSale}>
          <label className="form-field">
            تاريخ البيع
            <input
              type="date"
              required
              value={saleDate}
              onChange={(event) => setSaleDate(event.target.value)}
            />
          </label>
          <label className="form-field">
            رقم اذن الصرف
            <input
              type="number"
              min="0.01"
              step="any"
              value={permitNumber}
              onChange={(event) => setPermitNumber(event.target.value)}
            />
          </label>
          <label className="form-field">
            اسم المستفيد
            <input
              required
              maxLength={160}
              value={beneficiary}
              onChange={(event) => setBeneficiary(event.target.value)}
            />
          </label>

          <div className="sales-lines">
            {preparedLines.map((line, index) => (
              <div className="sales-line" key={index}>
                <label className="form-field">
                  اسم الصنف
                  <select
                    required
                    value={line.draft.itemNumber}
                    onChange={(event) =>
                      selectDraftProduct(index, event.target.value)
                    }
                  >
                    <option value="">اختر الصنف</option>
                    {sales.products.map((product) => {
                      const catalogItem = sales.catalog.find(
                        (item) => item.id === product.catalogId,
                      );
                      return (
                        <option
                          key={product.itemNumber}
                          value={product.itemNumber}
                        >
                          {product.itemCategory} — السعر{" "}
                          {numberFormatter.format(catalogItem?.price ?? 0)} —
                          الرصيد{" "}
                          {numberFormatter.format(
                            balances.get(product.itemNumber) ?? 0,
                          )}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="form-field">
                  السعر (قابل للتعديل)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={line.draft.price}
                    onChange={(event) =>
                      updateDraft(index, { price: event.target.value })
                    }
                  />
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
                      updateDraft(index, { quantity: event.target.value })
                    }
                  />
                </label>
                <span className="sales-line-total">
                  الإجمالي:{" "}
                  {line.valid ? numberFormatter.format(line.total) : "تحقق من البند"}
                </span>
                {draftLines.length > 1 && (
                  <button
                    className="table-action"
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      setDraftLines((current) =>
                        current.filter((_, lineIndex) => index !== lineIndex),
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
                { itemNumber: "", price: "", quantity: "1" },
              ])
            }
          >
            إضافة بند
          </button>
          <div className="sales-total">
            الإجمالي المستحق والمدفوع عند الحفظ:{" "}
            <strong>{numberFormatter.format(total)}</strong>
          </div>
          {!sales.products.length && (
            <p className="access-note">أضف صنفًا للثلاجة ثم سجل واردًا أولًا.</p>
          )}
          <div className="action-group">
            <button
              className="primary-button"
              disabled={saving || !canSaveSale}
            >
              {saving ? "جارٍ الحفظ..." : "حفظ الفاتورة وخصم الثلاجة"}
            </button>
          </div>
        </form>
      )}

      {section === "history" && (
        <div className="sales-invoice-list">
          {sales.invoices.map((invoice) => (
            <article className="sales-invoice-card" key={invoice.invoiceNumber}>
              <PrintBrand
                title={`فاتورة بيع اللحوم رقم ${invoice.invoiceNumber}`}
                subtitle={invoice.beneficiary}
                meta={[
                  { label: "التاريخ", value: formatDate(invoice.saleDate) },
                  { label: "الإجمالي", value: formatOptionalNumber(invoice.total) },
                  { label: "المسدد", value: numberFormatter.format(invoice.paid) },
                  {
                    label: "المتبقي",
                    value: invoice.total === null
                      ? "—"
                      : numberFormatter.format(Math.max(0, invoice.total - invoice.paid)),
                  },
                  { label: "الحالة", value: invoice.voided ? "ملغاة" : "سارية" },
                ]}
              />
              <div className="sales-invoice-heading">
                <div>
                  <h4>فاتورة بيع اللحوم رقم {invoice.invoiceNumber}</h4>
                  <p>
                    {formatDate(invoice.saleDate)} — {invoice.beneficiary}
                    {invoice.issuePermitNumber === null
                      ? ""
                      : ` — إذن الصرف ${numberFormatter.format(invoice.issuePermitNumber)}`}
                  </p>
                </div>
                <div className="sales-invoice-totals">
                  <span>الإجمالي: {formatOptionalNumber(invoice.total)}</span>
                  <span>المسدد: {numberFormatter.format(invoice.paid)}</span>
                  <strong>{invoice.voided ? "ملغاة" : "مسددة"}</strong>
                  {invoice.voided && <span>{invoice.voidReason}</span>}
                  <button
                    className="secondary-button no-print"
                    type="button"
                    onClick={(event) => {
                      const card = event.currentTarget.closest(".sales-invoice-card");
                      if (card instanceof HTMLElement) printSingleRecord(card);
                    }}
                  >
                    طباعة الفاتورة
                  </button>
                </div>
              </div>
              <div className="table-wrap">
                <table className="resident-table inventory-table">
                  <thead>
                    <tr>
                      <th scope="col">اسم الصنف</th>
                      <th scope="col">السعر</th>
                      <th scope="col">الكمية</th>
                      <th scope="col">الاجمالى</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.itemCategory}</td>
                        <td>{numberFormatter.format(line.price)}</td>
                        <td>{numberFormatter.format(line.quantity)}</td>
                        <td>{formatOptionalNumber(line.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {invoice.payments.length > 0 && (
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
              {canManage && !invoice.voided && voidTargetId !== invoice.invoiceNumber && (
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
          {!sales.invoices.length && (
            <div className="empty-state">لا توجد فواتير بيع مسجلة بعد.</div>
          )}
        </div>
      )}

      {section === "report" && (
        <div className="report-detail">
          <PrintBrand
            title="تقرير الثلاجة"
            subtitle="الوارد والمنصرف والرصيد المتبقي وحركة الفواتير خلال الفترة المحددة"
            meta={[
              {
                label: "الفترة",
                value: `${formatDate(appliedReportStartDate)} — ${formatDate(appliedReportEndDate)}`,
              },
            ]}
          />
          <div className="panel-heading">
            <div>
              <h3>تقرير الثلاجة والأرصدة</h3>
              <p>
                يعرض إجمالي الوارد والمنصرف وقيمة الرصيد المتبقي، مع تفصيل كل
                حركة وتاريخها وفواتير البيع خلال الفترة.
              </p>
            </div>
            <div className="resident-report-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={printCurrentView}
              >
                طباعة / حفظ PDF
              </button>
            </div>
          </div>

          <form className="resident-report-filters" onSubmit={applyReportDates}>
            <label>
              الصنف
              <select value={reportItemNumber} onChange={(event) => setReportItemNumber(event.target.value)}>
                <option value="all">كل الأصناف</option>
                {sales.products.map((product) => <option key={product.itemNumber} value={product.itemNumber}>{product.itemCategory}</option>)}
              </select>
            </label>
            <label>
              من تاريخ
              <input
                type="date"
                value={reportStartDate}
                onChange={(event) => setReportStartDate(event.target.value)}
              />
            </label>
            <label>
              إلى تاريخ
              <input
                type="date"
                value={reportEndDate}
                onChange={(event) => setReportEndDate(event.target.value)}
              />
            </label>
            <button className="primary-button" type="submit">
              عرض التقرير
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setReportStartDate(firstRecordedDate(sales));
                setReportEndDate(localDateValue());
                setAppliedReportStartDate(firstRecordedDate(sales));
                setAppliedReportEndDate(localDateValue());
                setReportItemNumber("all");
                setAppliedReportItemNumber("all");
                setReportError("");
              }}
            >
              إعادة ضبط
            </button>
          </form>

          {reportError && (
            <p className="resident-report-error" role="alert">
              {reportError}
            </p>
          )}

          <div className="resident-report-summary report-summary">
            <article>
              <span>الوارد (كمية)</span>
              <strong>
                {numberFormatter.format(reportSummary.incomingQuantity)}
              </strong>
            </article>
            <article>
              <span>الوارد (قيمة)</span>
              <strong>{formatOptionalNumber(reportSummary.incomingValue)}</strong>
            </article>
            <article>
              <span>المنصرف (كمية)</span>
              <strong>
                {numberFormatter.format(reportSummary.outgoingQuantity)}
              </strong>
            </article>
            <article>
              <span>المنصرف (قيمة)</span>
              <strong>{formatOptionalNumber(reportSummary.outgoingValue)}</strong>
            </article>
            <article>
              <span>الرصيد المتبقي (كمية)</span>
              <strong>
                {numberFormatter.format(reportSummary.remainingQuantity)}
              </strong>
            </article>
            <article>
              <span>الرصيد المتبقي (قيمة)</span>
              <strong>
                {formatOptionalNumber(reportSummary.remainingValue)}
              </strong>
            </article>
            <article>
              <span>عدد الفواتير</span>
              <strong>{numberFormatter.format(reportSummary.invoiceCount)}</strong>
            </article>
            <article>
              <span>إجمالي الفواتير</span>
              <strong>{formatOptionalNumber(reportSummary.invoiceTotal)}</strong>
            </article>
            <article>
              <span>المسدد</span>
              <strong>{numberFormatter.format(reportSummary.invoicePaid)}</strong>
            </article>
            <article>
              <span>المتبقي على النزلاء</span>
              <strong>
                {formatOptionalNumber(reportSummary.invoiceOutstanding)}
              </strong>
            </article>
          </div>

          <div className="table-wrap resident-report-details report-detail">
            <table className="resident-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>رقم الصنف</th>
                  <th>اسم الصنف</th>
                  <th>الوارد</th>
                  <th>المنصرف</th>
                  <th>السعر</th>
                  <th>قيمة الوارد</th>
                  <th>قيمة المنصرف</th>
                  <th>الرصيد الحالي</th>
                  <th>المستفيد / الحالة</th>
                </tr>
              </thead>
              <tbody>
                {reportMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>
                      {formatDate(
                        movement.receivedDate ?? movement.outgoingDate ?? "",
                      )}
                    </td>
                    <td>{movement.itemNumber}</td>
                    <td>{fridgeItemName(movement)}</td>
                    <td>
                      {movement.quantity === null
                        ? "—"
                        : numberFormatter.format(movement.quantity)}
                    </td>
                    <td>
                      {movement.outgoing === null
                        ? "—"
                        : numberFormatter.format(movement.outgoing)}
                    </td>
                    <td>{formatOptionalNumber(movement.price)}</td>
                    <td>
                      {movement.quantity === null || movement.price === null
                        ? "—"
                        : numberFormatter.format(
                            movement.quantity * movement.price,
                          )}
                    </td>
                    <td>
                      {movement.outgoing === null || movement.price === null
                        ? "—"
                        : numberFormatter.format(
                            movement.outgoing * movement.price,
                          )}
                    </td>
                    <td>
                      {numberFormatter.format(
                        reportBalances.get(movement.itemNumber) ?? 0,
                      )}
                    </td>
                    <td>
                      {movement.needsReview
                        ? "قيد المراجعة"
                        : movement.voided
                        ? `ملغاة: ${movement.voidReason}`
                        : movement.recipient || "سارية"}
                    </td>
                  </tr>
                ))}
                {!reportMovements.length && (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty-state">
                        لا توجد حركات ثلاجة خلال الفترة المحددة.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="table-wrap resident-report-details report-detail">
            <table className="resident-table">
              <thead>
                <tr>
                  <th>رقم الفاتورة</th>
                  <th>التاريخ</th>
                  <th>المستفيد</th>
                  <th>الإجمالي</th>
                  <th>المسدد</th>
                  <th>المتبقي</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {reportInvoices.map((invoice) => (
                  <tr key={invoice.invoiceNumber}>
                    <td>{invoice.invoiceNumber}</td>
                    <td>{formatDate(invoice.saleDate)}</td>
                    <td>{invoice.beneficiary}</td>
                    <td>{formatOptionalNumber(invoice.total)}</td>
                    <td>{numberFormatter.format(invoice.paid)}</td>
                    <td>
                      {invoice.total === null
                        ? "—"
                        : numberFormatter.format(
                            Math.max(0, invoice.total - invoice.paid),
                          )}
                    </td>
                    <td>{invoice.voided ? "ملغاة" : "سارية"}</td>
                    <td>
                      <PrintBrand
                        title={`فاتورة رقم ${invoice.invoiceNumber}`}
                        subtitle={invoice.beneficiary}
                        meta={[
                          { label: "التاريخ", value: formatDate(invoice.saleDate) },
                          { label: "الإجمالي", value: formatOptionalNumber(invoice.total) },
                          { label: "المسدد", value: numberFormatter.format(invoice.paid) },
                          { label: "المتبقي", value: invoice.total === null ? "—" : numberFormatter.format(Math.max(0, invoice.total - invoice.paid)) },
                        ]}
                      />
                      <button
                        className="table-action no-print"
                        type="button"
                        onClick={(event) => {
                          const row = event.currentTarget.closest("tr");
                          if (row instanceof HTMLElement) printSingleRecord(row);
                        }}
                      >
                        طباعة الفاتورة
                      </button>
                    </td>
                  </tr>
                ))}
                {!reportInvoices.length && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">
                        لا توجد فواتير بيع خلال الفترة المحددة.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "balances" && (
        <div className="report-detail">
          <PrintBrand
            title="أرصدة الثلاجة"
            subtitle="الرصيد الحالي لكل صنف وقيمة الوارد والمنصرف والمتبقي"
          />
          <div className="panel-heading">
            <div>
              <h3>أرصدة الثلاجة والمنصرف والمتبقي</h3>
              <p>
                رصيد كل صنف محسوب من إيصالات الوارد وحركات البيع، مع قيمة
                الوارد والمنصرف والرصيد المتبقي.
              </p>
            </div>
            <div className="resident-report-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={printCurrentView}
              >
                طباعة / حفظ PDF
              </button>
            </div>
          </div>

          <div className="resident-report-summary report-summary">
            <article>
              <span>عدد الأصناف</span>
              <strong>{numberFormatter.format(balanceRows.length)}</strong>
            </article>
            <article>
              <span>إجمالي الوارد</span>
              <strong>
                {numberFormatter.format(
                  balanceRows.reduce((sum, row) => sum + row.incoming, 0),
                )}
              </strong>
            </article>
            <article>
              <span>إجمالي المنصرف</span>
              <strong>
                {numberFormatter.format(
                  balanceRows.reduce((sum, row) => sum + row.outgoing, 0),
                )}
              </strong>
            </article>
            <article>
              <span>إجمالي الرصيد</span>
              <strong>
                {numberFormatter.format(
                  balanceRows.reduce((sum, row) => sum + row.remaining, 0),
                )}
              </strong>
            </article>
            <article>
              <span>قيمة الرصيد المتبقي</span>
              <strong>
                {numberFormatter.format(
                  balanceRows.reduce((sum, row) => sum + row.remainingValue, 0),
                )}
              </strong>
            </article>
          </div>

          <div className="table-wrap resident-report-details report-detail">
            <table className="resident-table">
              <thead>
                <tr>
                  <th>رقم الصنف</th>
                  <th>اسم الصنف</th>
                  <th>السعر</th>
                  <th>الوارد</th>
                  <th>المنصرف</th>
                  <th>الرصيد المتبقي</th>
                  <th>قيمة الوارد</th>
                  <th>قيمة المنصرف</th>
                  <th>قيمة الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {balanceRows.map((row) => (
                  <tr key={row.product.itemNumber}>
                    <td>{row.product.itemNumber}</td>
                    <td>{row.product.itemCategory}</td>
                    <td>{numberFormatter.format(row.price)}</td>
                    <td>{numberFormatter.format(row.incoming)}</td>
                    <td>{numberFormatter.format(row.outgoing)}</td>
                    <td>{numberFormatter.format(row.remaining)}</td>
                    <td>{numberFormatter.format(row.incomingValue)}</td>
                    <td>{numberFormatter.format(row.outgoingValue)}</td>
                    <td>{numberFormatter.format(row.remainingValue)}</td>
                  </tr>
                ))}
                {!balanceRows.length && (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">
                        أضف صنفًا إلى دليل الثلاجة أولًا.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
