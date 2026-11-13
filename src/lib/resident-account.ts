import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";
import { formatDate } from "@/lib/date-format";
import type { Resident } from "@/lib/demo-data";
import type {
  ResidentFinanceBundle,
  ResidentFinanceRecord,
} from "@/lib/resident-finance-types";
import { findRecordForResident } from "@/lib/resident-matching";
import type { TreatmentBundle } from "@/lib/treatment-types";

export type ResidentAccountEntryKind =
  | "deposit"
  | "canteen-purchase"
  | "canteen-payment"
  | "treatment";

export type ResidentAccountEntry = {
  id: string;
  date: string;
  kind: ResidentAccountEntryKind;
  typeLabel: string;
  description: string;
  debit: number;
  credit: number;
  status: string;
};

export type ResidentAccount = {
  resident: Resident;
  financeRecord: ResidentFinanceRecord | null;
  financeAmbiguous: boolean;
  deposits: number;
  canteenPurchases: number;
  canteenPayments: number;
  treatment: number;
  balance: number;
  entries: ResidentAccountEntry[];
};

export type ResidentAccountSources = {
  residentFinance?: ResidentFinanceBundle;
  sales?: CanteenSalesBundle;
  treatment?: TreatmentBundle;
};

export function buildResidentAccount(
  resident: Resident,
  { residentFinance, sales, treatment }: ResidentAccountSources,
): ResidentAccount {
  const financeRecord = residentFinance
    ? (findRecordForResident(resident, residentFinance.records) ?? null)
    : null;

  const entries: ResidentAccountEntry[] = [];

  for (const entry of financeRecord?.entries ?? []) {
    if (entry.voided || !entry.amount) continue;
    entries.push({
      id: `deposit-${entry.id}`,
      date: entry.transactionDate ?? "",
      kind: "deposit",
      typeLabel: "إيداع في الحساب",
      description: entry.returnDate
        ? `إيداع نقدي (تاريخ الاستحقاق: ${formatDate(entry.returnDate)})`
        : "إيداع نقدي في حساب النزيل",
      debit: 0,
      credit: entry.amount,
      status: "مقبوض",
    });
  }

  const canteenInvoices = (sales?.invoices ?? []).filter(
    (invoice) => !invoice.voided && invoice.residentId === resident.id,
  );
  for (const invoice of canteenInvoices) {
    for (const line of invoice.lines) {
      entries.push({
        id: `canteen-${invoice.invoiceNumber}-${line.id}`,
        date: invoice.invoiceDate,
        kind: "canteen-purchase",
        typeLabel: "مشتريات كانتين",
        description: `${line.itemName} (كمية: ${line.quantity} × ${line.unitPrice} ج.م)`,
        debit: line.total,
        credit: 0,
        status: "حركة بيع",
      });
    }
    for (const payment of invoice.payments) {
      entries.push({
        id: `canteen-payment-${invoice.invoiceNumber}-${payment.id}`,
        date: payment.paymentDate,
        kind: "canteen-payment",
        typeLabel:
          payment.kind === "refund"
            ? "استرداد من حركة بيع"
            : "سداد مشتريات كانتين",
        description: `حركة بيع رقم ${invoice.invoiceNumber}`,
        debit: 0,
        credit: payment.kind === "refund" ? -payment.amount : payment.amount,
        status: payment.kind === "refund" ? "مسترد" : "مسدد",
      });
    }
  }

  const treatmentRecord = treatment
    ? findRecordForResident(resident, treatment.records)
    : undefined;
  for (const entry of treatmentRecord?.entries ?? []) {
    if (entry.voided) continue;
    entries.push({
      id: `treatment-${entry.id}`,
      date: entry.treatmentDate ?? "",
      kind: "treatment",
      typeLabel: "أدوية وعلاج",
      description: `${entry.medicationName} (كمية: ${entry.quantity} · سعر: ${entry.amount} ج.م${entry.discount > 0 ? ` · خصم: ${entry.discount} ج.م` : ""})`,
      debit: entry.total,
      credit: 0,
      status: "إذن صرف عيادة",
    });
  }

  entries.sort((left, right) => right.date.localeCompare(left.date));

  const deposits = sum(entries, "deposit", "credit");
  const canteenPurchases = sum(entries, "canteen-purchase", "debit");
  const canteenPayments = sum(entries, "canteen-payment", "credit");
  const treatmentTotal = sum(entries, "treatment", "debit");

  return {
    resident,
    financeRecord,
    financeAmbiguous: financeRecord?.matchAmbiguous ?? false,
    deposits,
    canteenPurchases,
    canteenPayments,
    treatment: treatmentTotal,
    balance: deposits + canteenPayments - canteenPurchases - treatmentTotal,
    entries,
  };
}

function sum(
  entries: ResidentAccountEntry[],
  kind: ResidentAccountEntryKind,
  side: "debit" | "credit",
) {
  return entries
    .filter((entry) => entry.kind === kind)
    .reduce((total, entry) => total + entry[side], 0);
}

export function buildResidentAccounts(
  residents: Resident[],
  sources: ResidentAccountSources,
): ResidentAccount[] {
  return residents.map((resident) => buildResidentAccount(resident, sources));
}

/**
 * سجلات الإيداع القديمة التي لم تُطابق أي نزيل في السجل الحديث.
 * تُعرض للمراجعة بدل إسقاطها بصمت.
 */
export function findUnmatchedFinanceRecords(
  bundle: ResidentFinanceBundle | undefined,
  residents: Resident[],
): ResidentFinanceRecord[] {
  if (!bundle) return [];
  const matchedNumbers = new Set<number>();
  for (const resident of residents) {
    const record = findRecordForResident(resident, bundle.records);
    if (record) matchedNumbers.add(record.residentNumber);
  }
  return bundle.records.filter(
    (record) => !matchedNumbers.has(record.residentNumber),
  );
}
