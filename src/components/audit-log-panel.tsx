"use client";

import type { AuditLogEntry } from "@/lib/audit-log-types";

type Props = {
  entries: AuditLogEntry[];
  onRefresh: () => void;
};

const actionLabels: Record<string, string> = {
  create: "إضافة",
  update: "تعديل",
  delete: "حذف",
  "permission-change": "تغيير صلاحية",
  "clock-in": "حضور",
  "clock-out": "انصراف",
};

const entityLabels: Record<string, string> = {
  residentPurchases: "مشتريات النزلاء",
  invoiceCategories: "فئات الفواتير",
  residentInvoices: "فواتير الكانتين",
  residentInvoicePayments: "مدفوعات فواتير الكانتين",
  userCanteenAccess: "صلاحيات الكانتين",
  canteenProducts: "أصناف الكانتين",
  canteenStockLedger: "حركات مخزون الكانتين",
  warehouseHeaders: "أصناف المخزن",
  warehouseDetails: "حركات المخزن",
  custodyHeaders: "سجلات العهدة",
  custodyDetails: "حركات العهدة",
  inventoryCategories: "فئات مخزن الأغذية",
  userInventoryCategories: "صلاحيات مخزن الأغذية",
  inventoryItems: "أصناف مخزن الأغذية",
  inventoryMovements: "حركات مخزن الأغذية",
  legacyResidentHeaders: "سجلات أمانات النزلاء",
  legacyResidentDetails: "حركات أمانات النزلاء",
  refrigeratorItemCatalog: "دليل أصناف الثلاجة",
  refrigeratorStockLedger: "حركات الثلاجة",
  meatSalesInvoices: "فواتير بيع اللحوم",
  residents: "ملفات النزلاء",
  residentStays: "الإقامات",
  user: "حسابات المستخدمين",
  staffProfiles: "ملفات الموظفين",
  staffEmployees: "الموظفون",
  staffLeaveEntries: "إجازات الموظفين",
  staffAccountLinks: "ربط حسابات الموظفين",
  staff_attendance: "الحضور والانصراف",
  churchLookup: "الكنائس",
  confessorLookup: "آباء الاعتراف",
  governorateLookup: "المحافظات",
  dayLookup: "الأيام",
  alternateInvoiceCategories: "فئات الفواتير البديلة",
};

const dateFormatter = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  dateStyle: "medium",
  timeZone: "Africa/Cairo",
});
const timeFormatter = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Cairo",
});

function formatEntity(value: string) {
  return (
    entityLabels[value] ??
    value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ")
  );
}

function shortenId(value: string | null) {
  if (!value) return "—";
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function Timestamp({ value }: { value: string }) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return <span dir="ltr">{value}</span>;

  return (
    <time className="audit-log-timestamp" dateTime={value}>
      <span>{dateFormatter.format(date)}</span>
      <span>{timeFormatter.format(date)}</span>
    </time>
  );
}

export default function AuditLogPanel({ entries, onRefresh }: Props) {
  return (
    <section className="audit-log-panel" dir="rtl">
      <div className="audit-log-heading">
        <div>
          <h3>سجل التدقيق</h3>
          <p>
            يعرض آخر 200 عملية مع المنفذ ونوع السجل، دون حفظ قيم بياناته الحساسة.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={onRefresh}
        >
          تحديث السجل
        </button>
        <span className="audit-log-count" aria-live="polite">
          {new Intl.NumberFormat("ar-EG").format(entries.length)} سجل معروض
        </span>
      </div>
      <div className="audit-log-table-wrap">
        <table className="audit-log-table">
          <thead>
            <tr>
              <th scope="col">التاريخ والوقت</th>
              <th scope="col">المستخدم</th>
              <th scope="col">العملية</th>
              <th scope="col">نوع السجل</th>
              <th scope="col">رقم السجل</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td><Timestamp value={entry.occurredAt} /></td>
                <td className="audit-log-actor">{entry.actorName ?? "حساب غير متاح"}</td>
                <td>
                  <span className={`audit-log-action audit-log-action-${entry.action}`}>
                    {actionLabels[entry.action] ?? entry.action}
                  </span>
                </td>
                <td>{formatEntity(entry.entity)}</td>
                <td>
                  {entry.entityId ? (
                    <code className="audit-log-id" dir="ltr" title={entry.entityId}>
                      {shortenId(entry.entityId)}
                    </code>
                  ) : (
                    <span className="audit-log-empty-id">—</span>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td className="audit-log-empty" colSpan={5}>
                  لا توجد عمليات مسجلة حتى الآن.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
