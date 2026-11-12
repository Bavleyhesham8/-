"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  createCustodyIssueAction,
  recordWarehouseReceiptAction,
  returnCustodyItemAction,
  saveWarehouseCatalogItemAction,
  transferCustodyItemAction,
  updateWarehouseItemPriceAction,
  voidCustodyAction,
} from "@/app/actions/custody";
import { createDemoId } from "@/lib/inventory-demo-data";
import { formatDate, localDateValue } from "@/lib/date-format";
import type {
  CustodyBundle,
  CustodyDetail,
  CustodyEvent,
  CustodyRecord,
  WarehouseMovement,
} from "@/lib/custody-types";

type Props = {
  bundle: CustodyBundle;
  persistent: boolean;
  canManage: boolean;
  currentEmployeeNumber: number | null;
  onBundleChange: (
    update: (current: CustodyBundle) => CustodyBundle,
  ) => void;
};

type DraftLine = {
  itemNumber: string;
  quantity: string;
  price: string;
};

type ActionTarget =
  | {
      kind: "return" | "transfer";
      custodyNumber: number;
      detailId: string;
      itemName: string;
      outstandingQuantity: number;
    }
  | { kind: "void"; custodyNumber: number };

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

function nextMovementId(movements: WarehouseMovement[]) {
  return Math.max(0, ...movements.map((movement) => movement.id)) + 1;
}

function eventLabel(event: CustodyEvent) {
  if (event.kind === "return") return "مرتجع";
  if (event.kind === "void") return "إلغاء";
  return "نقل";
}

function formatOptionalNumber(value: number | null) {
  return value === null ? "—" : numberFormatter.format(value);
}

