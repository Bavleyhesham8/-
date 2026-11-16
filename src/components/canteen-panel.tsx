"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { recordCanteenMovementAction, saveCanteenProductAction } from "@/app/actions/canteen";
import { localDateValue } from "@/lib/date-format";
import PrintBrand from "@/components/print-brand";
import type {
  CanteenBundle,
  CanteenMovement,
  CanteenProduct,
} from "@/lib/canteen-types";

type CanteenPanelProps = {
  canteen: CanteenBundle;
  persistent: boolean;
  canManage: boolean;
  onCanteenChange: (update: (current: CanteenBundle) => CanteenBundle) => void;
  onOpenMovementLog?: () => void;
};

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

function currentBalance(
  product: CanteenProduct,
  movements: CanteenMovement[],
) {
  const itemMovements = movements.filter(
    (movement) => movement.itemNumber === product.itemNumber,
  );
  if (itemMovements.length) {
    return itemMovements
      .filter((movement) => !movement.voided)
      .reduce(
        (total, movement) =>
          total + (movement.incoming ?? 0) - (movement.outgoing ?? 0),
        0,
      );
  }
  return product.balance ?? 0;
}

export default function CanteenPanel({
  canteen,
  persistent,
  canManage,
  onCanteenChange,
  onOpenMovementLog,
}: CanteenPanelProps) {
  const incomingDatalistId = useId();
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductNumber, setEditingProductNumber] = useState<
    number | null
  >(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productQuantity, setProductQuantity] = useState("");
  const [productBalance, setProductBalance] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showIncomingForm, setShowIncomingForm] = useState(false);
  const [incomingItemNumber, setIncomingItemNumber] = useState("");
  const [incomingNewName, setIncomingNewName] = useState("");
  const [incomingQuantity, setIncomingQuantity] = useState("");
  const [incomingPrice, setIncomingPrice] = useState("");
  const [incomingDate, setIncomingDate] = useState(localDateValue());

  const balances = useMemo(() => {
    const result = new Map<number, number>();
    for (const product of canteen.products) {
      result.set(
        product.itemNumber,
        currentBalance(product, canteen.movements),
      );
    }
    return result;
  }, [canteen.movements, canteen.products]);

  const totals = useMemo(() => {
    const remaining = canteen.products.reduce(
      (sum, product) =>
        sum + (balances.get(product.itemNumber) ?? 0),
      0,
    );
    const value = canteen.products.reduce(
      (sum, product) =>
        sum + (balances.get(product.itemNumber) ?? 0) * product.price,
      0,
    );
    const outOfStock = canteen.products.filter(
      (product) => (balances.get(product.itemNumber) ?? 0) <= 0,
    ).length;
    return { remaining, value, outOfStock };
  }, [balances, canteen.products]);

  function resetForm() {
    setShowProductForm(false);
    setEditingProductNumber(null);
    setProductName("");
    setProductPrice("");
    setProductQuantity("");
    setProductBalance("");
    setError("");
  }

  function startCreate() {
    setEditingProductNumber(null);
    setProductName("");
    setProductPrice("");
    setProductQuantity("");
    setProductBalance("");
    setShowProductForm(true);
    setError("");
  }

  function startEdit(product: CanteenProduct) {
    if (!canManage) return;
    setEditingProductNumber(product.itemNumber);
    setProductName(product.name);
    setProductPrice(String(product.price));
    setProductQuantity("");
    setProductBalance(
      String(balances.get(product.itemNumber) ?? product.balance ?? 0),
    );
    setShowProductForm(true);
    setError("");
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const name = productName.trim().normalize("NFC");
    const price = Number(productPrice);
    const quantity = Number(productQuantity || "0");
    const balance = Number(productBalance || "0");
    if (!name) {
      setError("أدخل اسم الصنف.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("أدخل سعرًا صحيحًا للصنف.");
      return;
    }
    if (
      editingProductNumber === null &&
      (!Number.isFinite(quantity) || quantity < 0)
    ) {
      setError("أدخل كمية افتتاحية صحيحة.");
      return;
    }
    if (
      editingProductNumber !== null &&
      (!Number.isFinite(balance) || balance < 0)
    ) {
      setError("أدخل رصيدًا صحيحًا للصنف.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result = await saveCanteenProductAction({
          itemNumber: editingProductNumber,
          name,
          price,
          quantity: editingProductNumber === null ? quantity : undefined,
          balance: editingProductNumber === null ? undefined : balance,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const savedProduct = result.product;
        const savedMovement = result.movement;
        onCanteenChange((current) => {
          const movements = savedMovement
            ? [...current.movements, savedMovement]
            : current.movements;
          return {
            products:
              editingProductNumber === null
                ? [...current.products, savedProduct]
                : current.products.map((item) =>
                    item.itemNumber === savedProduct.itemNumber
                      ? savedProduct
                      : item,
                  ),
            movements,
          };
        });
      } else {
        const itemNumber =
          editingProductNumber ??
          Math.max(1000, ...canteen.products.map((item) => item.itemNumber)) +
            1;
        const savedProduct: CanteenProduct = {
          id: editingProductNumber ?? itemNumber,
          itemNumber,
          name,
          price,
          balance: editingProductNumber === null ? quantity : balance,
          needsReview: false,
        };
        onCanteenChange((current) => {
          const existing = current.products.find(
            (item) => item.itemNumber === itemNumber,
          );
          const previousBalance = existing
            ? currentBalance(existing, current.movements)
            : 0;
          const nextBalance = savedProduct.balance ?? 0;
          const difference = nextBalance - previousBalance;
          const adjustment: CanteenMovement | null =
            Math.abs(difference) > 1e-9
              ? {
                  id: Math.min(0, ...current.movements.map((item) => item.id)) - 1,
                  itemNumber,
                  itemName: name,
                  balance: nextBalance,
                  incoming: difference > 0 ? difference : null,
                  incomingDate: difference > 0 ? localDateValue() : null,
                  outgoing: difference < 0 ? -difference : null,
                  outgoingDate: difference < 0 ? localDateValue() : null,
                  recipient: "",
                  issueCategory: "تسوية رصيد",
                  voucherId: null,
                  voided: false,
                  voidReason: "",
                }
              : null;
          return {
            products:
              editingProductNumber === null
                ? [...current.products, savedProduct]
                : current.products.map((item) =>
                    item.itemNumber === itemNumber ? savedProduct : item,
                  ),
            movements: adjustment
              ? [...current.movements, adjustment]
              : current.movements,
          };
        });
      }
      resetForm();
    } catch {
      setError("تعذر حفظ صنف الكانتين. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function submitIncoming(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const quantity = Number(incomingQuantity);
    const price = Number(incomingPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) {
      setError("أدخل كمية وسعرًا صحيحين للوارد.");
      return;
    }
    const existing = canteen.products.find((item) => item.itemNumber === Number(incomingItemNumber))
      ?? canteen.products.find((item) => item.name.trim().toLowerCase() === incomingNewName.trim().toLowerCase());
    const name = existing?.name ?? incomingNewName.trim().normalize("NFC");
    if (!name) {
      setError("اختر صنفًا أو اكتب اسم الصنف الجديد.");
      return;
    }
    setSaving(true);
    try {
      let itemNumber = existing?.itemNumber;
      if (persistent) {
        const productResult = await saveCanteenProductAction({
          itemNumber: existing?.itemNumber ?? null,
          name,
          price,
          ...(existing ? {} : { quantity: 0 }),
        });
        if (!productResult.ok) { setError(productResult.error); return; }
        itemNumber = productResult.product.itemNumber;
        onCanteenChange((current) => ({
          ...current,
          products: existing
            ? current.products.map((item) => item.itemNumber === itemNumber ? productResult.product : item)
            : [...current.products, productResult.product],
        }));
        const movementResult = await recordCanteenMovementAction({
          itemNumber, direction: "in", quantity, movementDate: incomingDate,
          recipient: "", itemCategory: "",
        });
        if (!movementResult.ok) { setError(movementResult.error); return; }
        onCanteenChange((current) => ({ ...current, movements: [...current.movements, movementResult.movement] }));
      } else {
        itemNumber ??= Math.max(1000, ...canteen.products.map((item) => item.itemNumber)) + 1;
        const product: CanteenProduct = existing
          ? { ...existing, price }
          : { id: itemNumber, itemNumber, name, price, balance: 0, needsReview: false };
        const movement: CanteenMovement = {
          id: Math.min(0, ...canteen.movements.map((item) => item.id)) - 1,
          itemNumber, itemName: name, balance: (balances.get(itemNumber) ?? 0) + quantity,
          incoming: quantity, incomingDate, outgoing: null, outgoingDate: null,
          recipient: "", issueCategory: "", voucherId: null, voided: false, voidReason: "",
        };
        onCanteenChange((current) => ({
          products: existing
            ? current.products.map((item) => item.itemNumber === itemNumber ? product : item)
            : [...current.products, product],
          movements: [...current.movements, movement],
        }));
      }
      setIncomingItemNumber(""); setIncomingNewName(""); setIncomingQuantity("");
      setIncomingPrice(""); setIncomingDate(localDateValue()); setShowIncomingForm(false);
    } catch {
      setError("تعذر تسجيل الوارد. حاول مرة أخرى.");
    } finally { setSaving(false); }
  }

  return (
    <section className="content-panel inventory-panel canteen-panel">
      <PrintBrand
        title="مخزون الكانتين"
        subtitle="أرصدة أصناف الكانتين وقيمة المخزون"
        meta={[{ label: "عدد الأصناف", value: String(canteen.products.length) }]}
      />
      <div className="panel-heading">
        <div>
          <h3>أرصدة أصناف الكانتين</h3>
          <p>
            تعرض هذه الصفحة الأرصدة فقط. حركات الوارد والمنصرف وسجل التعديلات
            في صفحة «سجل حركات الكانتين».
          </p>
        </div>
        <div className="action-group">
          {canManage && <button className="primary-button" type="button" onClick={() => { setShowIncomingForm((value) => !value); setError(""); }}>
            {showIncomingForm ? "إغلاق تسجيل الوارد" : "تسجيل وارد"}
          </button>}
          {onOpenMovementLog && (
            <button
              className="secondary-button"
              type="button"
              onClick={onOpenMovementLog}
            >
              سجل حركات الكانتين
            </button>
          )}
          {canManage && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                if (showProductForm && editingProductNumber === null) {
                  resetForm();
                } else {
                  startCreate();
                }
              }}
            >
              {showProductForm && editingProductNumber === null
                ? "إلغاء إضافة صنف"
                : "إضافة صنف"}
            </button>
          )}
        </div>
      </div>

      {canManage && showIncomingForm && (
        <form className="inventory-form" onSubmit={submitIncoming}>
          <label className="form-field">
            الصنف (اختر أو اكتب)
            <input
              list={incomingDatalistId}
              required
              maxLength={160}
              placeholder="اختر صنفاً أو اكتب اسماً جديداً..."
              value={incomingNewName}
              onChange={(event) => {
                const val = event.target.value;
                setIncomingNewName(val);
                const matched = canteen.products.find(
                  (product) => product.name.trim().toLowerCase() === val.trim().toLowerCase()
                );
                if (matched) {
                  setIncomingItemNumber(String(matched.itemNumber));
                  setIncomingPrice(String(matched.price));
                } else {
                  setIncomingItemNumber("");
                }
              }}
            />
            <datalist id={incomingDatalistId}>
              {canteen.products.map((item) => (
                <option key={item.itemNumber} value={item.name} />
              ))}
            </datalist>
          </label>
          <label className="form-field">الكمية الواردة<input type="number" min="0.001" step="any" required value={incomingQuantity} onChange={(event) => setIncomingQuantity(event.target.value)} /></label>
          <label className="form-field">سعر الصنف (ج.م)<input type="number" min="0" step="0.01" required value={incomingPrice} onChange={(event) => setIncomingPrice(event.target.value)} /></label>
          <label className="form-field">التاريخ<input type="date" required value={incomingDate} onChange={(event) => setIncomingDate(event.target.value)} /></label>
          <button className="primary-button" disabled={saving}>{saving ? "جارٍ التسجيل..." : "حفظ الوارد"}</button>
        </form>
      )}

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
          {editingProductNumber === null ? (
            <label className="form-field">
              الكمية الافتتاحية
              <input
                type="number"
                min="0"
                step="any"
                value={productQuantity}
                placeholder="0"
                onChange={(event) => setProductQuantity(event.target.value)}
              />
            </label>
          ) : (
            <label className="form-field">
              الرصيد الحالي
              <input
                type="number"
                min="0"
                step="any"
                required
                value={productBalance}
                onChange={(event) => setProductBalance(event.target.value)}
              />
            </label>
          )}
          <p className="access-note">
            {editingProductNumber === null
              ? "الكمية تُسجَّل كوارد افتتاحي للصنف. المنصرف يُسجَّل من حركات البيع."
              : "تعديل الرصيد يُسجَّل كحركة تسوية في سجل الحركات للحفاظ على التتبع."}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              onClick={resetForm}
              disabled={saving}
            >
              إلغاء
            </button>
            <button className="primary-button" disabled={saving}>
              {saving
                ? "جارٍ الحفظ..."
                : editingProductNumber === null
                  ? "حفظ الصنف"
                  : "حفظ التعديل"}
            </button>
          </div>
        </form>
      )}

      <div className="inventory-summary">
        <div className="inventory-summary-card">
          <span>أصناف الكانتين</span>
          <strong>{canteen.products.length}</strong>
        </div>
        <div className="inventory-summary-card">
          <span>أصناف بلا رصيد</span>
          <strong>{totals.outOfStock}</strong>
        </div>
        <div className="inventory-summary-card">
          <span>إجمالي الرصيد</span>
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
                  <td>
                    <span>{product.name}</span>
                  </td>
                  <td>{numberFormatter.format(product.price)} ج.م</td>
                  <td>{numberFormatter.format(balance)}</td>
                  <td>{numberFormatter.format(balance * product.price)} ج.م</td>
                  <td>{product.needsReview ? "يحتاج مراجعة" : "سليم"}</td>
                  <td>
                    <button
                      className="table-action"
                      disabled={!canManage || saving}
                      onClick={() => startEdit(product)}
                      type="button"
                    >
                      تعديل
                    </button>
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
    </section>
  );
}
