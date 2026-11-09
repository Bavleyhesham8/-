export type CanteenSalesItem = {
  id: number;
  name: string;
  price: number;
  addToResidentAccount: boolean;
  canteenItemNumber: number | null;
};

export type InvoiceCategory = {
  id: number;
  name: string;
};

export type ResidentInvoiceLine = {
  id: number;
  itemName: string;
  unitPrice: number;
  quantity: number;
  total: number;
  categoryId: number | null;
  alternateCategory: string;
  stockMovementId: number | null;
};

export type InvoicePayment = {
  id: number;
  kind: "payment" | "refund";
  amount: number;
  paymentDate: string;
};

export type ResidentInvoice = {
  invoiceNumber: number;
  invoiceDate: string;
  saleType: "resident" | "cash";
  residentId: string | null;
  residentName: string;
  lines: ResidentInvoiceLine[];
  payments: InvoicePayment[];
  total: number;
  paid: number;
  balance: number;
  voided: boolean;
  voidReason: string;
};

export type CanteenSalesBundle = {
  items: CanteenSalesItem[];
  categories: InvoiceCategory[];
  invoices: ResidentInvoice[];
};
