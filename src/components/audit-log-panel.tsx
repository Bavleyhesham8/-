"use client";

import { useMemo, useState } from "react";
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
  "gate-in": "دخول بوابة",
  "gate-out": "خروج بوابة",
};

const entityLabels: Record<string, string> = {
  residentPurchases: "مشتريات النزلاء",
  invoiceCategories: "فئات حركات البيع",
  residentInvoices: "حركات بيع الكانتين",
  residentInvoicePayments: "مدفوعات حركات بيع الكانتين",
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
  legacyResidentHeaders: "سجلات حسابات النزلاء القديمة",
  legacyResidentDetails: "حركات حسابات النزلاء القديمة",
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
  gate_visits: "زيارات البوابة",
  gate_visitors: "ملفات زوار البوابة",
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

function normalizeSearch(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("ar");
}

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

function searchableText(entry: AuditLogEntry) {
  const date = new Date(entry.occurredAt);
  const timestamp = Number.isFinite(date.getTime())
    ? `${dateFormatter.format(date)} ${timeFormatter.format(date)}`
    : entry.occurredAt;
  const metadata = entry.metadata
    ? Object.entries(entry.metadata)
        .map(([key, value]) => `${key} ${value}`)
        .join(" ")
    : "";

  return normalizeSearch(
    [
      entry.actorName ?? "حساب غير متاح",
      entry.action,
      actionLabels[entry.action] ?? "",
      entry.entity,
      entityLabels[entry.entity] ?? formatEntity(entry.entity),
      entry.entityId ?? "",
      metadata,
      timestamp,
      entry.occurredAt,
    ].join(" "),
  );
}

export default function AuditLogPanel({ entries, onRefresh }: Props) {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");

  const actionOptions = useMemo(
    () =>
      Array.from(new Set(entries.map((entry) => entry.action))).sort((a, b) =>
        (actionLabels[a] ?? a).localeCompare(actionLabels[b] ?? b, "ar"),
      ),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    const query = normalizeSearch(search.trim());
    return entries.filter((entry) => {
      if (action !== "all" && entry.action !== action) return false;
      if (!query) return true;
      return searchableText(entry).includes(query);
    });
  }, [entries, search, action]);

  return (
    <section className="audit-log-panel" dir="rtl">
      <div className="audit-log-heading">
        <div>
          <h3>سجل التدقيق</h3>
          <p>
            يعرض آخر 200 عملية مع المنفذ ونوع السجل، دون حفظ قيم بياناته
            الحساسة. استخدم البحث لمعرفة من نفّذ أي عملية.
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
          {new Intl.NumberFormat("ar-EG").format(filteredEntries.length)} من{" "}
          {new Intl.NumberFormat("ar-EG").format(entries.length)} سجل معروض
        </span>
      </div>

      <div className="audit-log-filters">
        <label className="form-field">
          بحث باسم المستخدم أو نوع العملية أو السجل
          <input
            type="search"
            value={search}
            maxLength={200}
            placeholder="مثال: أحمد، إضافة، فواتير بيع اللحوم..."
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="form-field">
          العملية
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="all">كل العمليات</option>
            {actionOptions.map((option) => (
              <option key={option} value={option}>
                {actionLabels[option] ?? option}
              </option>
            ))}
          </select>
        </label>
        {(search || action !== "all") && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSearch("");
              setAction("all");
            }}
          >
            مسح البحث
          </button>
        )}
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
            {filteredEntries.map((entry) => (
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
            {filteredEntries.length === 0 && (
              <tr>
                <td className="audit-log-empty" colSpan={5}>
                  {entries.length === 0
                    ? "لا توجد عمليات مسجلة حتى الآن."
                    : "لا توجد نتائج مطابقة للبحث أو للعملية المحددة."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
