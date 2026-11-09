export type CanteenReportFilters = {
  startDate: string;
  endDate: string;
  itemNumber: number | null;
  direction: "all" | "in" | "out";
  recipient: string;
  includeVoided: boolean;
};

export type CanteenReportProduct = {
  itemNumber: number;
  name: string;
  price: number;
};

export type CanteenReportBalance = {
  itemNumber: number;
  itemName: string;
  price: number;
  balance: number;
  value: number;
};

export type CanteenReportMovement = {
  id: number;
  itemNumber: number;
  itemName: string;
  date: string;
  direction: "in" | "out";
  quantity: number;
  balanceAfter: number;
  recipient: string;
  voucherId: number | null;
  voided: boolean;
  voidReason: string;
};

export type CanteenReportTotals = {
  incoming: number;
  outgoing: number;
  remaining: number;
  value: number;
};

export type CanteenReportData = {
  products: CanteenReportProduct[];
  balances: CanteenReportBalance[];
  movements: CanteenReportMovement[];
  totals: CanteenReportTotals;
};
