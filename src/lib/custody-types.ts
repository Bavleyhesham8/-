export type WarehouseMovementKind =
  | "receipt"
  | "custody_issue"
  | "custody_return"
  | "custody_void";

export type CustodyEventKind = "return" | "transfer" | "void";

export type CustodyEmployee = {
  employeeNumber: number;
  employeeName: string;
};

export type WarehouseItem = {
  catalogId: number;
  itemNumber: number;
  itemName: string;
  price: number | null;
  responsible: string;
  balance: number;
};

export type WarehouseMovement = {
  id: number;
  itemNumber: number;
  balance: number | null;
  incoming: number | null;
  incomingDate: string | null;
  outgoing: number | null;
  outgoingDate: string | null;
  remaining: number | null;
  deleted: boolean;
  kind: WarehouseMovementKind;
  custodyDetailId: string | null;
  needsReview: boolean;
};

export type CustodyEvent = {
  id: string;
  kind: CustodyEventKind;
  quantity: number;
  eventDate: string;
  fromEmployeeNumber: number | null;
  fromEmployeeName: string | null;
  toEmployeeNumber: number | null;
  toEmployeeName: string | null;
  reason: string;
};

export type CustodyDetail = {
  id: string;
  sourceId: number | null;
  itemNumber: number | null;
  itemName: string;
  unit: string;
  notes: string;
  quantity: number | null;
  price: number;
  total: number;
  issueDate: string;
  currentEmployeeNumber: number | null;
  currentEmployeeName: string | null;
  returnedQuantity: number;
  outstandingQuantity: number;
  events: CustodyEvent[];
};

export type CustodyRecord = {
  custodyNumber: number;
  sourceId: number | null;
  custodyDate: string;
  recipientEmployeeNumber: number | null;
  recipientName: string;
  voided: boolean;
  voidReason: string;
  details: CustodyDetail[];
};

export type CustodyBundle = {
  items: WarehouseItem[];
  warehouseMovements: WarehouseMovement[];
  employees: CustodyEmployee[];
  records: CustodyRecord[];
  linkedEmployeeNumber: number | null;
  needsReviewCount: number;
};
