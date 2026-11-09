"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getResidentStayReportAction } from "@/app/actions/resident-stay-report";
import { demoResidents } from "@/lib/demo-data";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
import {
  calculateStayDuration,
  filterResidentStayRows,
  formatAgeAtDate,
  formatStayDuration,
  summarizeResidentStayRows,
} from "@/lib/resident-stay-report-utils";
import type {
  ResidentStayReportData,
  ResidentStayReportFilters,
  ResidentStayReportRow,
} from "@/lib/resident-stay-report-types";

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialFilters(): ResidentStayReportFilters {
  const today = new Date();
  return {
    startDate: `${today.getFullYear()}-01-01`,
    endDate: localDate(today),
    villa: "",
    room: "",
    search: "",
    includeArchived: false,
  };
}

function demoRows(): ResidentStayReportRow[] {
  return demoResidents
    .filter((resident) => Boolean(resident.admissionDate))
    .map((resident) => ({
      stayId: resident.id,
      fileNumber: resident.fileNumber,
      residentName: resident.name,
      birthDate: resident.birthDate,
      admissionDate: resident.admissionDate,
      exitDate: resident.exitDate,
      villa: resident.villa,
      room: resident.room,
      archived: resident.archived,
    }));
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ar-EG").format(value);
}

function summarizeStayDays(admissionDate: string, exitDate: string) {
  const duration = calculateStayDuration(admissionDate, exitDate);
  return duration ? formatCount(duration.totalDays) : "—";
}

function reportErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    error.message === "Resident editing permission is required."
  ) {
    return "يتطلب عرض هذا التقرير صلاحية تعديل بيانات النزلاء.";
  }
  if (
    error instanceof Error &&
    error.message === "The resident stay report filters are invalid."
  ) {
    return "تواريخ أو عوامل التصفية غير صالحة.";
  }
  return "تعذر تحميل التقرير. تحقق من الاتصال ثم أعد المحاولة.";
}

