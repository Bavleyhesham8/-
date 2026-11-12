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

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AuditLogPanel({ entries, onRefresh }: Props) {
  return (
    <section className="space-y-4 rounded-2xl border border-white/60 bg-white/85 p-5 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">سجل التدقيق</h3>
          <p className="mt-1 text-xs text-slate-600">
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
      </div>
      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>التاريخ والوقت</th>
                <th>المستخدم</th>
                <th>العملية</th>
                <th>السجل</th>
                <th>رقم السجل</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatTimestamp(entry.occurredAt)}</td>
                  <td>{entry.actorName ?? "حساب غير متاح"}</td>
                  <td>{actionLabels[entry.action] ?? entry.action}</td>
                  <td>{entry.entity}</td>
                  <td>{entry.entityId ?? "—"}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5}>لا توجد عمليات مسجلة حتى الآن.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
