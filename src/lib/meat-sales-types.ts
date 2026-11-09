export type RefrigeratorCatalogItem = {
  id: number;
  itemCategory: string;
  price: number;
  quantity: number;
};

export type RefrigeratorProduct = {
  id: number;
  itemNumber: number;
  catalogId: number;
  itemCategory: string;
  voucherNumber: number | null;
  beneficiary: string | null;
};

export type RefrigeratorMovement = {
  id: number;
  itemNumber: number;
  itemCategory: string;
  direction: "in" | "out";
  quantity: number | null;
  price: number;
  total: number;
  outgoing: number | null;
  receivedDate: string | null;
  outgoingDate: string | null;
  issuePermitNumber: number | null;
  recipient: string | null;
  voided: boolean;
  voidReason: string;
};

export type MeatSaleLine = {
  id: number;
  itemCategory: string;
  price: number;
  quantity: number;
  total: number;
  refrigeratorItemNumber: number;
  movementId: number | null;
};

export type MeatSalePayment = {
  id: number;
  kind: "payment" | "refund";
  amount: number;
  paymentDate: string;
};

export type MeatSaleInvoice = {
  invoiceNumber: number;
  saleDate: string;
  issuePermitNumber: number | null;
  beneficiary: string;
  lines: MeatSaleLine[];
  total: number;
  paid: number;
  voided: boolean;
  voidReason: string;
  payments: MeatSalePayment[];
};

export type MeatSalesBundle = {
  catalog: RefrigeratorCatalogItem[];
  products: RefrigeratorProduct[];
  movements: RefrigeratorMovement[];
  invoices: MeatSaleInvoice[];
};
