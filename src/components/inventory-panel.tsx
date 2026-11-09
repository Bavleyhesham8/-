"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  recordInventoryMovementAction,
  saveInventoryCategoryAction,
  saveInventoryItemAction,
  setInventoryCategoryActiveAction,
  setInventoryItemActiveAction,
  voidInventoryMovementAction,
} from "@/app/actions/inventory";
import { formatDate, localDateValue } from "@/lib/date-format";
import { createDemoId } from "@/lib/inventory-demo-data";
import type {
  InventoryBundle,
  InventoryDirection,
  InventoryItem,
} from "@/lib/inventory-types";

type InventoryPanelProps = {
  inventory: InventoryBundle;
  persistent: boolean;
  canManage: boolean;
  onInventoryChange: (update: (current: InventoryBundle) => InventoryBundle) => void;
  onCategoryDeactivated: (categoryId: string) => void;
};

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

export default function InventoryPanel({
  inventory,
  persistent,
  canManage,
  onInventoryChange,
  onCategoryDeactivated,
}: InventoryPanelProps) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [categoryName, setCategoryName] = useState("");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [itemUnit, setItemUnit] = useState("وحدة");
  const [itemPrice, setItemPrice] = useState("0");
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [movementItemId, setMovementItemId] = useState("");
  const [movementDirection, setMovementDirection] =
    useState<InventoryDirection>("in");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementDate, setMovementDate] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const categories = inventory.categories.filter((category) => category.active);
  const allCategoryIds = new Set(
    (canManage ? inventory.categories : categories).map(
      (category) => category.id,
    ),
  );
  const itemCategories = canManage ? inventory.categories : categories;
  const items = inventory.items.filter(
    (item) =>
      allCategoryIds.has(item.categoryId) && (canManage || item.active),
  );
  const visibleCategories =
    categoryFilter === "all"
      ? categories
      : itemCategories.filter((category) => category.id === categoryFilter);
  const visibleCategoryIds = new Set(
    visibleCategories.map((category) => category.id),
  );
  const visibleItems = items.filter((item) =>
    visibleCategoryIds.has(item.categoryId),
  );
  const activeVisibleItems = visibleItems.filter((item) => item.active);
  const categoryById = new Map(
    inventory.categories.map((category) => [category.id, category] as const),
  );
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
  const visibleMovements = inventory.movements.filter((movement) => {
    return visibleCategoryIds.has(movement.categoryId);
  });
  const movementItem = inventory.items.find(
    (item) => item.id === movementItemId && item.active,
  );
  const movementBalance = movementItem
    ? (balances.get(movementItem.id) ?? 0)
    : 0;
  const movementTotals = { incoming: 0, outgoing: 0, incomingValue: 0, outgoingValue: 0 };
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
  const stockValue = visibleItems.reduce(
    (total, item) => total + (balances.get(item.id) ?? 0) * item.unitPrice,
    0,
  );

  function resetCategoryForm() {
    setShowCategoryForm(false);
    setEditingCategoryId(null);
    setCategoryName("");
    setError("");
  }

  function editCategory(id: string) {
    const category = inventory.categories.find((item) => item.id === id);
    if (!category) return;
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setShowCategoryForm(true);
    setShowItemForm(false);
    setShowMovementForm(false);
    setError("");
  }

  async function toggleCategoryActive(categoryId: string) {
    const category = inventory.categories.find(
      (item) => item.id === categoryId,
    );
    if (!category) return;
    const active = !category.active;
    setError("");
    setSaving(true);
    try {
      if (persistent) {
        const result = await setInventoryCategoryActiveAction(
          categoryId,
          active,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onInventoryChange((current) => ({
          ...current,
          categories: current.categories.map((item) =>
            item.id === categoryId ? result.category : item,
          ),
        }));
      } else {
        onInventoryChange((current) => ({
          ...current,
          categories: current.categories.map((item) =>
            item.id === categoryId ? { ...item, active } : item,
          ),
        }));
      }
      if (!active) {
        onCategoryDeactivated(categoryId);
        if (categoryFilter === categoryId) setCategoryFilter("all");
      }
    } catch {
      setError("تعذر تحديث حالة الفئة.");
    } finally {
      setSaving(false);
    }
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const normalizedName = categoryName.trim().normalize("NFC");
    if (
      inventory.categories.some(
        (category) =>
          category.id !== editingCategoryId &&
          category.name.toLocaleLowerCase("ar") ===
            normalizedName.toLocaleLowerCase("ar"),
      )
    ) {
      setError("اسم الفئة موجود بالفعل.");
      return;
    }
    setSaving(true);
    try {
      if (persistent) {
        const result = await saveInventoryCategoryAction(editingCategoryId, {
          name: normalizedName,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onInventoryChange((current) => ({
          ...current,
          categories: editingCategoryId
            ? current.categories.map((category) =>
                category.id === result.category.id
                  ? result.category
                  : category,
              )
            : [...current.categories, result.category],
        }));
      } else if (editingCategoryId) {
        onInventoryChange((current) => ({
          ...current,
          categories: current.categories.map((category) =>
            category.id === editingCategoryId
              ? { ...category, name: normalizedName }
              : category,
          ),
        }));
      } else {
        const id = createDemoId();
        onInventoryChange((current) => ({
          ...current,
          categories: [
            ...current.categories,
            { id, name: normalizedName, active: true },
          ],
        }));
        setCategoryFilter(id);
      }
      resetCategoryForm();
    } catch {
      setError("تعذر حفظ الفئة. تحقق من البيانات وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  function startNewItem() {
    setEditingItemId(null);
    setItemName("");
    setItemCategoryId(
      categories.some((category) => category.id === categoryFilter)
        ? categoryFilter
        : categories[0]?.id ?? "",
    );
    setItemUnit("وحدة");
    setItemPrice("0");
    setShowItemForm(true);
    setShowCategoryForm(false);
    setShowMovementForm(false);
    setError("");
  }

  function editItem(item: InventoryItem) {
    setEditingItemId(item.id);
    setItemName(item.name);
    setItemCategoryId(item.categoryId);
    setItemUnit(item.unit);
    setItemPrice(String(item.unitPrice));
    setShowItemForm(true);
    setShowCategoryForm(false);
    setShowMovementForm(false);
    setError("");
  }

  function resetItemForm() {
    setShowItemForm(false);
    setEditingItemId(null);
    setError("");
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsedPrice = Number(itemPrice);
    const normalizedName = itemName.trim().normalize("NFC");
    if (!itemCategoryId || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError("أدخل فئة وسعرًا صالحين للصنف.");
      return;
    }
    if (
      inventory.items.some(
        (item) =>
          item.id !== editingItemId &&
          item.categoryId === itemCategoryId &&
          item.name.toLocaleLowerCase("ar") ===
            normalizedName.toLocaleLowerCase("ar"),
      )
    ) {
      setError("يوجد صنف بهذا الاسم في الفئة المحددة.");
      return;
    }
    setSaving(true);
    try {
      const draft = {
        categoryId: itemCategoryId,
        name: normalizedName,
        unit: itemUnit.trim().normalize("NFC"),
        unitPrice: parsedPrice,
      };
      if (persistent) {
        const result = await saveInventoryItemAction(editingItemId, draft);
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
        }));
      } else {
        const nextItem: InventoryItem = {
          ...draft,
          id: editingItemId ?? createDemoId(),
          active: true,
        };
        onInventoryChange((current) => ({
          ...current,
          items: editingItemId
            ? current.items.map((item) =>
                item.id === editingItemId ? nextItem : item,
              )
            : [...current.items, nextItem],
        }));
      }
      resetItemForm();
    } catch {
      setError("تعذر حفظ الصنف. تحقق من البيانات وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  function startMovement() {
    setMovementItemId(activeVisibleItems[0]?.id ?? "");
    setMovementDirection("in");
    setMovementQuantity("");
    setMovementDate(localDateValue());
    setMovementNote("");
    setShowMovementForm(true);
    setShowCategoryForm(false);
    setShowItemForm(false);
    setError("");
  }

  async function toggleItemActive(item: InventoryItem) {
    const active = !item.active;
    setError("");
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

  async function voidMovement(movementId: string) {
    if (
      !window.confirm(
        "سيتم إلغاء الحركة مع الاحتفاظ بها في سجل المراجعة. هل تريد المتابعة؟",
      )
    ) {
      return;
    }
    setError("");
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
    } catch {
      setError("تعذر إلغاء حركة المخزون.");
    } finally {
      setSaving(false);
    }
  }

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const quantity = Number(movementQuantity);
    if (
      !movementItem ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      (movementDirection === "out" && quantity > movementBalance + 1e-9)
    ) {
      setError(
        movementDirection === "out" && movementItem
          ? "الكمية المنصرفة أكبر من الرصيد المتاح."
          : "أدخل صنفًا وكمية صحيحة.",
      );
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await recordInventoryMovementAction({
          itemId: movementItem.id,
          direction: movementDirection,
          quantity,
          movementDate,
          note: movementNote,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onInventoryChange((current) => ({
          ...current,
          movements: [result.movement, ...current.movements],
        }));
      } else {
        const movement = {
          id: createDemoId(),
          itemId: movementItem.id,
          itemName: movementItem.name,
          categoryId: movementItem.categoryId,
          direction: movementDirection,
          quantity,
          unitPrice: movementItem.unitPrice,
          movementDate,
          note: movementNote.trim(),
          voided: false,
        };
        onInventoryChange((current) => ({
          ...current,
          movements: [movement, ...current.movements],
        }));
      }
      setShowMovementForm(false);
    } catch {
      setError("تعذر حفظ حركة المخزون. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-panel inventory-panel">
      <div className="panel-heading">
        <div>
          <h3>الأصناف والأرصدة</h3>
          <p>
            {canManage
              ? "إدارة الفئات والأصناف وتسجيل حركات الوارد والمنصرف."
              : "عرض فقط للفئات التي سمح لك المسؤول بالوصول إليها."}
          </p>
        </div>
        {canManage && (
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                if (showCategoryForm) resetCategoryForm();
                else {
                  setEditingCategoryId(null);
                  setCategoryName("");
                  setShowCategoryForm(true);
                  setShowItemForm(false);
                  setShowMovementForm(false);
                  setError("");
                }
              }}
            >
              {showCategoryForm ? "إلغاء الفئة" : "إضافة فئة"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!categories.length}
              onClick={startNewItem}
            >
              إضافة صنف
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!activeVisibleItems.length}
              onClick={startMovement}
            >
              تسجيل حركة
            </button>
          </div>
        )}
      </div>

      {categories.length > 0 && (
        <div className="inventory-category-bar">
          <div className="filter-list" aria-label="فئات المخزون المتاحة">
            {canManage && (
              <button
                className={`filter-chip ${categoryFilter === "all" ? "active" : ""}`}
                type="button"
                aria-pressed={categoryFilter === "all"}
                onClick={() => setCategoryFilter("all")}
              >
                الكل
              </button>
            )}
            {categories.map((category) => (
              <button
                className={`filter-chip ${categoryFilter === category.id ? "active" : ""}`}
                key={category.id}
                type="button"
                aria-pressed={categoryFilter === category.id}
                onClick={() => setCategoryFilter(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
          {canManage && categoryFilter !== "all" && (
            <button
              className="table-action"
              type="button"
              onClick={() => editCategory(categoryFilter)}
            >
              تعديل اسم الفئة
            </button>
          )}
        </div>
      )}

      {canManage && (
        <div className="inventory-category-management">
          <h4>إدارة الفئات</h4>
          {inventory.categories.length ? (
            inventory.categories.map((category) => (
              <div className="inventory-management-row" key={category.id}>
                <span>
                  <strong>{category.name}</strong>
                  <small>{category.active ? "نشطة" : "موقوفة"}</small>
                </span>
                <div className="action-group">
                  <button
                    className="table-action"
                    type="button"
                    onClick={() => setCategoryFilter(category.id)}
                  >
                    عرض
                  </button>
                  <button
                    className="table-action"
                    type="button"
                    onClick={() => editCategory(category.id)}
                  >
                    تعديل
                  </button>
                  <button
                    className="table-action"
                    type="button"
                    disabled={saving}
                    onClick={() => toggleCategoryActive(category.id)}
                  >
                    {category.active ? "إيقاف" : "تفعيل"}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="access-note">
              لم تُنشأ فئات بعد. أضف المخازن أو الكانتين أو الثلاجة.
            </p>
          )}
        </div>
      )}

      {showCategoryForm && canManage && (
        <form className="inventory-form" onSubmit={submitCategory}>
          <label className="form-field">
            اسم الفئة
            <input
              autoFocus
              required
              maxLength={120}
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="مثال: مخازن"
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              onClick={resetCategoryForm}
              disabled={saving}
            >
              إلغاء
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ الفئة"}
            </button>
          </div>
        </form>
      )}

      {showItemForm && canManage && (
        <form className="inventory-form inventory-item-form" onSubmit={submitItem}>
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
            الفئة
            <select
              required
              value={itemCategoryId}
              onChange={(event) => setItemCategoryId(event.target.value)}
            >
              <option value="">اختر الفئة</option>
              {inventory.categories
                .filter(
                  (category) =>
                    category.active ||
                    (editingItemId && category.id === itemCategoryId),
                )
                .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
                ))}
            </select>
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

      {showMovementForm && canManage && (
        <form className="inventory-form inventory-item-form" onSubmit={submitMovement}>
          <label className="form-field">
            الصنف
            <select
              required
              value={movementItemId}
              onChange={(event) => setMovementItemId(event.target.value)}
            >
              <option value="">اختر الصنف</option>
              {activeVisibleItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {categoryById.get(item.categoryId)?.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            نوع الحركة
            <select
              value={movementDirection}
              onChange={(event) =>
                setMovementDirection(
                  event.target.value === "out" ? "out" : "in",
                )
              }
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
            التاريخ
            <input
              type="date"
              required
              value={movementDate}
              onChange={(event) => setMovementDate(event.target.value)}
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
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowMovementForm(false)}
              disabled={saving}
            >
              إلغاء
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ الحركة"}
            </button>
          </div>
        </form>
      )}

      {error && !showCategoryForm && !showItemForm && !showMovementForm && (
        <p className="form-error inventory-error" role="alert">{error}</p>
      )}

      {!categories.length ? (
        <div className="empty-state">
          {canManage
            ? "لا توجد فئات نشطة. فعّل فئة موجودة أو أضف المخازن أو الكانتين أو الثلاجة."
            : "لم يمنحك المسؤول صلاحية عرض أي فئة من المخزون."}
        </div>
      ) : (
        <>
          <div className="inventory-summary">
            <div className="inventory-summary-card">
              <span>الفئات المتاحة</span>
              <strong>{visibleCategories.length}</strong>
            </div>
            <div className="inventory-summary-card">
              <span>الأصناف الظاهرة</span>
              <strong>{activeVisibleItems.length}</strong>
            </div>
            <div className="inventory-summary-card">
              <span>إجمالي الرصيد</span>
              <strong>
                {numberFormatter.format(
                  visibleItems.reduce(
                    (total, item) => total + (balances.get(item.id) ?? 0),
                    0,
                  ),
                )}
              </strong>
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

          <div className="table-wrap">
            <table className="resident-table inventory-table">
              <thead>
                <tr>
                  <th scope="col">الصنف</th>
                  <th scope="col">الفئة</th>
                  <th scope="col">الرصيد الحالي</th>
                  <th scope="col">سعر الوحدة</th>
                  <th scope="col">قيمة الرصيد</th>
                  {canManage && <th scope="col">الحالة والإدارة</th>}
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{categoryById.get(item.categoryId)?.name ?? "—"}</td>
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
                      <td>
                        <button
                          className="table-action"
                          type="button"
                          onClick={() => editItem(item)}
                        >
                          تعديل
                        </button>
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
                {!visibleItems.length && (
                  <tr>
                    <td colSpan={canManage ? 5 : 4}>
                      <div className="empty-state">
                        لا توجد أصناف في هذه الفئة حتى الآن.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="panel-heading inventory-history-heading">
            <div>
              <h3>حركة المخزون</h3>
              <p>سجل الوارد والمنصرف للفئات المتاحة.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="resident-table inventory-table">
              <thead>
                <tr>
                  <th scope="col">التاريخ</th>
                  <th scope="col">الصنف</th>
                  <th scope="col">الفئة</th>
                  <th scope="col">الحركة</th>
                  <th scope="col">الكمية</th>
                  <th scope="col">سعر الوحدة</th>
                  <th scope="col">ملاحظات</th>
                  {canManage && <th scope="col">إدارة</th>}
                </tr>
              </thead>
              <tbody>
                {visibleMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td>{formatDate(movement.movementDate)}</td>
                      <td>{movement.itemName}</td>
                      <td>
                        {categoryById.get(movement.categoryId)?.name ?? "—"}
                      </td>
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
                      <td>{movement.note || "—"}</td>
                      {canManage && (
                        <td>
                          {!movement.voided && (
                            <button
                              className="table-action"
                              type="button"
                              disabled={saving}
                              onClick={() => voidMovement(movement.id)}
                            >
                              إلغاء الحركة
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                ))}
                {!visibleMovements.length && (
                  <tr>
                    <td colSpan={canManage ? 8 : 7}>
                      <div className="empty-state">
                        لا توجد حركات مسجلة لهذه الفئات.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
