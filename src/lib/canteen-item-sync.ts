import type { CanteenProduct } from "@/lib/canteen-types";
import type { CanteenSalesItem } from "@/lib/canteen-sales-types";

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase("ar");
}

/**
 * يعكس بيانات صنف البيع على صنف المخزون المرتبط به.
 * تُستخدم بعد حفظ صنف البيع حتى تظهر نفس القيم فورًا في صفحة المخزون.
 */
export function syncProductsAfterSalesItem(
  products: CanteenProduct[],
  item: CanteenSalesItem,
): CanteenProduct[] {
  if (item.canteenItemNumber === null) return products;
  const nextBarcode = item.barcode;
  let changed = false;
  const next = products.map((product) => {
    if (product.itemNumber !== item.canteenItemNumber) return product;
    const barcodeChanged =
      nextBarcode !== undefined && (product.barcode ?? "") !== nextBarcode;
    if (
      product.name === item.name &&
      product.price === item.price &&
      !barcodeChanged
    ) {
      return product;
    }
    changed = true;
    return {
      ...product,
      name: item.name,
      price: item.price,
      ...(nextBarcode !== undefined ? { barcode: nextBarcode } : {}),
    };
  });
  return changed ? next : products;
}

/**
 * يعكس بيانات صنف المخزون على أصناف البيع المرتبطة به أو التي تحمل اسمه.
 * عند وجود صفوف قديمة مكررة نربط صفًا واحدًا فقط، لأن صنف المخزون الواحد
 * له صنف بيع واحد، لكن نحدّث اسم وسعر كل الصفوف المكررة.
 */
export function syncSalesItemsAfterProduct(
  items: CanteenSalesItem[],
  product: CanteenProduct,
  previousName?: string,
): CanteenSalesItem[] {
  const productName = normalizedName(previousName ?? product.name);
  const hasLinked = items.some(
    (item) => item.canteenItemNumber === product.itemNumber,
  );
  const candidateId = hasLinked
    ? null
    : (items
        .filter(
          (item) =>
            item.canteenItemNumber === null &&
            normalizedName(item.name) === productName,
        )
        .sort((left, right) => left.id - right.id)[0]?.id ?? null);

  const nextBarcode = product.barcode;
  let changed = false;
  const next = items.map((item) => {
    const linked = item.canteenItemNumber === product.itemNumber;
    const sameUnlinkedName =
      item.canteenItemNumber === null &&
      normalizedName(item.name) === productName;
    if (!linked && !sameUnlinkedName) return item;

    const nextItemNumber = linked
      ? product.itemNumber
      : item.id === candidateId
        ? product.itemNumber
        : null;
    const barcodeChanged =
      nextBarcode !== undefined && (item.barcode ?? "") !== nextBarcode;
    if (
      item.name === product.name &&
      item.price === product.price &&
      !barcodeChanged &&
      item.canteenItemNumber === nextItemNumber
    ) {
      return item;
    }
    changed = true;
    return {
      ...item,
      canteenItemNumber: nextItemNumber,
      name: product.name,
      price: product.price,
      ...(nextBarcode !== undefined ? { barcode: nextBarcode } : {}),
    };
  });
  return changed ? next : items;
}

/**
 * يحدّث الصفوف المكررة التي كانت تحمل الاسم السابق بعد تعديل صنف البيع،
 * حتى لا يبقى في الشاشة صف بنفس الاسم بسعر قديم.
 */
export function syncSalesItemsAfterSalesItem(
  items: CanteenSalesItem[],
  item: CanteenSalesItem,
  previousName: string,
): CanteenSalesItem[] {
  const oldName = normalizedName(previousName);
  const newName = normalizedName(item.name);
  let changed = false;
  const next = items.map((entry) => {
    if (entry.id === item.id) {
      if (
        entry.name === item.name &&
        entry.price === item.price &&
        (entry.barcode ?? "") === (item.barcode ?? "") &&
        entry.canteenItemNumber === item.canteenItemNumber &&
        entry.categoryId === item.categoryId &&
        entry.categoryName === item.categoryName &&
        entry.addToResidentAccount === item.addToResidentAccount
      ) {
        return entry;
      }
      changed = true;
      return item;
    }
    const matches =
      normalizedName(entry.name) === oldName ||
      normalizedName(entry.name) === newName;
    if (!matches) return entry;
    const barcodeChanged =
      item.barcode !== undefined && (entry.barcode ?? "") !== item.barcode;
    if (
      entry.name === item.name &&
      entry.price === item.price &&
      !barcodeChanged
    ) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      name: item.name,
      price: item.price,
      ...(item.barcode !== undefined ? { barcode: item.barcode } : {}),
    };
  });
  return changed ? next : items;
}
