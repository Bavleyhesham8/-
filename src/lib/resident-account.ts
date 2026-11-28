import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";
import type { ResidentCustodyCharge } from "@/lib/center-custody-types";
import { formatDate } from "@/lib/date-format";
import type { Resident } from "@/lib/demo-data";
import type {
  ResidentFinanceBundle,
  ResidentFinanceRecord,
} from "@/lib/resident-finance-types";
import { findRecordForResident, residentNameScore } from "@/lib/resident-matching";
import type { TreatmentBundle } from "@/lib/treatment-types";

export type ResidentAccountEntryKind =
  | "deposit"
  | "canteen-purchase"
  | "canteen-payment"
  | "treatment"
  | "center-custody";

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
  custodyCharges: number;
  balance: number;
  entries: ResidentAccountEntry[];
};

export type ResidentAccountSources = {
  residentFinance?: ResidentFinanceBundle;
  sales?: CanteenSalesBundle;
  treatment?: TreatmentBundle;
  custodyCharges?: ResidentCustodyCharge[];
};

export function buildResidentAccount(
  resident: Resident,
  { residentFinance, sales, treatment, custodyCharges }: ResidentAccountSources,
): ResidentAccount {
  const financeRecord = residentFinance
    ? (findRecordForResident(resident, residentFinance.records) ?? null)
    : null;

  const entries: ResidentAccountEntry[] = [];

  for (const entry of financeRecord?.entries ?? []) {
    if (entry.voided || !entry.amount || entry.depositKind === "stay") continue;
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

  const matchingTreatmentRecords = (treatment?.records ?? []).filter((record) => {
    if (record.residentId && record.residentId === resident.id) return true;
    const residentNumbers = [resident.residentNumber, resident.fileNumber]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    if (residentNumbers.some((num) => String(record.residentNumber) === num)) return true;
    const score = residentNameScore(record.residentName, resident.name);
    return score >= 0.7;
  });

  const seenTreatmentIds = new Set<number>();
  for (const record of matchingTreatmentRecords) {
    for (const entry of record.entries ?? []) {
      if (entry.voided || seenTreatmentIds.has(entry.id)) continue;
      seenTreatmentIds.add(entry.id);
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
  }

  for (const charge of custodyCharges ?? []) {
    if (charge.residentId !== resident.id || !charge.amount) continue;
    entries.push({
      id: `center-custody-${charge.id}`,
      date: charge.transactionDate,
      kind: "center-custody",
      typeLabel: "مصاريف النزلاء",
      description: charge.description || "مصاريف نزيل من عهدة المركز",
      debit: charge.amount,
      credit: 0,
      status: "عهدة المركز",
    });
  }

  entries.sort((left, right) => left.date.localeCompare(right.date));

  const deposits = sum(entries, "deposit", "credit");
  const canteenPurchases = sum(entries, "canteen-purchase", "debit");
  const canteenPayments = sum(entries, "canteen-payment", "credit");
  const treatmentTotal = sum(entries, "treatment", "debit");
  const custodyChargeTotal = sum(entries, "center-custody", "debit");

  return {
    resident,
    financeRecord,
    financeAmbiguous: financeRecord?.matchAmbiguous ?? false,
    deposits,
    canteenPurchases,
    canteenPayments,
    treatment: treatmentTotal,
    custodyCharges: custodyChargeTotal,
    balance:
      deposits +
      canteenPayments -
      canteenPurchases -
      treatmentTotal -
      custodyChargeTotal,
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
