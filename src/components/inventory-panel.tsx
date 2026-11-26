"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  recordInventoryMovementAction,
  saveInventoryItemAction,
  setInventoryItemActiveAction,
  updateInventoryMovementAction,
  voidInventoryMovementAction,
} from "@/app/actions/inventory";
import { formatDate, localDateValue } from "@/lib/date-format";
import { createDemoId } from "@/lib/inventory-demo-data";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
import type {
  InventoryBundle,
  InventoryDirection,
  InventoryItem,
  InventoryMovement,
} from "@/lib/inventory-types";

type InventoryPanelProps = {
  inventory: InventoryBundle;
  persistent: boolean;
  canManage: boolean;
  onInventoryChange: (update: (current: InventoryBundle) => InventoryBundle) => void;
};

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function sortMovements(movements: InventoryMovement[]) {
  return [...movements].sort((left, right) =>
    left.movementDate === right.movementDate
      ? left.id.localeCompare(right.id)
      : left.movementDate.localeCompare(right.movementDate),
  );
}

export default function InventoryPanel({
  inventory,
  persistent,
  canManage,
  onInventoryChange,
}: InventoryPanelProps) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [itemUnit, setItemUnit] = useState("وحدة");
  const [itemPrice, setItemPrice] = useState("0");
  const [itemActive, setItemActive] = useState(true);
  const [itemInitialQuantity, setItemInitialQuantity] = useState("0");
  const [itemInitialDate, setItemInitialDate] = useState(localDateValue());
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [editingMovementId, setEditingMovementId] = useState<string | null>(
    null,
  );
  const [movementItemId, setMovementItemId] = useState("");
  const [movementDirection, setMovementDirection] =
    useState<InventoryDirection>("in");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementUnitPrice, setMovementUnitPrice] = useState("");
  const [movementDate, setMovementDate] = useState("");
  const [movementDestination, setMovementDestination] = useState("");
  const [movementRecipient, setMovementRecipient] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [showBalanceAdjust, setShowBalanceAdjust] = useState(false);
  const [balanceAdjustItemId, setBalanceAdjustItemId] = useState("");
  const [balanceAdjustValue, setBalanceAdjustValue] = useState("");
  const [reportItemId, setReportItemId] = useState("all");
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const items = inventory.items.filter((item) => canManage || item.active);
  const activeItems = items.filter((item) => item.active);
  const reportItems =
    reportItemId === "all"
      ? items
      : items.filter((item) => item.id === reportItemId);
  const reportActiveItems = reportItems.filter((item) => item.active);
  const defaultCategoryId =
    inventory.categories.find(
      (category) => category.active && category.name === "مخزن الأغذية",
    )?.id ??
    inventory.categories.find((category) => category.active)?.id ??
    "";
  const balances = useMemo(() => {
    const result = new Map<string, number>();
    for (const movement of inventory.movements) {
      if (movement.voided) continue;
      result.set(
        movement.itemId,
        (result.get(movement.itemId) ?? 0) +
          (movement.direction === "in"
            ? movement.quantity
            : -movement.quantity),
      );
    }
    return result;
  }, [inventory.movements]);
  const visibleMovements = inventory.movements
    .filter((movement) => {
      return (
        (reportItemId === "all" || movement.itemId === reportItemId) &&
        (!reportStart || movement.movementDate >= reportStart) &&
        (!reportEnd || movement.movementDate <= reportEnd)
      );
    })
    .sort(
      (left, right) =>
        left.movementDate.localeCompare(right.movementDate) ||
        left.id.localeCompare(right.id, "en", { numeric: true }),
    );
  const movementItem = inventory.items.find(
    (item) => item.id === movementItemId,
  );
  const editingMovement = editingMovementId
    ? inventory.movements.find((movement) => movement.id === editingMovementId)
    : null;
  const movementBalance = movementItem
    ? (balances.get(movementItem.id) ?? 0)
    : 0;
  const movementTotals = {
    incoming: 0,
    outgoing: 0,
    incomingValue: 0,
    outgoingValue: 0,
  };
  for (const movement of visibleMovements) {
    if (movement.voided) continue;
    if (movement.direction === "in") {
      movementTotals.incoming += movement.quantity;
      movementTotals.incomingValue += movement.quantity * movement.unitPrice;
    } else {
      movementTotals.outgoing += movement.quantity;
      movementTotals.outgoingValue += movement.quantity * movement.unitPrice;
    }
  }
  const totalBalance = reportItems.reduce(
    (total, item) => total + (balances.get(item.id) ?? 0),
    0,
  );
  const stockValue = reportItems.reduce(
    (total, item) => total + (balances.get(item.id) ?? 0) * item.unitPrice,
    0,
  );
  const reportItemName =
    reportItemId === "all"
      ? "كل الأصناف"
      : inventory.items.find((item) => item.id === reportItemId)?.name ?? "—";
  const reportPeriodLabel =
    reportStart || reportEnd
      ? `${reportStart ? formatDate(reportStart) : "البداية"} — ${reportEnd ? formatDate(reportEnd) : "اليوم"}`
      : "كل الفترات";
  const balanceAdjustItem = inventory.items.find(
    (item) => item.id === balanceAdjustItemId,
  );
  const currentAdjustBalance = balanceAdjustItem
    ? (balances.get(balanceAdjustItem.id) ?? 0)
    : 0;

  function clearMessages() {
    setError("");
    setMessage("");
  }

  function startNewItem() {
    setEditingItemId(null);
    setItemName("");
    setItemCategoryId(defaultCategoryId);
    setItemUnit("وحدة");
    setItemPrice("0");
    setItemActive(true);
    setItemInitialQuantity("0");
    setItemInitialDate(localDateValue());
    setShowItemForm(true);
    setShowMovementForm(false);
    setShowBalanceAdjust(false);
    clearMessages();
  }

  function editItem(item: InventoryItem) {
    setEditingItemId(item.id);
    setItemName(item.name);
    setItemCategoryId(item.categoryId);
    setItemUnit(item.unit);
    setItemPrice(String(item.unitPrice));
    setItemActive(item.active);
    setItemInitialQuantity("0");
    setShowItemForm(true);
    setShowMovementForm(false);
    setShowBalanceAdjust(false);
    clearMessages();
  }

  function resetItemForm() {
    setShowItemForm(false);
    setEditingItemId(null);
    setItemInitialQuantity("0");
    setItemInitialDate(localDateValue());
    clearMessages();
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsedPrice = Number(itemPrice);
    const parsedInitialQuantity = Number(itemInitialQuantity || 0);
    const normalizedName = itemName.trim().normalize("NFC");
    const normalizedUnit = itemUnit.trim().normalize("NFC");
    if (!normalizedName || !normalizedUnit) {
      setError("أدخل اسم الصنف ووحدة القياس.");
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError("أدخل سعرًا صالحًا للصنف.");
      return;
    }
    if (
      !editingItemId &&
      (!Number.isFinite(parsedInitialQuantity) ||
        parsedInitialQuantity < 0 ||
        (parsedInitialQuantity > 0 && !itemInitialDate))
    ) {
      setError("أدخل كمية افتتاحية صحيحة وتاريخها.");
      return;
    }
    if (
      inventory.items.some(
        (item) =>
          item.id !== editingItemId &&
          item.name.toLocaleLowerCase("ar") ===
            normalizedName.toLocaleLowerCase("ar"),
      )
    ) {
      setError("يوجد صنف بهذا الاسم في مخزن الأغذية.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await saveInventoryItemAction(
          editingItemId,
          editingItemId
            ? {
                name: normalizedName,
                unit: normalizedUnit,
                unitPrice: parsedPrice,
                active: itemActive,
              }
            : {
                categoryId: itemCategoryId || undefined,
                name: normalizedName,
                unit: normalizedUnit,
                unitPrice: parsedPrice,
                active: itemActive,
                initialQuantity: parsedInitialQuantity,
                initialQuantityDate: itemInitialDate,
              },
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onInventoryChange((current) => ({
          ...current,
          items: editingItemId
            ? current.items.map((item) =>
                item.id === result.item.id ? result.item : item,
              )
            : [...current.items, result.item],
          movements: result.movement
            ? sortMovements([...current.movements, result.movement])
            : current.movements,
        }));
      } else {
        const nextItem: InventoryItem = {
          id: editingItemId ?? createDemoId(),
          categoryId: itemCategoryId || defaultCategoryId,
          name: normalizedName,
          unit: normalizedUnit,
          unitPrice: parsedPrice,
          active: itemActive,
        };
        const nextMovement: InventoryMovement | null =
          !editingItemId && parsedInitialQuantity > 0
            ? {
                id: createDemoId(),
                itemId: nextItem.id,
                itemName: nextItem.name,
                categoryId: nextItem.categoryId,
                direction: "in",
                quantity: parsedInitialQuantity,
                unitPrice: nextItem.unitPrice,
                movementDate: itemInitialDate,
                destination: "",
                recipient: "",
                note: "رصيد افتتاحي",
                voided: false,
              }
            : null;
        onInventoryChange((current) => ({
          ...current,
          items: editingItemId
            ? current.items.map((item) =>
                item.id === editingItemId ? nextItem : item,
              )
            : [...current.items, nextItem],
          movements: nextMovement
            ? sortMovements([...current.movements, nextMovement])
            : current.movements,
        }));
      }
      resetItemForm();
      setMessage("تم حفظ الصنف.");
    } catch {
      setError("تعذر حفظ الصنف. تحقق من البيانات وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleItemActive(item: InventoryItem) {
    const active = !item.active;
    setError("");
    setMessage("");
    setSaving(true);
    try {
      if (persistent) {
        const result = await setInventoryItemActiveAction(item.id, active);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onInventoryChange((current) => ({
          ...current,
          items: current.items.map((currentItem) =>
            currentItem.id === item.id ? result.item : currentItem,
          ),
        }));
      } else {
        onInventoryChange((current) => ({
          ...current,
          items: current.items.map((currentItem) =>
            currentItem.id === item.id
              ? { ...currentItem, active }
              : currentItem,
          ),
        }));
      }
    } catch {
      setError("تعذر تحديث حالة الصنف.");
    } finally {
      setSaving(false);
    }
  }

  function startMovement() {
    setEditingMovementId(null);
    setMovementItemId(activeItems[0]?.id ?? "");
    setMovementDirection("in");
    setMovementQuantity("");
    setMovementUnitPrice("");
    setMovementDate(localDateValue());
    setMovementDestination("");
    setMovementRecipient("");
    setMovementNote("");
    setShowMovementForm(true);
    setShowItemForm(false);
    setShowBalanceAdjust(false);
    clearMessages();
  }

  function editMovement(movement: InventoryMovement) {
    setEditingMovementId(movement.id);
    setMovementItemId(movement.itemId);
    setMovementDirection(movement.direction);
    setMovementQuantity(String(movement.quantity));
    setMovementUnitPrice(String(movement.unitPrice));
    setMovementDate(movement.movementDate);
    setMovementDestination(movement.destination);
    setMovementRecipient(movement.recipient);
    setMovementNote(movement.note);
    setShowMovementForm(true);
    setShowItemForm(false);
    setShowBalanceAdjust(false);
    clearMessages();
  }

  function cancelMovementForm() {
    setShowMovementForm(false);
    setEditingMovementId(null);
    clearMessages();
  }

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const quantity = Number(movementQuantity);
    if (!movementItem || !Number.isFinite(quantity) || quantity <= 0) {
      setError("أدخل صنفًا وكمية صحيحة.");
      return;
    }
    const previousContribution =
      editingMovement && editingMovement.itemId === movementItem.id
        ? editingMovement.direction === "in"
          ? editingMovement.quantity
          : -editingMovement.quantity
        : 0;
    const availableBalance = movementBalance - previousContribution;
    if (
      movementDirection === "out" &&
      quantity > availableBalance + 1e-9
    ) {
      setError("الكمية المنصرفة أكبر من الرصيد المتاح.");
      return;
    }
    if (!movementDate) {
      setError("أدخل تاريخ الحركة.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = editingMovementId
          ? await updateInventoryMovementAction({
              id: editingMovementId,
              itemId: movementItem.id,
              direction: movementDirection,
              quantity,
              unitPrice:
                movementUnitPrice === ""
                  ? undefined
                  : Number(movementUnitPrice),
              movementDate,
              destination: movementDestination,
              recipient: movementRecipient,
              note: movementNote,
            })
          : await recordInventoryMovementAction({
              itemId: movementItem.id,
              direction: movementDirection,
              quantity,
              movementDate,
              destination: movementDestination,
              recipient: movementRecipient,
              note: movementNote,
            });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onInventoryChange((current) => ({
          ...current,
          movements: editingMovementId
            ? current.movements.map((movement) =>
                movement.id === result.movement.id ? result.movement : movement,
              )
            : sortMovements([...current.movements, result.movement]),
        }));
      } else {
        const movement: InventoryMovement = {
          id: editingMovementId ?? createDemoId(),
          itemId: movementItem.id,
          itemName: movementItem.name,
          categoryId: movementItem.categoryId,
          direction: movementDirection,
          quantity,
          unitPrice:
            movementUnitPrice === ""
              ? movementItem.unitPrice
              : Number(movementUnitPrice),
          movementDate,
          destination: movementDestination.trim(),
          recipient: movementRecipient.trim(),
          note: movementNote.trim(),
          voided: false,
        };
        onInventoryChange((current) => ({
          ...current,
          movements: editingMovementId
            ? current.movements.map((item) =>
                item.id === movement.id ? movement : item,
              )
            : sortMovements([...current.movements, movement]),
        }));
      }
      cancelMovementForm();
      setMessage(
        editingMovementId ? "تم تعديل حركة المخزون." : "تم حفظ حركة المخزون.",
      );
    } catch {
      setError("تعذر حفظ حركة المخزون. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  function startBalanceAdjust(item: InventoryItem) {
    setBalanceAdjustItemId(item.id);
    setBalanceAdjustValue(String(balances.get(item.id) ?? 0));
    setShowBalanceAdjust(true);
    setShowItemForm(false);
    setShowMovementForm(false);
    setEditingMovementId(null);
    clearMessages();
  }

  async function submitBalanceAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!balanceAdjustItem) return;
    const desired = Number(balanceAdjustValue);
    if (!Number.isFinite(desired) || desired < 0) {
      setError("أدخل رصيدًا صحيحًا غير سالب.");
      return;
    }
    const difference = roundQuantity(desired - currentAdjustBalance);
    if (Math.abs(difference) < 1e-9) {
      setShowBalanceAdjust(false);
      setMessage("الرصيد الحالي مطابق للقيمة المدخلة.");
      return;
    }
    const direction: InventoryDirection = difference > 0 ? "in" : "out";
    const quantity = Math.abs(difference);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (persistent) {
        const result = await recordInventoryMovementAction({
          itemId: balanceAdjustItem.id,
          direction,
          quantity,
          movementDate: localDateValue(),
          destination: "تسوية مخزون",
          recipient: "",
          note: "تسوية رصيد من شاشة مخزن الأغذية",
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onInventoryChange((current) => ({
          ...current,
          movements: sortMovements([...current.movements, result.movement]),
        }));
      } else {
        const movement: InventoryMovement = {
          id: createDemoId(),
          itemId: balanceAdjustItem.id,
          itemName: balanceAdjustItem.name,
          categoryId: balanceAdjustItem.categoryId,
          direction,
          quantity,
          unitPrice: balanceAdjustItem.unitPrice,
          movementDate: localDateValue(),
          destination: "تسوية مخزون",
          recipient: "",
          note: "تسوية رصيد من شاشة مخزن الأغذية",
          voided: false,
        };
        onInventoryChange((current) => ({
          ...current,
          movements: sortMovements([...current.movements, movement]),
        }));
      }
      setShowBalanceAdjust(false);
      setMessage("تم تسجيل تسوية الرصيد كحركة مخزون.");
    } catch {
      setError("تعذر تسجيل تسوية الرصيد.");
    } finally {
      setSaving(false);
    }
  }

  async function voidMovement(movementId: string) {
    if (
      !window.confirm(
        "سيتم إلغاء الحركة مع الاحتفاظ بها في سجل المراجعة. هل تريد المتابعة؟",
      )
    ) {
      return;
    }
    setError("");
    setMessage("");
    setSaving(true);
    try {
      if (persistent) {
        const result = await voidInventoryMovementAction(movementId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      onInventoryChange((current) => ({
        ...current,
        movements: current.movements.map((movement) =>
          movement.id === movementId
            ? { ...movement, voided: true }
            : movement,
        ),
      }));
      if (editingMovementId === movementId) cancelMovementForm();
    } catch {
      setError("تعذر إلغاء حركة المخزون.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-panel inventory-panel">
      <PrintBrand
        title="تقرير مخزن الأغذية"
        subtitle="الأصناف والحركات حسب الفلتر المطبق"
        meta={[
          { label: "الصنف", value: reportItemName },
          { label: "الفترة", value: reportPeriodLabel },
        ]}
      />
      <div className="panel-heading report-summary">
        <div>
          <h3>مخزن الأغذية — الأصناف والأرصدة</h3>
          <p>
            {canManage
              ? "مخزن أغذية واحد: أضف الأصناف وعدّل كل بياناتها، وسجّل الوارد والمنصرف أو عدّل أي حركة. الرصيد يُحسب تلقائيًا من الحركات."
              : "عرض أصناف مخزن الأغذية وأرصدتها وحركاتها وفق الصلاحيات الممنوحة لك."}
          </p>
        </div>
        {canManage && (
          <div className="action-group">
            <button className="secondary-button" type="button" onClick={startNewItem}>
              إضافة صنف
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!activeItems.length}
              onClick={startMovement}
            >
              تسجيل حركة
            </button>
          </div>
        )}
      </div>

      {showItemForm && canManage && (
        <form className="inventory-form inventory-item-form no-print" onSubmit={submitItem}>
          <div className="inventory-section-heading">
            <div>
              <h4>{editingItemId ? "تعديل الصنف" : "إضافة صنف جديد"}</h4>
              <p>كل حقول الصنف قابلة للتعديل في أي وقت.</p>
            </div>
          </div>
          <label className="form-field">
            اسم الصنف
            <input
              autoFocus
              required
              maxLength={160}
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
            />
          </label>
          <label className="form-field">
            وحدة القياس
            <input
              required
              maxLength={40}
              value={itemUnit}
              onChange={(event) => setItemUnit(event.target.value)}
            />
          </label>
          <label className="form-field">
            سعر الوحدة
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={itemPrice}
              onChange={(event) => setItemPrice(event.target.value)}
            />
          </label>
          <label className="form-field inventory-checkbox-field">
            <input
              type="checkbox"
              checked={itemActive}
              onChange={(event) => setItemActive(event.target.checked)}
            />
            الصنف نشط
          </label>
          {!editingItemId && (
            <>
              <label className="form-field">
                الكمية الافتتاحية (اختياري)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={itemInitialQuantity}
                  onChange={(event) => setItemInitialQuantity(event.target.value)}
                />
              </label>
              <label className="form-field">
                تاريخ الرصيد الافتتاحي
                <input
                  type="date"
                  required={Number(itemInitialQuantity) > 0}
                  value={itemInitialDate}
                  onChange={(event) => setItemInitialDate(event.target.value)}
                />
              </label>
            </>
          )}
          <p className="form-hint">
            الكمية الافتتاحية تُسجَّل كحركة وارد، ويمكن تعديل الرصيد لاحقًا من
            «تعديل الرصيد» أو بتعديل الحركات.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              onClick={resetItemForm}
              disabled={saving}
            >
              إلغاء
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ الصنف"}
            </button>
          </div>
        </form>
      )}

      {showBalanceAdjust && canManage && balanceAdjustItem && (
        <form className="inventory-form no-print" onSubmit={submitBalanceAdjust}>
          <div className="inventory-section-heading">
            <div>
              <h4>تعديل رصيد: {balanceAdjustItem.name}</h4>
              <p>
                سيُسجَّل الفرق كحركة تسوية ({numberFormatter.format(
                  currentAdjustBalance,
                )}{" "}
                → {balanceAdjustValue || "0"}) للحفاظ على سجل المخزون.
              </p>
            </div>
          </div>
          <label className="form-field">
            الرصيد الجديد
            <input
              type="number"
              min="0"
              step="any"
              required
              autoFocus
              value={balanceAdjustValue}
              onChange={(event) => setBalanceAdjustValue(event.target.value)}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={() => setShowBalanceAdjust(false)}
            >
              إلغاء
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ تسوية الرصيد"}
            </button>
          </div>
        </form>
      )}

      {showMovementForm && canManage && (
        <form className="inventory-form inventory-item-form no-print" onSubmit={submitMovement}>
          <div className="inventory-section-heading">
            <div>
              <h4>
                {editingMovementId ? "تعديل حركة المخزون" : "تسجيل حركة مخزون"}
              </h4>
              <p>
                {editingMovementId
                  ? "كل حقول الحركة قابلة للتعديل، وسيُعاد حساب الرصيد تلقائيًا."
                  : "الوارد يزيد الرصيد والمنصرف ينقصه، ولا يمكن أن يصبح الرصيد سالبًا."}
              </p>
            </div>
          </div>
          <label className="form-field">
            الصنف
            <select
              required
              value={movementItemId}
              onChange={(event) => setMovementItemId(event.target.value)}
            >
              <option value="">اختر الصنف</option>
              {(editingMovementId ? items : activeItems).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            نوع الحركة
            <select
              value={movementDirection}
              onChange={(event) => {
                const direction =
                  event.target.value === "out" ? "out" : "in";
                setMovementDirection(direction);
                if (!editingMovementId) {
                  setMovementDestination(direction === "out" ? "المطبخ" : "");
                }
              }}
            >
              <option value="in">وارد</option>
              <option value="out">منصرف</option>
            </select>
          </label>
          <label className="form-field">
            الكمية
            <input
              type="number"
              min="0.01"
              step="any"
              required
              value={movementQuantity}
              onChange={(event) => setMovementQuantity(event.target.value)}
            />
          </label>
          <label className="form-field">
            سعر الوحدة وقت الحركة
            <input
              type="number"
              min="0"
              step="0.01"
              value={movementUnitPrice}
              onChange={(event) => setMovementUnitPrice(event.target.value)}
              placeholder="يُؤخذ من سعر الصنف عند التسجيل"
              disabled={!editingMovementId}
            />
          </label>
          <label className="form-field">
            التاريخ
            <input
              type="date"
              required
              value={movementDate}
              onChange={(event) => setMovementDate(event.target.value)}
            />
          </label>
          <label className="form-field">
            الجهة (مورد / جهة صرف)
            <input
              list="inventory-destinations"
              maxLength={160}
              value={movementDestination}
              onChange={(event) => setMovementDestination(event.target.value)}
            />
            <datalist id="inventory-destinations">
              <option value="المطبخ" />
              <option value="تسوية مخزون" />
            </datalist>
          </label>
          <label className="form-field">
            اسم المستلم (اختياري)
            <input
              maxLength={160}
              value={movementRecipient}
              onChange={(event) => setMovementRecipient(event.target.value)}
            />
          </label>
          <label className="form-field inventory-note-field">
            ملاحظات
            <input
              maxLength={500}
              value={movementNote}
              onChange={(event) => setMovementNote(event.target.value)}
            />
          </label>
          <p className="form-hint">
            الرصيد الحالي للصنف:{" "}
            <strong>{numberFormatter.format(movementBalance)}</strong>{" "}
            {movementItem?.unit ?? ""}
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              onClick={cancelMovementForm}
              disabled={saving}
            >
              إلغاء
            </button>
            <button className="primary-button" disabled={saving}>
              {saving
                ? "جارٍ الحفظ..."
                : editingMovementId
                  ? "حفظ تعديل الحركة"
                  : "حفظ الحركة"}
            </button>
          </div>
        </form>
      )}

      {message && (
        <p className="form-message form-message-success no-print" role="status">
          {message}
        </p>
      )}
      {error && !showItemForm && !showMovementForm && !showBalanceAdjust && (
        <p className="form-error inventory-error" role="alert">{error}</p>
      )}

      {!items.length ? (
        <div className="empty-state">
          {canManage ? (
            <>
              <p>لا توجد أصناف في مخزن الأغذية بعد.</p>
              <button
                className="secondary-button no-print"
                type="button"
                onClick={startNewItem}
              >
                إضافة أول صنف
              </button>
            </>
          ) : (
            "لم يمنحك المسؤول صلاحية عرض أصناف مخزن الأغذية."
          )}
        </div>
      ) : (
        <>
          <div className="inventory-summary report-summary">
            <div className="inventory-summary-card">
              <span>الأصناف النشطة</span>
              <strong>{reportActiveItems.length}</strong>
            </div>
            <div className="inventory-summary-card">
              <span>إجمالي الرصيد</span>
              <strong>{numberFormatter.format(totalBalance)}</strong>
            </div>
            <div className="inventory-summary-card">
              <span>إجمالي الوارد</span>
              <strong>{numberFormatter.format(movementTotals.incoming)}</strong>
            </div>
            <div className="inventory-summary-card">
              <span>إجمالي المنصرف</span>
              <strong>{numberFormatter.format(movementTotals.outgoing)}</strong>
            </div>
            <div className="inventory-summary-card">
              <span>قيمة الوارد</span>
              <strong>
                {numberFormatter.format(movementTotals.incomingValue)} ج.م
              </strong>
            </div>
            <div className="inventory-summary-card">
              <span>قيمة المنصرف</span>
              <strong>
                {numberFormatter.format(movementTotals.outgoingValue)} ج.م
              </strong>
            </div>
            <div className="inventory-summary-card">
              <span>قيمة المخزون الحالي</span>
              <strong>{numberFormatter.format(stockValue)} ج.م</strong>
            </div>
          </div>

          <div className="table-wrap report-summary">
            <table className="resident-table inventory-table">
              <thead>
                <tr>
                  <th scope="col">الصنف</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">الرصيد الحالي</th>
                  <th scope="col">سعر الوحدة</th>
                  <th scope="col">قيمة الرصيد</th>
                  {canManage && <th scope="col" className="inventory-actions-col">الإدارة</th>}
                </tr>
              </thead>
              <tbody>
                {reportItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.active ? "نشط" : "موقوف"}</td>
                    <td>
                      {numberFormatter.format(balances.get(item.id) ?? 0)}{" "}
                      {item.unit}
                    </td>
                    <td>{numberFormatter.format(item.unitPrice)}</td>
                    <td>
                      {numberFormatter.format(
                        (balances.get(item.id) ?? 0) * item.unitPrice,
                      )}{" "}
                      ج.م
                    </td>
                    {canManage && (
                      <td className="inventory-actions-col">
                        <button
                          className="table-action"
                          type="button"
                          disabled={saving}
                          onClick={() => editItem(item)}
                        >
                          تعديل
                        </button>
                        {item.active && (
                          <button
                            className="table-action"
                            type="button"
                            disabled={saving}
                            onClick={() => startBalanceAdjust(item)}
                          >
                            تعديل الرصيد
                          </button>
                        )}
                        <button
                          className="table-action"
                          type="button"
                          disabled={saving}
                          onClick={() => toggleItemActive(item)}
                        >
                          {item.active ? "إيقاف" : "تفعيل"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="report-detail inventory-movement-report">
          <div className="panel-heading inventory-history-heading">
            <div>
              <h3>حركة مخزن الأغذية</h3>
              <p>سجل الوارد والمنصرف مع جهة الصرف والمستلم والسعر وقت الحركة.</p>
            </div>
            <div className="action-group no-print">
              <button className="secondary-button" type="button" onClick={() => printCurrentView({ section: "both" })}>
                طباعة الكل
              </button>
              <button className="secondary-button" type="button" onClick={() => printCurrentView({ section: "summary" })}>
                طباعة الملخص فقط
              </button>
              <button className="secondary-button" type="button" onClick={() => printCurrentView({ section: "detail" })}>
                طباعة الحركات فقط
              </button>
            </div>
          </div>
          <div className="filter-list no-print" aria-label="تصفية تقرير المخزون">
            <label className="form-field">الصنف
              <select value={reportItemId} onChange={(event) => setReportItemId(event.target.value)}>
                <option value="all">كل الأصناف</option>
                {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="form-field">من تاريخ<input type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} /></label>
            <label className="form-field">إلى تاريخ<input type="date" value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} /></label>
          </div>
          <p className="inventory-report-print-note">
            الصنف: <strong>{reportItemName}</strong> — الفترة:{" "}
            <strong>{reportPeriodLabel}</strong> — عدد الحركات:{" "}
            <strong>{numberFormatter.format(visibleMovements.length)}</strong> —
            إجمالي الوارد:{" "}
            <strong>{numberFormatter.format(movementTotals.incoming)}</strong> —
            إجمالي المنصرف:{" "}
            <strong>{numberFormatter.format(movementTotals.outgoing)}</strong>
          </p>
          <div className="table-wrap">
            <table className="resident-table inventory-table">
              <thead>
                <tr>
                  <th scope="col">التاريخ</th>
                  <th scope="col">الصنف</th>
                  <th scope="col">الحركة</th>
                  <th scope="col">الكمية</th>
                  <th scope="col">سعر الوحدة</th>
                  <th scope="col">إجمالي الحركة</th>
                  <th scope="col">جهة الصرف</th>
                  <th scope="col">المستلم</th>
                  <th scope="col">ملاحظات</th>
                  {canManage && <th scope="col" className="inventory-actions-col">إدارة</th>}
                </tr>
              </thead>
              <tbody>
                {visibleMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatDate(movement.movementDate)}</td>
                    <td>{movement.itemName}</td>
                    <td>
                      <span
                        className={`status-pill ${movement.voided ? "archived" : movement.direction === "in" ? "current" : "departed"}`}
                      >
                        {movement.voided
                          ? "ملغاة"
                          : movement.direction === "in"
                            ? "وارد"
                            : "منصرف"}
                      </span>
                    </td>
                    <td>{numberFormatter.format(movement.quantity)}</td>
                    <td>{numberFormatter.format(movement.unitPrice)}</td>
                    <td>{numberFormatter.format(movement.quantity * movement.unitPrice)} ج.م</td>
                    <td>{movement.destination || "—"}</td>
                    <td>{movement.recipient || "—"}</td>
                    <td>{movement.note || "—"}</td>
                    {canManage && (
                      <td className="inventory-actions-col">
                        {!movement.voided && (
                          <>
                            <button
                              className="table-action"
                              type="button"
                              disabled={saving}
                              onClick={() => editMovement(movement)}
                            >
                              تعديل
                            </button>
                            <button
                              className="table-action"
                              type="button"
                              disabled={saving}
                              onClick={() => voidMovement(movement.id)}
                            >
                              إلغاء الحركة
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {!visibleMovements.length && (
                  <tr>
                    <td colSpan={canManage ? 10 : 9}>
                      <div className="empty-state">
                        لا توجد حركات مسجلة ضمن الفلتر المحدد.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        </>
      )}
    </section>
  );
}
