import assert from "node:assert/strict";
import test from "node:test";
import type { CanteenProduct } from "@/lib/canteen-types";
import type { CanteenSalesItem } from "@/lib/canteen-sales-types";
import {
  syncProductsAfterSalesItem,
  syncSalesItemsAfterProduct,
  syncSalesItemsAfterSalesItem,
} from "@/lib/canteen-item-sync";

const products: CanteenProduct[] = [
  { id: 1, itemNumber: 1, name: "سجائر كاريلا", price: 60 },
  { id: 2, itemNumber: 2, name: "شاى", price: 12 },
];

function item(overrides: Partial<CanteenSalesItem> = {}): CanteenSalesItem {
  return {
    id: 8,
    name: "سجائر كاريلا",
    price: 65,
    addToResidentAccount: false,
    canteenItemNumber: 1,
    categoryId: 3,
    categoryName: "سجائر",
    ...overrides,
  };
}

test("يعكس سعر واسم صنف البيع على صنف المخزون المرتبط فقط", () => {
  const next = syncProductsAfterSalesItem(products, item());
  assert.deepEqual(next[0], {
    id: 1,
    itemNumber: 1,
    name: "سجائر كاريلا",
    price: 65,
  });
  assert.deepEqual(next[1], products[1]);
  assert.notEqual(next, products);
});

test("لا يغيّر صنف البيع غير المرتبط بأي مخزون", () => {
  const unlinked = item({ canteenItemNumber: null, price: 99 });
  assert.equal(syncProductsAfterSalesItem(products, unlinked), products);
});

test("لا يعيد مصفوفة جديدة عندما تكون القيم متطابقة", () => {
  const same = item({ price: 60 });
  assert.equal(syncProductsAfterSalesItem(products, same), products);
});

test("يعكس اسم وسعر صنف المخزون على صنف البيع المرتبط", () => {
  const next = syncSalesItemsAfterProduct([item()], {
    id: 1,
    itemNumber: 1,
    name: "سجائر كاريلا",
    price: 70,
  });
  assert.equal(next[0].price, 70);
  assert.equal(next[0].name, "سجائر كاريلا");
  assert.equal(next[0].canteenItemNumber, 1);
});

test("يربط صف بيع واحد فقط عند وجود صفوف مكررة بالاسم نفسه", () => {
  const duplicate = item({ id: 9, canteenItemNumber: null });
  const next = syncSalesItemsAfterProduct(
    [item({ canteenItemNumber: null }), duplicate],
    products[0],
  );
  assert.equal(next[0].canteenItemNumber, 1);
  assert.equal(next[1].canteenItemNumber, null);
  assert.equal(next[0].price, 60);
  assert.equal(next[1].price, 60);
});

test("لا يغيّر الأصناف الأخرى عند مزامنة صنف مخزون", () => {
  const other = item({
    id: 10,
    name: "شاى",
    price: 12,
    canteenItemNumber: 2,
    categoryName: "مشروبات",
  });
  const next = syncSalesItemsAfterProduct([item(), other], products[0]);
  assert.equal(next[1], other);
});

test("يحدّث الصفوف المكررة بالاسم القديم بعد تعديل صنف البيع", () => {
  const edited = item({ id: 8, price: 70, name: "سجائر كاريلا" });
  const duplicate = item({ id: 9, canteenItemNumber: null, price: 65 });
  const other = item({ id: 10, name: "شاى", price: 12 });
  const next = syncSalesItemsAfterSalesItem(
    [edited, duplicate, other],
    edited,
    "سجائر كاريلا",
  );
  assert.equal(next[1].price, 70);
  assert.equal(next[1].canteenItemNumber, null);
  assert.equal(next[2], other);
});

test("لا يعيد مصفوفة جديدة عندما تكون القيم متطابقة بعد تعديل صنف البيع", () => {
  const edited = item({ id: 8, price: 65 });
  const duplicate = item({ id: 9, canteenItemNumber: null, price: 65 });
  const current = [edited, duplicate];
  const next = syncSalesItemsAfterSalesItem(
    current,
    edited,
    "سجائر كاريلا",
  );
  assert.equal(next, current);
});