export default function ResidentStayReportPanel({
  persistent,
}: {
  persistent: boolean;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState<ResidentStayReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadReport = async () => {
      try {
        const result = persistent
          ? await getResidentStayReportAction(appliedFilters)
          : {
              rows: filterResidentStayRows(demoRows(), appliedFilters),
            };
        if (active) setReport(result);
      } catch (caught) {
        if (active) {
          setReport(null);
          setError(reportErrorMessage(caught));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadReport();
    return () => {
      active = false;
    };
  }, [appliedFilters, persistent]);

  const rows = report?.rows ?? [];
  const summary = summarizeResidentStayRows(rows);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !filters.startDate ||
      !filters.endDate ||
      filters.startDate > filters.endDate
    ) {
      setError("اختر نطاقًا صحيحًا لتاريخ الدخول.");
      return;
    }
    setError("");
    setLoading(true);
    setAppliedFilters({ ...filters });
  }

  function downloadCsv() {
    if (!report) return;
    const params = new URLSearchParams({
      startDate: appliedFilters.startDate,
      endDate: appliedFilters.endDate,
      villa: appliedFilters.villa,
      room: appliedFilters.room,
      search: appliedFilters.search,
      includeArchived: String(appliedFilters.includeArchived),
    });
    const link = document.createElement("a");
    link.href = `/api/reports/resident-stays?${params}`;
    document.body.append(link);
    link.click();
    link.remove();
  }

  return (
    <section className="content-panel resident-report-panel" dir="rtl">
      <PrintBrand
        title="تقرير الإقامة والغرف"
        subtitle="أعمار النزلاء عند الدخول والخروج ومدة الإقامة الكاملة"
        meta={[
          {
            label: "الفترة",
            value: `${formatDate(appliedFilters.startDate)} — ${formatDate(appliedFilters.endDate)}`,
          },
        ]}
      />
      <div className="panel-heading">
        <div>
          <h3>تقارير الإقامة والغرف</h3>
          <p>
            بديل آمن لتقارير الفيلا والغرفة؛ يعتمد سجلات الإقامة الحالية ويعرض
            الحقول الأساسية فقط، ولا يقرأ جدول Access «nam». مصدر تقرير «سكن
            النزلاء - فيلا - غرفة» ما زال قيد التحقق.
          </p>
        </div>
        <div className="resident-report-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={downloadCsv}
            disabled={!report || loading}
          >
            تنزيل CSV
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={printCurrentView}
            disabled={!report || loading}
          >
            طباعة / حفظ PDF
          </button>
        </div>
      </div>

      <form className="resident-report-filters" onSubmit={applyFilters}>
        <label>
          من تاريخ الدخول
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                startDate: event.target.value,
              }))
            }
            required
          />
        </label>
        <label>
          إلى تاريخ الدخول
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                endDate: event.target.value,
              }))
            }
            required
          />
        </label>
        <label>
          الفيلا
          <input
            type="text"
            value={filters.villa}
            maxLength={80}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                villa: event.target.value,
              }))
            }
          />
        </label>
        <label>
          الغرفة
          <input
            type="text"
            value={filters.room}
            maxLength={80}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                room: event.target.value,
              }))
            }
          />
        </label>
        <label>
          رقم الملف أو الاسم
          <input
            type="search"
            value={filters.search}
            maxLength={120}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                search: event.target.value,
              }))
            }
          />
        </label>
        <label className="resident-report-archive-filter">
          <input
            type="checkbox"
            checked={filters.includeArchived}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                includeArchived: event.target.checked,
              }))
            }
          />
          تضمين النزلاء المؤرشفين
        </label>
        <button className="primary-button" type="submit" disabled={loading}>
          عرض التقرير
        </button>
      </form>

      {error && (
        <p className="resident-report-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className="empty-state" aria-live="polite">
          جارٍ تحميل التقرير...
        </div>
      ) : report ? (
        <>
          <div className="resident-report-summary report-summary">
            <article>
              <span>عدد سجلات الإقامة</span>
              <strong>{formatCount(summary.total)}</strong>
            </article>
            <article>
              <span>إقامات حالية</span>
              <strong>{formatCount(summary.current)}</strong>
            </article>
            <article>
              <span>إقامات منتهية</span>
              <strong>{formatCount(summary.departed)}</strong>
            </article>
            <article>
              <span>إجمالي أيام الإقامة</span>
              <strong>{formatCount(summary.totalDays)} يوم</strong>
            </article>
            <article>
              <span>متوسط مدة الإقامة</span>
              <strong>{formatCount(summary.averageDays)} يوم</strong>
            </article>
            <article>
              <span>تاريخ الدخول</span>
              <strong>
                {formatDate(appliedFilters.startDate)} —{" "}
                {formatDate(appliedFilters.endDate)}
              </strong>
            </article>
          </div>

          <div className="table-wrap resident-report-details report-detail">
            <table className="resident-table">
              <thead>
                <tr>
                  <th>رقم الملف</th>
                  <th>اسم النزيل</th>
                  <th>تاريخ الميلاد</th>
                  <th>العمر عند الدخول</th>
                  <th>حالة الإقامة</th>
                  <th>تاريخ الدخول</th>
                  <th>تاريخ الخروج</th>
                  <th>العمر عند الخروج</th>
                  <th>مدة الإقامة</th>
                  <th>أيام الإقامة</th>
                  <th>الفيلا</th>
                  <th>الغرفة</th>
                  {appliedFilters.includeArchived && <th>الأرشيف</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.stayId}>
                    <td>{row.fileNumber}</td>
                    <td>{row.residentName}</td>
                    <td>{formatDate(row.birthDate)}</td>
                    <td>
                      {row.birthDate
                        ? formatAgeAtDate(row.birthDate, row.admissionDate)
                        : "—"}
                    </td>
                    <td>{row.exitDate ? "غادر" : "مقيم حاليًا"}</td>
                    <td>{formatDate(row.admissionDate)}</td>
                    <td>{formatDate(row.exitDate)}</td>
                    <td>
                      {row.exitDate && row.birthDate
                        ? formatAgeAtDate(row.birthDate, row.exitDate)
                        : "—"}
                    </td>
                    <td>{formatStayDuration(row.admissionDate, row.exitDate)}</td>
                    <td>
                      {summarizeStayDays(row.admissionDate, row.exitDate)}
                    </td>
                    <td>{row.villa || "—"}</td>
                    <td>{row.room || "—"}</td>
                    {appliedFilters.includeArchived && (
                      <td>{row.archived ? "مؤرشف" : "—"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="empty-state">
                لا توجد سجلات إقامة ضمن عوامل التصفية المحددة.
              </div>
            )}
          </div>
        </>
      ) : null}
      {!persistent && (
        <p className="resident-report-demo-note">
          هذه بيانات تجريبية فقط ولا تُحفظ في قاعدة البيانات.
        </p>
      )}
    </section>
  );
}
