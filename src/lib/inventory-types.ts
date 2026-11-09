export type InventoryDirection = "in" | "out";

export type InventoryCategory = {
  id: string;
  name: string;
  active: boolean;
};

export type InventoryItem = {
  id: string;
  categoryId: string;
  name: string;
  unit: string;
  unitPrice: number;
  active: boolean;
};

export type InventoryMovement = {
  id: string;
  itemId: string;
  itemName: string;
  categoryId: string;
  direction: InventoryDirection;
  quantity: number;
  unitPrice: number;
  movementDate: string;
  note: string;
  voided: boolean;
};

export type InventoryBundle = {
  categories: InventoryCategory[];
  items: InventoryItem[];
  movements: InventoryMovement[];
};
