export type CustodyEventKind = "return" | "transfer" | "void";

export type CustodyEmployee = {
  employeeNumber: number;
  employeeName: string;
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
  itemName: string;
  unit: string;
  notes: string;
  quantity: number | null;
  issueDate: string;
  currentEmployeeNumber: number | null;
  currentEmployeeName: string | null;
  returnedQuantity: number;
  outstandingQuantity: number;
  events: CustodyEvent[];
};

export type CustodyRecord = {
  custodyNumber: number;
  custodyDate: string;
  recipientEmployeeNumber: number | null;
  recipientName: string;
  voided: boolean;
  voidReason: string;
  details: CustodyDetail[];
};

/**
 * عهدة الموظف إدارية بالكامل: لا تحتوي أصناف مخزن ولا أرصدة مخزنية.
 * رصيد المخزون يُدار من شاشة مخزن الأغذية وحدها.
 */
export type CustodyBundle = {
  employees: CustodyEmployee[];
  records: CustodyRecord[];
  linkedEmployeeNumber: number | null;
};
