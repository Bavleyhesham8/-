"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  clockInStaffAction,
  clockOutStaffAction,
  deleteStaffAttendanceAction,
  editStaffAttendanceAction,
} from "@/app/actions/staff-attendance";
import type { UserRole } from "@/lib/demo-data";
import type { StaffAttendanceBundle } from "@/lib/staff-attendance-types";

type Props = {
  bundle: StaffAttendanceBundle;
  role: UserRole;
  persistent: boolean;
};

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(value));
}

function dateInCairo(value: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function StaffAttendancePanel({
  bundle,
  role,
  persistent,
}: Props) {
  const router = useRouter();
  const [selectedEmployee, setSelectedEmployee] = useState(
    bundle.employees[0]?.employeeNumber.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const employeeNumber =
    role === "admin" || role === "viewer"
      ? Number(
          selectedEmployee ||
            bundle.employees[0]?.employeeNumber.toString() ||
            "",
        ) || null
      : bundle.linkedEmployeeNumber;
  const openEntry =
    bundle.entries.find(
      (entry) =>
        entry.employeeNumber === employeeNumber && entry.clockOutAt === null,
    ) ?? null;
  const visibleEntries = bundle.entries.filter((entry) => {
    const entryDate = dateInCairo(entry.clockInAt);
    return (
      ((role !== "admin" && role !== "viewer") ||
        !selectedEmployee ||
        entry.employeeNumber === Number(selectedEmployee)) &&
      (!fromDate || entryDate >= fromDate) &&
      (!toDate || entryDate <= toDate) &&
      (role === "admin" || role === "viewer" ||
        entry.employeeNumber === bundle.linkedEmployeeNumber)
    );
  });
  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate);

  function durationLabel(clockInAt: string, clockOutAt: string | null) {
    if (!clockOutAt) return "مفتوح";
    const elapsedMinutes = Math.max(
      0,
      Math.floor((Date.parse(clockOutAt) - Date.parse(clockInAt)) / 60_000),
    );
    const hours = Math.floor(elapsedMinutes / 60);
    const minutes = elapsedMinutes % 60;
    return `${hours} س ${minutes} د`;
  }

  async function recordClock(isClockOut: boolean) {
    if (!employeeNumber || saving) return;
    setSaving(true);
    setMessage("");
    setMessageIsError(false);
    try {
      const input = role === "admin" ? { employeeNumber } : undefined;
      const result = isClockOut
        ? await clockOutStaffAction(input)
        : await clockInStaffAction(input);
      if (!result.ok) {
        setMessage(result.error);
        setMessageIsError(true);
        return;
      }
      setMessage(isClockOut ? "تم تسجيل الانصراف." : "تم تسجيل الحضور.");
      router.refresh();
    } catch {
      setMessage("تعذر تسجيل الحركة. أعد المحاولة بعد التحقق من الاتصال.");
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: number) {
    if (!editClockIn) {
      setMessage("أدخل وقت الحضور.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await editStaffAttendanceAction({
        id,
        clockInAt: new Date(editClockIn).toISOString(),
        clockOutAt: editClockOut ? new Date(editClockOut).toISOString() : null,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    } catch {
      setMessage("تعذر حفظ تعديل الحضور.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: number) {
    if (!window.confirm("هل تريد حذف سجل الحضور والانصراف؟")) return;
    setSaving(true);
    setMessage("");
    setMessageIsError(false);
    try {
      const result = await deleteStaffAttendanceAction(id);
      if (!result.ok) {
        setMessage(result.error);
        setMessageIsError(true);
        return;
      }
      setMessage("تم حذف سجل الحضور والانصراف.");
      router.refresh();
    } catch {
      setMessage("تعذر حذف سجل الحضور والانصراف.");
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="attendance-panel space-y-5" dir="rtl">
      {!persistent && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900" role="status">
          هذه بيانات تجريبية؛ التسجيل الفعلي يحتاج تشغيل وضع قاعدة البيانات الدائمة.
        </div>
      )}

      {!employeeNumber && role !== "admin" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          لم يُربط حسابك بملف موظف بعد. اطلب من المسؤول ربط الحساب من شاشة
          الموظفين.
        </div>
      )}
      {!employeeNumber && role === "admin" && bundle.employees.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-600">
          أضف سجلات الموظفين أولًا لتسجيل الحضور والانصراف.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">الموظف المحدد</p>
            {role === "admin" || role === "viewer" ? (
              <select
                aria-label="اختيار الموظف"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 sm:max-w-md"
                value={selectedEmployee || bundle.employees[0]?.employeeNumber.toString() || ""}
                onChange={(event) => setSelectedEmployee(event.target.value)}
                disabled={!persistent || saving}
              >
                <option value="">اختر الموظف</option>
                {bundle.employees.map((employee) => (
                  <option key={employee.employeeNumber} value={employee.employeeNumber}>
                    {employee.employeeName}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-lg font-extrabold text-slate-900">
                {bundle.employees.find((employee) => employee.employeeNumber === employeeNumber)?.employeeName ?? bundle.entries.find((entry) => entry.employeeNumber === employeeNumber)?.employeeName ?? "ملف الموظف المرتبط بحسابك"}
              </p>
            )}
          </div>
          <div className={`rounded-xl px-4 py-3 ${openEntry ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-700"}`} aria-live="polite">
            <p className="text-sm font-bold">{openEntry ? "حضور مفتوح الآن" : "لا يوجد حضور مفتوح"}</p>
            {openEntry && <p className="mt-1 text-xs">بدأ {formatTimestamp(openEntry.clockInAt)}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="min-h-14 rounded-xl bg-teal-700 px-5 py-3 text-base font-bold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
            disabled={!persistent || !employeeNumber || saving || role === "viewer" || Boolean(openEntry)}
            onClick={() => void recordClock(false)}
          >
            {saving ? "جارٍ التسجيل..." : "تسجيل الحضور"}
          </button>
          <button
            type="button"
            className="min-h-14 rounded-xl bg-amber-600 px-5 py-3 text-base font-bold text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
            disabled={!persistent || !employeeNumber || saving || role === "viewer" || !openEntry}
            onClick={() => void recordClock(true)}
          >
            {saving ? "جارٍ التسجيل..." : "تسجيل الانصراف"}
          </button>
        </div>
        {message && (
          <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${messageIsError ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`} role={messageIsError ? "alert" : "status"}>
            {message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold text-slate-700">
          من تاريخ
          <input className="rounded-lg border border-slate-300 px-3 py-2.5" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold text-slate-700">
          إلى تاريخ
          <input className="rounded-lg border border-slate-300 px-3 py-2.5" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        {(fromDate || toDate) && (
          <button className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => { setFromDate(""); setToDate(""); }}>
            مسح الفترة
          </button>
        )}
      </div>

      {invalidDateRange && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="alert">تاريخ البداية لازم يكون قبل تاريخ النهاية.</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
          <h3 className="font-bold text-slate-900">سجل الحضور والانصراف</h3>
          <p className="mt-1 text-sm text-slate-500">الأحدث يظهر أولًا، ويمكن للمسؤول تعديل الأوقات عند الحاجة.</p>
        </div>
        <div className="table-scroll">
          <table className="min-w-[760px] w-full text-right text-sm">
            <thead>
              <tr>
                {role === "admin" && <th className="px-4 py-3">الموظف</th>}
                <th className="px-4 py-3">وقت الحضور</th>
                <th className="px-4 py-3">وقت الانصراف</th>
                <th className="px-4 py-3">المدة</th>
                <th className="px-4 py-3">الحالة</th>
                {role === "admin" && <th className="px-4 py-3">الإجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {!invalidDateRange && visibleEntries.map((entry) => (
                  <tr key={entry.id}>
                    {role === "admin" && <td>{entry.employeeName}</td>}
                    <td className="px-4 py-3">{editingId === entry.id ? <input className="rounded border border-slate-300 p-2" aria-label="وقت الحضور" type="datetime-local" value={editClockIn} onChange={(event) => setEditClockIn(event.target.value)} /> : formatTimestamp(entry.clockInAt)}</td>
                    <td className="px-4 py-3">{editingId === entry.id ? <input className="rounded border border-slate-300 p-2" aria-label="وقت الانصراف" type="datetime-local" value={editClockOut} onChange={(event) => setEditClockOut(event.target.value)} /> : formatTimestamp(entry.clockOutAt)}</td>
                    <td className="px-4 py-3">{durationLabel(entry.clockInAt, entry.clockOutAt)}</td>
                    <td className="px-4 py-3">{entry.clockOutAt ? "مكتمل" : "حضور مفتوح"}</td>
                    {role === "admin" && (
                      <td className="px-4 py-3">
                        {editingId === entry.id ? (
                          <>
                            <button className="table-action" type="button" disabled={saving} onClick={() => void saveEdit(entry.id)}>حفظ</button>
                            <button className="table-action" type="button" disabled={saving} onClick={() => setEditingId(null)}>إلغاء</button>
                          </>
                        ) : (
                          <>
                            <button className="table-action" type="button" disabled={saving} onClick={() => { setEditingId(entry.id); setEditClockIn(toLocalInput(entry.clockInAt)); setEditClockOut(toLocalInput(entry.clockOutAt)); }}>تعديل</button>
                            <button className="table-action danger" type="button" disabled={saving} onClick={() => void deleteEntry(entry.id)}>حذف</button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              {visibleEntries.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={role === "admin" ? 6 : 4}>
                    لا توجد سجلات حضور وانصراف بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