export default function CustodyPanel({
  bundle,
  persistent,
  canManage,
  currentEmployeeNumber,
  onBundleChange,
}: Props) {
  const [section, setSection] = useState<"custody" | "receipts" | "catalog">(
    "custody",
  );
  const [issueDate, setIssueDate] = useState(localDateValue());
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { itemNumber: "", quantity: "1", price: "" },
  ]);
  const [receiptItemNumber, setReceiptItemNumber] = useState("");
  const [receiptQuantity, setReceiptQuantity] = useState("");
  const [receiptDate, setReceiptDate] = useState(localDateValue());
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [actionDate, setActionDate] = useState(localDateValue());
  const [actionQuantity, setActionQuantity] = useState("");
  const [targetEmployeeNumber, setTargetEmployeeNumber] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const itemByNumber = useMemo(
    () => new Map(bundle.items.map((item) => [item.itemNumber, item])),
    [bundle.items],
  );
  const preparedLines = draftLines.map((line) => {
    const item = itemByNumber.get(Number(line.itemNumber));
    const quantity = Number(line.quantity);
    const price = Number(line.price);
    const total = quantity * price;
    return {
      ...line,
      item,
      quantity,
      price,
      total,
      valid:
        !!item &&
        Number.isFinite(quantity) &&
        quantity > 0 &&
        Number.isFinite(price) &&
        price >= 0 &&
        Number.isFinite(total),
    };
  });
  const issueTotal = preparedLines.reduce(
    (total, line) => total + (line.valid ? line.total : 0),
    0,
  );
  const canSaveIssue =
    !!bundle.items.length &&
    !!bundle.employees.length &&
    !!employeeNumber &&
    preparedLines.every((line) => line.valid) &&
    Number.isFinite(issueTotal);
  const availableQuantity = actionTarget
    ? actionTarget.kind === "void"
      ? 0
      : actionTarget.outstandingQuantity
    : 0;

  function setSuccess(text: string) {
    setError("");
    setMessage(text);
  }

  function updateDraft(index: number, patch: Partial<DraftLine>) {
    setDraftLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function selectDraftItem(index: number, value: string) {
    const item = itemByNumber.get(Number(value));
    updateDraft(index, {
      itemNumber: value,
      price: item?.price === null || !item ? "" : String(item.price),
    });
  }

  function openAction(target: ActionTarget) {
    setError("");
    setMessage("");
    setActionDate(localDateValue());
    setActionQuantity(
      target.kind === "return" ? String(target.outstandingQuantity) : "",
    );
    setTargetEmployeeNumber("");
    setVoidReason("");
    setActionTarget(target);
  }

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!canSaveIssue || !issueDate) {
      setError("أدخل الموظف والتاريخ وبندًا صالحًا على الأقل.");
      return;
    }

    const employee = bundle.employees.find(
      (candidate) => candidate.employeeNumber === Number(employeeNumber),
    );
    if (!employee) {
      setError("اختر موظفًا مسجلًا في دليل الموظفين.");
      return;
    }
    const lines = preparedLines.map((line) => ({
      itemNumber: Number(line.itemNumber),
      quantity: line.quantity,
      price: line.price,
    }));
    const requested = new Map<number, number>();
    for (const line of lines) {
      requested.set(
        line.itemNumber,
        (requested.get(line.itemNumber) ?? 0) + line.quantity,
      );
    }
    for (const [itemNumber, quantity] of requested) {
      const item = itemByNumber.get(itemNumber);
      if (!item || quantity > item.balance + 1e-9) {
        setError(
          `الرصيد المتاح غير كافٍ للصنف ${item?.itemName ?? itemNumber}.`,
        );
        return;
      }
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await createCustodyIssueAction({
          custodyDate: issueDate,
          employeeNumber: employee.employeeNumber,
          items: lines,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onBundleChange(() => result.bundle);
      } else {
        onBundleChange((current) => {
          const nextBalances = new Map(
            current.items.map((item) => [item.itemNumber, item.balance]),
          );
          const movementRows = [...current.warehouseMovements];
          const details: CustodyDetail[] = [];
          let movementId = nextMovementId(movementRows);

          for (const line of lines) {
            const item = current.items.find(
              (candidate) => candidate.itemNumber === line.itemNumber,
            );
            if (!item) continue;
            const balance = nextBalances.get(item.itemNumber) ?? 0;
            const detailId = createDemoId();
            const total = line.quantity * line.price;
            details.push({
              id: detailId,
              sourceId: null,
              itemNumber: item.itemNumber,
              itemName: item.itemName,
              quantity: line.quantity,
              price: line.price,
              total,
              issueDate: issueDate,
              currentEmployeeNumber: employee.employeeNumber,
              currentEmployeeName: employee.employeeName,
              returnedQuantity: 0,
              outstandingQuantity: line.quantity,
              events: [],
            });
            movementRows.unshift({
              id: movementId++,
              itemNumber: item.itemNumber,
              balance,
              incoming: 0,
              incomingDate: null,
              outgoing: line.quantity,
              outgoingDate: issueDate,
              remaining: balance - line.quantity,
              deleted: false,
              kind: "custody_issue",
              custodyDetailId: detailId,
              needsReview: false,
            });
            nextBalances.set(item.itemNumber, balance - line.quantity);
          }

          const record: CustodyRecord = {
            custodyNumber:
              Math.max(
                0,
                ...current.records.map((entry) => entry.custodyNumber),
              ) + 1,
            sourceId: null,
            custodyDate: issueDate,
            recipientEmployeeNumber: employee.employeeNumber,
            recipientName: employee.employeeName,
            voided: false,
            voidReason: "",
            details,
          };
          return {
            ...current,
            records: [record, ...current.records],
            items: current.items.map((item) => ({
              ...item,
              balance: nextBalances.get(item.itemNumber) ?? item.balance,
            })),
            warehouseMovements: movementRows,
          };
        });
      }
      setDraftLines([{ itemNumber: "", quantity: "1", price: "" }]);
      setEmployeeNumber("");
      setSuccess("تم تسجيل العهدة وخصم الكميات من المخزن.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const itemNumber = Number(receiptItemNumber);
    const quantity = Number(receiptQuantity);
    const item = itemByNumber.get(itemNumber);
    if (
      !item ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !receiptDate
    ) {
      setError("اختر صنفًا وأدخل كمية وتاريخ استلام صحيحين.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await recordWarehouseReceiptAction({
          itemNumber,
          quantity,
          receivedDate: receiptDate,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onBundleChange(() => result.bundle);
      } else {
        onBundleChange((current) => {
          const currentItem = current.items.find(
            (candidate) => candidate.itemNumber === itemNumber,
          );
          if (!currentItem) return current;
          const movement: WarehouseMovement = {
            id: nextMovementId(current.warehouseMovements),
            itemNumber,
            balance: currentItem.balance,
            incoming: quantity,
            incomingDate: receiptDate,
            outgoing: 0,
            outgoingDate: null,
            remaining: currentItem.balance + quantity,
            deleted: false,
            kind: "receipt",
            custodyDetailId: null,
            needsReview: false,
          };
          return {
            ...current,
            items: current.items.map((entry) =>
              entry.itemNumber === itemNumber
                ? { ...entry, balance: entry.balance + quantity }
                : entry,
            ),
            warehouseMovements: [movement, ...current.warehouseMovements],
          };
        });
      }
      setReceiptQuantity("");
      setSuccess("تم تسجيل وارد المخزن.");
    } finally {
      setSaving(false);
    }
  }

  async function submitCatalogItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const itemName = newItemName.trim().normalize("NFC");
    const price = Number(newItemPrice);
    if (
      !itemName ||
      itemName.length > 160 ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setError("أدخل اسم الصنف وسعرًا صحيحًا.");
      return;
    }
    if (
      !persistent &&
      bundle.items.some((item) => item.itemName.normalize("NFC") === itemName)
    ) {
      setError("اسم الصنف مسجل بالفعل في دليل المخزن.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await saveWarehouseCatalogItemAction({ itemName, price });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onBundleChange(() => result.bundle);
      } else {
        onBundleChange((current) => ({
          ...current,
          items: [
            ...current.items,
            {
              catalogId:
                Math.max(0, ...current.items.map((item) => item.catalogId)) + 1,
              itemNumber:
                Math.max(0, ...current.items.map((item) => item.itemNumber)) +
                1,
              itemName,
              price,
              responsible: "مدير تجريبي",
              balance: 0,
            },
          ],
        }));
      }
      setNewItemName("");
      setNewItemPrice("");
      setSuccess("تمت إضافة الصنف إلى دليل المخزن.");
    } finally {
      setSaving(false);
    }
  }

  async function saveItemPrice(itemNumber: number) {
    setError("");
    setMessage("");
    const item = itemByNumber.get(itemNumber);
    const price = Number(priceDrafts[itemNumber] ?? item?.price);
    if (!item || !Number.isFinite(price) || price < 0) {
      setError("أدخل سعرًا صحيحًا للصنف.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await updateWarehouseItemPriceAction(itemNumber, price);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onBundleChange(() => result.bundle);
      } else {
        onBundleChange((current) => ({
          ...current,
          items: current.items.map((entry) =>
            entry.itemNumber === itemNumber ? { ...entry, price } : entry,
          ),
        }));
      }
      setPriceDrafts((current) => ({ ...current, [itemNumber]: String(price) }));
      setSuccess("تم تحديث السعر المرجعي للصنف.");
    } finally {
      setSaving(false);
    }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!actionTarget || !actionDate) {
      setError("أدخل تاريخ الحركة.");
      return;
    }

    if (actionTarget.kind === "return") {
      const quantity = Number(actionQuantity);
      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        quantity > actionTarget.outstandingQuantity + 1e-9
      ) {
        setError("أدخل كمية مرتجعة لا تتجاوز المتبقي.");
        return;
      }
    }
    if (actionTarget.kind === "transfer" && !targetEmployeeNumber) {
      setError("اختر الموظف الجديد.");
      return;
    }
    if (actionTarget.kind === "void" && !voidReason.trim()) {
      setError("سبب الإلغاء مطلوب.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result =
          actionTarget.kind === "return"
            ? await returnCustodyItemAction({
                detailId: actionTarget.detailId,
                quantity: Number(actionQuantity),
                eventDate: actionDate,
              })
            : actionTarget.kind === "transfer"
              ? await transferCustodyItemAction({
                  detailId: actionTarget.detailId,
                  employeeNumber: Number(targetEmployeeNumber),
                  eventDate: actionDate,
                })
              : await voidCustodyAction({
                  custodyNumber: actionTarget.custodyNumber,
                  reason: voidReason,
                  eventDate: actionDate,
                });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onBundleChange(() => result.bundle);
      } else if (actionTarget.kind === "return") {
        const quantity = Number(actionQuantity);
        const record = bundle.records.find(
          (entry) => entry.custodyNumber === actionTarget.custodyNumber,
        );
        const detail = record?.details.find(
          (entry) => entry.id === actionTarget.detailId,
        );
        if (!record || !detail || detail.currentEmployeeNumber === null) {
          setError("لا يمكن استلام بند مغلق.");
          return;
        }
        const employee = bundle.employees.find(
          (entry) => entry.employeeNumber === detail.currentEmployeeNumber,
        );
        onBundleChange((current) => {
          const movementId = nextMovementId(current.warehouseMovements);
          const item = current.items.find(
            (entry) => entry.itemNumber === detail.itemNumber,
          );
          if (!item) return current;
          const fullReturn =
            Math.abs(quantity - actionTarget.outstandingQuantity) <= 1e-9;
          const event: CustodyEvent = {
            id: createDemoId(),
            kind: "return",
            quantity,
            eventDate: actionDate,
            fromEmployeeNumber: detail.currentEmployeeNumber,
            fromEmployeeName: employee?.employeeName ?? null,
            toEmployeeNumber: null,
            toEmployeeName: null,
            reason: "",
          };
          const movement: WarehouseMovement = {
            id: movementId,
            itemNumber: detail.itemNumber ?? 0,
            balance: item.balance,
            incoming: quantity,
            incomingDate: actionDate,
            outgoing: 0,
            outgoingDate: null,
            remaining: item.balance + quantity,
            deleted: false,
            kind: "custody_return",
            custodyDetailId: detail.id,
            needsReview: false,
          };
          return {
            ...current,
            items: current.items.map((entry) =>
              entry.itemNumber === item.itemNumber
                ? { ...entry, balance: entry.balance + quantity }
                : entry,
            ),
            warehouseMovements: [movement, ...current.warehouseMovements],
            records: current.records.map((entry) =>
              entry.custodyNumber !== record.custodyNumber
                ? entry
                : {
                    ...entry,
                    details: entry.details.map((line) =>
                      line.id !== detail.id
                        ? line
                        : {
                            ...line,
                            returnedQuantity: line.returnedQuantity + quantity,
                            outstandingQuantity: Math.max(
                              0,
                              line.outstandingQuantity - quantity,
                            ),
                            currentEmployeeNumber: fullReturn
                              ? null
                              : line.currentEmployeeNumber,
                            currentEmployeeName: fullReturn
                              ? null
                              : line.currentEmployeeName,
                            events: [...line.events, event],
                          },
                    ),
                  },
            ),
          };
        });
        setActionTarget(null);
        setSuccess("تم استلام المرتجع وإضافته إلى رصيد المخزن.");
        return;
      } else if (actionTarget.kind === "transfer") {
        const record = bundle.records.find(
          (entry) => entry.custodyNumber === actionTarget.custodyNumber,
        );
        const detail = record?.details.find(
          (entry) => entry.id === actionTarget.detailId,
        );
        const employee = bundle.employees.find(
          (entry) => entry.employeeNumber === Number(targetEmployeeNumber),
        );
        if (
          !record ||
          !detail ||
          detail.currentEmployeeNumber === null ||
          !employee ||
          employee.employeeNumber === detail.currentEmployeeNumber
        ) {
          setError("اختر موظفًا مختلفًا وبند عهدة نشطًا.");
          return;
        }
        const fromEmployee = bundle.employees.find(
          (entry) => entry.employeeNumber === detail.currentEmployeeNumber,
        );
        const event: CustodyEvent = {
          id: createDemoId(),
          kind: "transfer",
          quantity: actionTarget.outstandingQuantity,
          eventDate: actionDate,
          fromEmployeeNumber: detail.currentEmployeeNumber,
          fromEmployeeName: fromEmployee?.employeeName ?? null,
          toEmployeeNumber: employee.employeeNumber,
          toEmployeeName: employee.employeeName,
          reason: "",
        };
        onBundleChange((current) => ({
          ...current,
          records: current.records.map((entry) =>
            entry.custodyNumber !== record.custodyNumber
              ? entry
              : {
                  ...entry,
                  details: entry.details.map((line) =>
                    line.id !== detail.id
                      ? line
                      : {
                          ...line,
                          currentEmployeeNumber: employee.employeeNumber,
                          currentEmployeeName: employee.employeeName,
                          events: [...line.events, event],
                        },
                  ),
                },
          ),
        }));
      } else {
        const record = bundle.records.find(
          (entry) => entry.custodyNumber === actionTarget.custodyNumber,
        );
        if (!record || record.voided) {
          setError("سجل العهدة غير متاح للإلغاء.");
          return;
        }
        onBundleChange((current) => {
          let movementId = nextMovementId(current.warehouseMovements);
          const movements: WarehouseMovement[] = [];
          const nextBalances = new Map(
            current.items.map((item) => [item.itemNumber, item.balance]),
          );
          const details = record.details.map((detail) => {
            if (!detail.itemNumber || detail.outstandingQuantity <= 1e-9) return detail;
            const item = current.items.find(
              (entry) => entry.itemNumber === detail.itemNumber,
            );
            if (!item) return detail;
            const balance = nextBalances.get(detail.itemNumber) ?? item.balance;
            const quantity = detail.outstandingQuantity;
            const employee = current.employees.find(
              (entry) =>
                entry.employeeNumber === detail.currentEmployeeNumber,
            );
            const event: CustodyEvent = {
              id: createDemoId(),
              kind: "void",
              quantity,
              eventDate: actionDate,
              fromEmployeeNumber: detail.currentEmployeeNumber,
              fromEmployeeName: employee?.employeeName ?? null,
              toEmployeeNumber: null,
              toEmployeeName: null,
              reason: voidReason.trim(),
            };
            movements.push({
              id: movementId++,
              itemNumber: detail.itemNumber,
              balance,
              incoming: quantity,
              incomingDate: actionDate,
              outgoing: 0,
              outgoingDate: null,
              remaining: balance + quantity,
              deleted: false,
              kind: "custody_void",
              custodyDetailId: detail.id,
              needsReview: false,
            });
            nextBalances.set(detail.itemNumber, balance + quantity);
            return {
              ...detail,
              returnedQuantity: detail.returnedQuantity + quantity,
              outstandingQuantity: 0,
              currentEmployeeNumber: null,
              currentEmployeeName: null,
              events: [...detail.events, event],
            };
          });
          return {
            ...current,
            items: current.items.map((item) => ({
              ...item,
              balance: nextBalances.get(item.itemNumber) ?? item.balance,
            })),
            warehouseMovements: [
              ...movements,
              ...current.warehouseMovements,
            ],
            records: current.records.map((entry) =>
              entry.custodyNumber === record.custodyNumber
                ? {
                    ...entry,
                    voided: true,
                    voidReason: voidReason.trim(),
                    details,
                  }
                : entry,
            ),
          };
        });
      }

      setActionTarget(null);
      setSuccess(
        actionTarget.kind === "return"
          ? "تم استلام المرتجع وإضافته إلى رصيد المخزن."
          : actionTarget.kind === "transfer"
            ? "تم نقل العهدة للموظف الجديد."
            : "تم إلغاء العهدة وإعادة الكمية المتبقية إلى المخزن.",
      );
    } finally {
      setSaving(false);
    }
  }

  const sectionButtons = (
    <>
      <button
        role="tab"
        aria-selected={section === "custody"}
        type="button"
        className={section === "custody" ? "active" : ""}
        onClick={() => setSection("custody")}
      >
        العهدة
      </button>
      {canManage && (
        <>
          <button
            role="tab"
            aria-selected={section === "receipts"}
            type="button"
            className={section === "receipts" ? "active" : ""}
            onClick={() => setSection("receipts")}
          >
            استلام المخزن
          </button>
          <button
            role="tab"
            aria-selected={section === "catalog"}
            type="button"
            className={section === "catalog" ? "active" : ""}
            onClick={() => setSection("catalog")}
          >
            الأصناف والأسعار
          </button>
        </>
      )}
    </>
  );

  return (
    <section className="custody-panel content-panel">
      <div className="panel-heading">
        <div>
          <h3>إدارة العهدة والمخزن</h3>
          <p>
            تحفظ الجداول الأصلية للعهدة والمخزن، مع سجل إضافي للإرجاع والنقل
            والإلغاء.
          </p>
        </div>
        <span className="panel-role">
          {canManage ? "إدارة المسؤول" : "عرض عهدتي فقط"}
        </span>
      </div>

      {bundle.needsReviewCount > 0 && (
        <p className="review-warning" role="status">
          يوجد {numberFormatter.format(bundle.needsReviewCount)} حركة مخزن قيد
          المراجعة؛ لا تدخل في حساب الرصيد.
        </p>
      )}

      <div className="custody-tabs" role="tablist" aria-label="أقسام العهدة">
        {sectionButtons}
      </div>

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

      {!canManage && currentEmployeeNumber === null && (
        <div className="empty-state" role="status">
          حسابك غير مرتبط بموظف في دليل الموظفين. اطلب من المسؤول ربط الحساب
          بسجل الموظف لعرض عهدتك.
        </div>
      )}

      {section === "custody" && (
        <>
          {canManage ? (
            <form className="custody-issue-form" onSubmit={submitIssue}>
              <div className="custody-section-heading">
                <div>
                  <h4>تسجيل عهدة جديدة</h4>
                  <p>يُخصم المخزون في العملية نفسها بعد التحقق من الرصيد.</p>
                </div>
              </div>
              <div className="custody-issue-fields">
                <label>
                  <span>الموظف المستلم</span>
                  <select
                    value={employeeNumber}
                    onChange={(event) => setEmployeeNumber(event.target.value)}
                    required
                  >
                    <option value="">اختر الموظف</option>
                    {bundle.employees.map((employee) => (
                      <option
                        key={employee.employeeNumber}
                        value={employee.employeeNumber}
                      >
                        {employee.employeeName} — {employee.employeeNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>تاريخ العهدة</span>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(event) => setIssueDate(event.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="custody-line-list">
                {draftLines.map((line, index) => {
                  const prepared = preparedLines[index];
                  return (
                    <div className="custody-draft-line" key={index}>
                      <label>
                        <span>الصنف / الفئة</span>
                        <select
                          value={line.itemNumber}
                          onChange={(event) =>
                            selectDraftItem(index, event.target.value)
                          }
                          required
                        >
                          <option value="">اختر صنف المخزن</option>
                          {bundle.items.map((item) => (
                            <option
                              key={item.itemNumber}
                              value={item.itemNumber}
                            >
                              {item.itemName} — المتاح{" "}
                              {numberFormatter.format(item.balance)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>الكمية</span>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={line.quantity}
                          onChange={(event) =>
                            updateDraft(index, { quantity: event.target.value })
                          }
                          required
                        />
                      </label>
                      <label>
                        <span>السعر</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={line.price}
                          onChange={(event) =>
                            updateDraft(index, { price: event.target.value })
                          }
                          required
                        />
                      </label>
                      <div className="custody-line-total">
                        <span>الإجمالى</span>
                        <strong>
                          {prepared.valid
                            ? numberFormatter.format(prepared.total)
                            : "—"}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label="حذف بند"
                        disabled={draftLines.length === 1}
                        onClick={() =>
                          setDraftLines((current) =>
                            current.filter(
                              (_, lineIndex) => lineIndex !== index,
                            ),
                          )
                        }
                      >
                        حذف
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="custody-form-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setDraftLines((current) => [
                      ...current,
                      { itemNumber: "", quantity: "1", price: "" },
                    ])
                  }
                  disabled={saving}
                >
                  إضافة بند
                </button>
                <span>
                  إجمالي العهدة: <strong>{numberFormatter.format(issueTotal)}</strong>
                </span>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={!canSaveIssue || saving}
                >
                  {saving ? "جارٍ الحفظ..." : "تسجيل العهدة وخصم المخزون"}
                </button>
              </div>
              {!bundle.items.length && (
                <p className="empty-state">
                  أضف صنفًا للمخزن وسجل واردًا قبل إنشاء العهدة.
                </p>
              )}
            </form>
          ) : (
            <p className="custody-readonly-note">
              هذه القائمة للعرض فقط. سجلات الموظفين الآخرين غير ظاهرة.
            </p>
          )}

          {actionTarget && (
            <form className="custody-action-form" onSubmit={submitAction}>
              <div className="custody-section-heading">
                <div>
                  <h4>
                    {actionTarget.kind === "return"
                      ? "استلام مرتجع"
                      : actionTarget.kind === "transfer"
                        ? "نقل العهدة"
                        : "إلغاء سجل العهدة"}
                  </h4>
                  <p>
                    {actionTarget.kind === "void"
                      ? `العهدة رقم ${actionTarget.custodyNumber}`
                      : `${actionTarget.itemName} — المتبقي ${numberFormatter.format(availableQuantity)}`}
                  </p>
                </div>
              </div>
              <div className="custody-issue-fields">
                <label>
                  <span>تاريخ الحركة</span>
                  <input
                    type="date"
                    value={actionDate}
                    onChange={(event) => setActionDate(event.target.value)}
                    required
                  />
                </label>
                {actionTarget.kind === "return" && (
                  <label>
                    <span>الكمية المرتجعة</span>
                    <input
                      type="number"
                      min="0.01"
                      max={actionTarget.outstandingQuantity}
                      step="any"
                      value={actionQuantity}
                      onChange={(event) =>
                        setActionQuantity(event.target.value)
                      }
                      required
                    />
                  </label>
                )}
                {actionTarget.kind === "transfer" && (
                  <label>
                    <span>الموظف الجديد</span>
                    <select
                      value={targetEmployeeNumber}
                      onChange={(event) =>
                        setTargetEmployeeNumber(event.target.value)
                      }
                      required
                    >
                      <option value="">اختر الموظف</option>
                      {bundle.employees
                        .filter(
                          (employee) =>
                            employee.employeeNumber !==
                            bundle.records
                              .find(
                                (record) =>
                                  record.custodyNumber ===
                                  actionTarget.custodyNumber,
                              )
                              ?.details.find(
                                (detail) =>
                                  detail.id === actionTarget.detailId,
                              )?.currentEmployeeNumber,
                        )
                        .map((employee) => (
                          <option
                            key={employee.employeeNumber}
                            value={employee.employeeNumber}
                          >
                            {employee.employeeName}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {actionTarget.kind === "void" && (
                  <label className="custody-wide-field">
                    <span>سبب الإلغاء</span>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={voidReason}
                      onChange={(event) => setVoidReason(event.target.value)}
                      required
                    />
                  </label>
                )}
              </div>
              <div className="custody-form-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActionTarget(null)}
                  disabled={saving}
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  {saving ? "جارٍ الحفظ..." : "تأكيد الحركة"}
                </button>
              </div>
            </form>
          )}

          <div className="custody-record-list">
            {!canManage && currentEmployeeNumber === null ? null : bundle.records.length ? (
              bundle.records.map((record) => {
                const outstanding = record.details.reduce(
                  (total, detail) => total + detail.outstandingQuantity,
                  0,
                );
                const status = record.voided
                  ? "ملغاة"
                  : outstanding > 1e-9
                    ? "نشطة"
                    : "مكتملة";
                return (
                  <article
                    className="custody-record"
                    key={record.custodyNumber}
                  >
                    <div className="custody-record-heading">
                      <div>
                        <h4>عهدة رقم {record.custodyNumber}</h4>
                        <p>
                          {formatDate(record.custodyDate)} · المستلم الأصلي:{" "}
                          {record.recipientName}
                        </p>
                      </div>
                      <div className="custody-record-actions">
                        <span
                          className={`custody-status ${record.voided ? "voided" : ""}`}
                        >
                          {status}
                        </span>
                        {canManage && !record.voided && (
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              openAction({
                                kind: "void",
                                custodyNumber: record.custodyNumber,
                              })
                            }
                          >
                            إلغاء العهدة
                          </button>
                        )}
                      </div>
                    </div>

                    {record.voided && (
                      <p className="custody-void-reason">
                        سبب الإلغاء: {record.voidReason}
                      </p>
                    )}

                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>الصنف / الفئة</th>
                            <th>الكمية</th>
                            <th>السعر</th>
                            <th>الإجمالى</th>
                            <th>المرتجع</th>
                            <th>المتبقي</th>
                            <th>الموظف الحالي</th>
                            {canManage && <th>الإجراءات</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {record.details.map((detail) => (
                            <tr key={detail.id}>
                              <td>{detail.itemName}</td>
                              <td>{numberFormatter.format(detail.quantity ?? 0)}</td>
                              <td>{numberFormatter.format(detail.price)}</td>
                              <td>{numberFormatter.format(detail.total)}</td>
                              <td>
                                {numberFormatter.format(detail.returnedQuantity)}
                              </td>
                              <td>
                                {numberFormatter.format(
                                  detail.outstandingQuantity,
                                )}
                              </td>
                              <td>{detail.currentEmployeeName ?? "—"}</td>
                              {canManage && (
                                <td>
                                  {detail.outstandingQuantity > 1e-9 &&
                                    !record.voided && (
                                      <div className="custody-row-actions">
                                        <button
                                          type="button"
                                          className="secondary-button"
                                          onClick={() =>
                                            openAction({
                                              kind: "return",
                                              custodyNumber:
                                                record.custodyNumber,
                                              detailId: detail.id,
                                              itemName: detail.itemName,
                                              outstandingQuantity:
                                                detail.outstandingQuantity,
                                            })
                                          }
                                        >
                                          مرتجع
                                        </button>
                                        <button
                                          type="button"
                                          className="secondary-button"
                                          onClick={() =>
                                            openAction({
                                              kind: "transfer",
                                              custodyNumber:
                                                record.custodyNumber,
                                              detailId: detail.id,
                                              itemName: detail.itemName,
                                              outstandingQuantity:
                                                detail.outstandingQuantity,
                                            })
                                          }
                                        >
                                          نقل
                                        </button>
                                      </div>
                                    )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {record.details.some((detail) => detail.events.length) && (
                      <div className="custody-event-history">
                        {record.details.map((detail) =>
                          detail.events.length ? (
                            <details key={detail.id}>
                              <summary>
                                حركات {detail.itemName} ({detail.events.length})
                              </summary>
                              <ul>
                                {detail.events.map((event) => (
                                  <li key={event.id}>
                                    {eventLabel(event)} ·{" "}
                                    {numberFormatter.format(event.quantity)} ·{" "}
                                    {formatDate(event.eventDate)}
                                    {event.fromEmployeeName
                                      ? ` · من ${event.fromEmployeeName}`
                                      : ""}
                                    {event.toEmployeeName
                                      ? ` · إلى ${event.toEmployeeName}`
                                      : ""}
                                    {event.reason ? ` · ${event.reason}` : ""}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : null,
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="empty-state">لا توجد سجلات عهدة لعرضها.</div>
            )}
          </div>
        </>
      )}

      {section === "receipts" && canManage && (
        <div className="custody-warehouse-section">
          <form className="custody-receipt-form" onSubmit={submitReceipt}>
            <div className="custody-section-heading">
              <div>
                <h4>تسجيل وارد المخزن</h4>
                <p>يبدأ الرصيد من صفر ويزداد بالحركات المسجلة فقط.</p>
              </div>
            </div>
            <div className="custody-issue-fields">
              <label>
                <span>الصنف</span>
                <select
                  value={receiptItemNumber}
                  onChange={(event) =>
                    setReceiptItemNumber(event.target.value)
                  }
                  required
                >
                  <option value="">اختر الصنف</option>
                  {bundle.items.map((item) => (
                    <option key={item.itemNumber} value={item.itemNumber}>
                      {item.itemName} — المتاح{" "}
                      {numberFormatter.format(item.balance)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>الكمية الواردة</span>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={receiptQuantity}
                  onChange={(event) => setReceiptQuantity(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>تاريخ الوارد</span>
                <input
                  type="date"
                  value={receiptDate}
                  onChange={(event) => setReceiptDate(event.target.value)}
                  required
                />
              </label>
            </div>
            <div className="custody-form-footer">
              <button
                type="submit"
                className="primary-button"
                disabled={!bundle.items.length || saving}
              >
                {saving ? "جارٍ الحفظ..." : "تسجيل الوارد"}
              </button>
            </div>
          </form>

          <div className="custody-section-heading">
            <div>
              <h4>أرصدة المخزن</h4>
              <p>الرصيد محسوب من الوارد مطروحًا منه المنصرف غير المحذوف.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>السعر الحالي</th>
                  <th>المتبقي</th>
                  <th>المسؤول</th>
                </tr>
              </thead>
              <tbody>
                {bundle.items.map((item) => (
                  <tr key={item.itemNumber}>
                    <td>{item.itemName}</td>
                    <td>{formatOptionalNumber(item.price)}</td>
                    <td>{numberFormatter.format(item.balance)}</td>
                    <td>{item.responsible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="custody-section-heading">
            <div>
              <h4>سجل حركات المخزن</h4>
              <p>الوارد والمرتجع والإلغاء يزيد الرصيد؛ العهدة تخصمه.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>نوع الحركة</th>
                  <th>الوارد</th>
                  <th>المنصرف</th>
                  <th>الرصيد قبل الحركة</th>
                  <th>المتبقي بعدها</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {bundle.warehouseMovements.slice(0, 100).map((movement) => (
                  <tr
                    key={movement.id}
                    className={movement.needsReview ? "tracking-row-review" : ""}
                  >
                    <td>
                      {itemByNumber.get(movement.itemNumber)?.itemName ??
                        movement.itemNumber}
                    </td>
                    <td>
                      {movement.needsReview
                        ? "قيد المراجعة"
                        : movement.kind === "receipt"
                        ? "وارد"
                        : movement.kind === "custody_issue"
                          ? "صرف عهدة"
                          : movement.kind === "custody_return"
                            ? "مرتجع عهدة"
                            : "استرداد إلغاء"}
                    </td>
                    <td>{formatOptionalNumber(movement.incoming)}</td>
                    <td>{formatOptionalNumber(movement.outgoing)}</td>
                    <td>
                      {formatOptionalNumber(
                        movement.needsReview ? null : movement.balance,
                      )}
                    </td>
                    <td>
                      {formatOptionalNumber(
                        movement.needsReview ? null : movement.remaining,
                      )}
                    </td>
                    <td>
                      {formatDate(
                        movement.incomingDate ?? movement.outgoingDate ?? "",
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "catalog" && canManage && (
        <div className="custody-catalog-section">
          <form className="custody-catalog-form" onSubmit={submitCatalogItem}>
            <div className="custody-section-heading">
              <div>
                <h4>إضافة صنف للمخزن</h4>
                <p>
                  سعر الصنف هو السعر الافتراضي للعهدة، ويمكن تعديله لكل بند عند
                  الإصدار.
                </p>
              </div>
            </div>
            <div className="custody-issue-fields">
              <label>
                <span>الاصناف</span>
                <input
                  value={newItemName}
                  maxLength={160}
                  onChange={(event) => setNewItemName(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>السعر الحالي</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newItemPrice}
                  onChange={(event) => setNewItemPrice(event.target.value)}
                  required
                />
              </label>
            </div>
            <div className="custody-form-footer">
              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? "جارٍ الحفظ..." : "إضافة صنف"}
              </button>
            </div>
          </form>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>السعر المرجعي</th>
                  <th>الرصيد الحالي</th>
                  <th>تحديث السعر</th>
                </tr>
              </thead>
              <tbody>
                {bundle.items.map((item) => (
                  <tr key={item.itemNumber}>
                    <td>{item.itemName}</td>
                    <td>{formatOptionalNumber(item.price)}</td>
                    <td>{numberFormatter.format(item.balance)}</td>
                    <td>
                      <div className="custody-price-editor">
                        <input
                          aria-label={`سعر ${item.itemName}`}
                          type="number"
                          min="0"
                          step="any"
                          value={
                            priceDrafts[item.itemNumber] ??
                            (item.price === null ? "" : String(item.price))
                          }
                          onChange={(event) =>
                            setPriceDrafts((current) => ({
                              ...current,
                              [item.itemNumber]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={saving}
                          onClick={() => void saveItemPrice(item.itemNumber)}
                        >
                          حفظ السعر
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
