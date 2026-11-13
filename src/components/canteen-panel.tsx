"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  recordCanteenMovementAction,
  saveCanteenProductAction,
  voidCanteenMovementAction,
} from "@/app/actions/canteen";
import { formatDate, localDateValue } from "@/lib/date-format";
import type {
  CanteenBundle,
  CanteenMovement,
} from "@/lib/canteen-types";

type CanteenPanelProps = {
  canteen: CanteenBundle;
  persistent: boolean;
  canManage: boolean;
  canVoid: boolean;
  onCanteenChange: (update: (current: CanteenBundle) => CanteenBundle) => void;
};

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

export default function CanteenPanel({
  canteen,
  persistent,
  canManage,
  canVoid,
  onCanteenChange,
}: CanteenPanelProps) {
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [editingProductNumber, setEditingProductNumber] = useState<number | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [movementItemNumber, setMovementItemNumber] = useState("");
  const [movementDirection, setMovementDirection] = useState<"in" | "out">("in");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [movementDate, setMovementDate] = useState("");
  const [recipient, setRecipient] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [voidingMovementId, setVoidingMovementId] = useState<number | null>(
    null,
  );
  const [voidReason, setVoidReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const balances = useMemo(() => {
    const result = new Map<number, number>();
    for (const movement of canteen.movements) {
      if (movement.voided) continue;
      result.set(
        movement.itemNumber,
        (result.get(movement.itemNumber) ?? 0) +
          (movement.incoming ?? 0) -
          (movement.outgoing ?? 0),
      );
    }
    return result;
  }, [canteen.movements]);

  const totals = useMemo(() => {
    let incoming = 0;
    let outgoing = 0;
    for (const movement of canteen.movements) {
      if (movement.voided) continue;
      incoming += movement.incoming ?? 0;
      outgoing += movement.outgoing ?? 0;
    }
    const remaining = [...balances.values()].reduce(
      (sum, value) => sum + value,
      0,
    );
    const value = canteen.products.reduce(
      (sum, product) =>
        sum + (balances.get(product.itemNumber) ?? 0) * product.price,
      0,
    );
    return { incoming, outgoing, remaining, value };
  }, [balances, canteen.movements, canteen.products]);

  const selectedProduct = canteen.products.find(
    (product) => String(product.itemNumber) === movementItemNumber,
  );
  const selectedBalance = selectedProduct
    ? (balances.get(selectedProduct.itemNumber) ?? 0)
    : 0;

  function startMovement() {
    setShowMovementForm(true);
    setMovementItemNumber(String(canteen.products[0]?.itemNumber ?? ""));
    setMovementDirection("in");
    setMovementQuantity("");
    setMovementDate(localDateValue());
    setRecipient("");
    setItemCategory("");
    setError("");
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const name = productName.trim().normalize("NFC");
    const price = Number(productPrice);
    if (!name) {
      setError("أدخل اسم الصنف.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("أدخل سعرًا صحيحًا للصنف.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await saveCanteenProductAction({ itemNumber: editingProductNumber, name, price });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onCanteenChange((current) => ({
          ...current,
          products: editingProductNumber === null
            ? [...current.products, result.product]
            : current.products.map((item) => item.itemNumber === editingProductNumber ? result.product : item),
        }));
      } else {
        const itemNumber =
          Math.max(1000, ...canteen.products.map((item) => item.itemNumber)) +
          1;
        const newProduct = {
          id: editingProductNumber ?? itemNumber,
          itemNumber: editingProductNumber ?? itemNumber,
          name,
          price,
          needsReview: false,
        };
        onCanteenChange((current) => ({
          ...current,
          products: editingProductNumber === null
            ? [...current.products, newProduct]
            : current.products.map((item) => item.itemNumber === editingProductNumber ? newProduct : item),
        }));
      }
      setEditingProductNumber(null);
      setProductName("");
      setProductPrice("");
      setShowProductForm(false);
    } catch {
      setError("تعذر حفظ صنف الكانتين. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const quantity = Number(movementQuantity);
    if (
      !selectedProduct ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !movementDate ||
      (movementDirection === "out" && quantity > selectedBalance + 1e-9)
    ) {
      setError(
        movementDirection === "out" && selectedProduct
          ? "الكمية المنصرفة أكبر من الرصيد المتاح أو بيانات الحركة غير مكتملة."
          : "أدخل صنفًا وكمية وتاريخًا صحيحًا.",
      );
      return;
    }
    if (movementDirection === "out" && !recipient.trim()) {
      setError("أدخل اسم المستلم للصرف.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await recordCanteenMovementAction({
          itemNumber: selectedProduct.itemNumber,
          direction: movementDirection,
          quantity,
          movementDate,
          recipient,
          itemCategory,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onCanteenChange((current) => ({
          ...current,
          movements: [result.movement, ...current.movements],
        }));
      } else {
        const id =
          Math.max(0, ...canteen.movements.map((movement) => movement.id)) + 1;
        const balanceAfter =
          selectedBalance +
          (movementDirection === "in" ? quantity : -quantity);
        const movement: CanteenMovement = {
          id,
          itemNumber: selectedProduct.itemNumber,
          itemName: selectedProduct.name,
          balance: balanceAfter,
          incoming: movementDirection === "in" ? quantity : null,
          incomingDate: movementDirection === "in" ? movementDate : null,
          outgoing: movementDirection === "out" ? quantity : null,
          outgoingDate: movementDirection === "out" ? movementDate : null,
          recipient: movementDirection === "out" ? recipient.trim() : "",
          voucherId: movementDirection === "out" ? id : null,
          voided: false,
          voidReason: "",
        };
        onCanteenChange((current) => ({
          ...current,
          movements: [movement, ...current.movements],
        }));
      }
      setMovementQuantity("");
      setRecipient("");
      setItemCategory("");
      setShowMovementForm(false);
    } catch {
      setError("تعذر تسجيل حركة الكانتين. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canVoid || voidingMovementId === null) return;
    const reason = voidReason.trim();
    if (!reason) {
      setError("أدخل سبب إلغاء الحركة.");
      return;
    }
    const movement = canteen.movements.find(
      (entry) => entry.id === voidingMovementId,
    );
    if (!movement) {
      setError("حركة الكانتين غير موجودة.");
      return;
    }
    const currentBalance = balances.get(movement.itemNumber) ?? 0;
    const balanceAfterVoid =
      currentBalance -
      (movement.incoming ?? 0) +
      (movement.outgoing ?? 0);
    if (balanceAfterVoid < -1e-9) {
      setError("لا يمكن إلغاء وارد استُخدم رصيده في عمليات صرف لاحقة.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (persistent) {
        const result = await voidCanteenMovementAction(
          voidingMovementId,
          reason,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      onCanteenChange((current) => ({
        ...current,
        movements: current.movements.map((movement) =>
          movement.id === voidingMovementId
            ? { ...movement, voided: true, voidReason: reason }
            : movement,
        ),
      }));
      setVoidingMovementId(null);
      setVoidReason("");
    } catch {
      setError("تعذر إلغاء حركة الكانتين. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-panel inventory-panel canteen-panel">
      <div className="panel-heading">
        <div>
          <h3>أصناف وحركة الكانتين</h3>
          <p>
            إدارة الأصناف والوارد والمنصرف مع حفظ كل حركة في السجل.
            {canVoid ? " إلغاء الحركات متاح للمسؤول فقط." : ""}
          </p>
        </div>
        {canManage && (
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setShowProductForm((current) => !current);
                setError("");
              }}
            >
              {showProductForm ? "إلغاء إضافة صنف" : "إضافة صنف"}
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={!canteen.products.length || saving}
              onClick={startMovement}
            >
              {showMovementForm ? "إلغاء الحركة" : "تسجيل وارد أو منصرف"}
            </button>
          </div>
        )}
      </div>

      {canManage && showProductForm && (
        <form className="inventory-form" onSubmit={submitProduct}>
          <label className="form-field">
            اسم الصنف
            <input
              autoFocus
              required
              maxLength={160}
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
            />
          </label>
          <label className="form-field">
            سعر الصنف (ج.م)
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={productPrice}
              onChange={(event) => setProductPrice(event.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowProductForm(false)}
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

      {canManage && showMovementForm && (
      <form className="inventory-form inventory-item-form" onSubmit={submitMovement}>
        <label className="form-field">
          الصنف
          <select
            required
            value={movementItemNumber}
            onChange={(event) => setMovementItemNumber(event.target.value)}
          >
            <option value="">اختر الصنف</option>
            {canteen.products.map((product) => (
              <option key={product.itemNumber} value={product.itemNumber}>
                {product.name} — {product.itemNumber}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          نوع الحركة
          <select
            value={movementDirection}
            onChange={(event) =>
              setMovementDirection(event.target.value === "out" ? "out" : "in")
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
        {movementDirection === "out" && (
          <>
            <label className="form-field">
              المستلم
              <input
                required
                maxLength={160}
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
              />
            </label>
            <label className="form-field">
              بند الصرف / الغرض (اختياري)
              <input
                maxLength={160}
                value={itemCategory}
                onChange={(event) => setItemCategory(event.target.value)}
              />
            </label>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="action-group">
          <span className="access-note">
            الرصيد الحالي: {numberFormatter.format(selectedBalance)}
          </span>
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowMovementForm(false)}
              disabled={saving}
            >
              إلغاء
            </button>
            <button
              className="primary-button"
              disabled={saving || !selectedProduct}
            >
              {saving ? "جارٍ الحفظ..." : "حفظ الحركة"}
            </button>
          </div>
        </div>
      </form>
      )}

      <div className="inventory-summary">
        <div className="inventory-summary-card">
          <span>أصناف الكانتين</span>
          <strong>{canteen.products.length}</strong>
        </div>
        <div className="inventory-summary-card">
          <span>إجمالي الحركات غير الملغاة</span>
          <strong>
            {canteen.movements.filter((movement) => !movement.voided).length}
          </strong>
        </div>
        <div className="inventory-summary-card">
          <span>أصناف بلا رصيد</span>
          <strong>
            {
              canteen.products.filter(
                (product) => (balances.get(product.itemNumber) ?? 0) <= 0,
              ).length
            }
          </strong>
        </div>
        <div className="inventory-summary-card">
          <span>إجمالي الوارد</span>
          <strong>{numberFormatter.format(totals.incoming)}</strong>
        </div>
        <div className="inventory-summary-card">
          <span>إجمالي المنصرف</span>
          <strong>{numberFormatter.format(totals.outgoing)}</strong>
        </div>
        <div className="inventory-summary-card">
          <span>الرصيد المتبقي</span>
          <strong>{numberFormatter.format(totals.remaining)}</strong>
        </div>
        <div className="inventory-summary-card">
          <span>قيمة المخزون</span>
          <strong>{numberFormatter.format(totals.value)} ج.م</strong>
        </div>
      </div>

      <div className="table-wrap">
        <table className="resident-table inventory-table">
          <thead>
            <tr>
              <th scope="col">رقم الصنف</th>
              <th scope="col">اسم الصنف</th>
              <th scope="col">السعر</th>
              <th scope="col">الرصيد الحالي</th>
              <th scope="col">قيمة الرصيد</th>
              <th scope="col">المراجعة</th>
              <th scope="col">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {canteen.products.map((product) => {
              const balance = balances.get(product.itemNumber) ?? 0;
              return (
                <tr key={product.itemNumber}>
                  <td>{product.itemNumber}</td>
                  <td>{product.name}</td>
                  <td>{numberFormatter.format(product.price)} ج.م</td>
                  <td>{numberFormatter.format(balance)}</td>
                  <td>{numberFormatter.format(balance * product.price)} ج.م</td>
                  <td>{product.needsReview ? "يحتاج مراجعة" : "سليم"}</td>
                  <td>
                    <button
                      className="table-action"
                      disabled={!canManage || saving}
                      onClick={() => {
                        setEditingProductNumber(product.itemNumber);
                        setProductName(product.name);
                        setProductPrice(String(product.price));
                        setShowProductForm(true);
                        setError("");
                      }}
                      type="button"
                    >تعديل</button>
                  </td>
                </tr>
              );
            })}
            {!canteen.products.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">أضف أول صنف للبدء.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel-heading inventory-history-heading">
        <div>
          <h3>سجل حركات الكانتين</h3>
          <p>يتضمن السجل الحركات الملغاة وأسباب إلغائها.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="resident-table inventory-table">
          <thead>
            <tr>
              <th scope="col">التاريخ</th>
              <th scope="col">الصنف</th>
              <th scope="col">الحركة</th>
              <th scope="col">الوارد</th>
              <th scope="col">المنصرف</th>
              <th scope="col">المستلم / بند الصرف</th>
              <th scope="col">الرصيد بعد الحركة</th>
              <th scope="col">السبب / الحالة</th>
              {canVoid && <th scope="col">الإدارة</th>}
            </tr>
          </thead>
          <tbody>
            {canteen.movements.map((movement) => (
              <tr key={movement.id}>
                <td>
                  {formatDate(movement.incomingDate ?? movement.outgoingDate ?? "")}
                </td>
                <td>
                  {movement.itemName} ({movement.itemNumber})
                </td>
                <td>{movement.incoming !== null ? "وارد" : "منصرف"}</td>
                <td>
                  {movement.incoming === null
                    ? "—"
                    : numberFormatter.format(movement.incoming)}
                </td>
                <td>
                  {movement.outgoing === null
                    ? "—"
                    : numberFormatter.format(movement.outgoing)}
                </td>
                <td>{[movement.recipient, movement.issueCategory].filter(Boolean).join(" · ") || "—"}</td>
                <td>{numberFormatter.format(movement.balance)}</td>
                <td>
                  {movement.voided
                    ? `ملغاة: ${movement.voidReason}`
                    : "سارية"}
                </td>
                {canVoid && (
                  <td>
                    {!movement.voided && voidingMovementId !== movement.id && (
                      <button
                        className="table-action"
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setVoidingMovementId(movement.id);
                          setVoidReason("");
                          setError("");
                        }}
                      >
                        إلغاء الحركة
                      </button>
                    )}
                    {voidingMovementId === movement.id && (
                      <form
                        className="canteen-void-form"
                        onSubmit={submitVoid}
                      >
                        {error && (
                          <p className="form-error" role="alert">
                            {error}
                          </p>
                        )}
                        <label className="sr-only" htmlFor={`void-${movement.id}`}>
                          سبب الإلغاء
                        </label>
                        <input
                          id={`void-${movement.id}`}
                          required
                          maxLength={500}
                          value={voidReason}
                          onChange={(event) => setVoidReason(event.target.value)}
                          placeholder="سبب الإلغاء"
                        />
                        <button className="table-action" disabled={saving}>
                          تأكيد الإلغاء
                        </button>
                        <button
                          className="table-action"
                          type="button"
                          disabled={saving}
                          onClick={() => setVoidingMovementId(null)}
                        >
                          تراجع
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!canteen.movements.length && (
              <tr>
                <td colSpan={canVoid ? 9 : 8}>
                  <div className="empty-state">لا توجد حركات مسجلة بعد.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
