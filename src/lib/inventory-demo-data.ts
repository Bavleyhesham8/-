import type { InventoryBundle } from "@/lib/inventory-types";

let demoIdCounter = 0;

export function createDemoId() {
  demoIdCounter += 1;
  return `demo-${Date.now()}-${demoIdCounter}`;
}

export const demoInventory: InventoryBundle = {
  categories: [
    { id: "demo-category-warehouse", name: "المخازن", active: true },
    { id: "demo-category-canteen", name: "الكانتين", active: true },
    { id: "demo-category-fridge", name: "الثلاجة", active: true },
  ],
  items: [
    {
      id: "demo-item-rice",
      categoryId: "demo-category-warehouse",
      name: "أرز",
      unit: "كجم",
      unitPrice: 40,
      active: true,
    },
    {
      id: "demo-item-detergent",
      categoryId: "demo-category-warehouse",
      name: "منظف",
      unit: "عبوة",
      unitPrice: 55,
      active: true,
    },
    {
      id: "demo-item-water",
      categoryId: "demo-category-canteen",
      name: "مياه معبأة",
      unit: "كرتونة",
      unitPrice: 65,
      active: true,
    },
    {
      id: "demo-item-milk",
      categoryId: "demo-category-fridge",
      name: "حليب",
      unit: "عبوة",
      unitPrice: 32,
      active: true,
    },
  ],
  movements: [
    {
      id: "demo-movement-rice-in",
      itemId: "demo-item-rice",
      itemName: "أرز",
      categoryId: "demo-category-warehouse",
      direction: "in",
      quantity: 50,
      unitPrice: 40,
      movementDate: "2026-11-01",
      note: "رصيد افتتاحي تجريبي",
      voided: false,
    },
    {
      id: "demo-movement-rice-out",
      itemId: "demo-item-rice",
      itemName: "أرز",
      categoryId: "demo-category-warehouse",
      direction: "out",
      quantity: 8,
      unitPrice: 40,
      movementDate: "2026-11-05",
      note: "صرف تجريبي",
      voided: false,
    },
    {
      id: "demo-movement-detergent-in",
      itemId: "demo-item-detergent",
      itemName: "منظف",
      categoryId: "demo-category-warehouse",
      direction: "in",
      quantity: 20,
      unitPrice: 55,
      movementDate: "2026-11-03",
      note: "رصيد افتتاحي تجريبي",
      voided: false,
    },
    {
      id: "demo-movement-water-in",
      itemId: "demo-item-water",
      itemName: "مياه معبأة",
      categoryId: "demo-category-canteen",
      direction: "in",
      quantity: 30,
      unitPrice: 65,
      movementDate: "2026-11-04",
      note: "رصيد افتتاحي تجريبي",
      voided: false,
    },
    {
      id: "demo-movement-milk-in",
      itemId: "demo-item-milk",
      itemName: "حليب",
      categoryId: "demo-category-fridge",
      direction: "in",
      quantity: 24,
      unitPrice: 32,
      movementDate: "2026-11-05",
      note: "رصيد افتتاحي تجريبي",
      voided: false,
    },
  ],
};
