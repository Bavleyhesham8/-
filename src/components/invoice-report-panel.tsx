"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getInvoiceReportAction } from "@/app/actions/invoice-report";
import { getDemoInvoiceReport } from "@/lib/invoice-report-demo-data";
import { summarizeInvoiceReport } from "@/lib/invoice-report-utils";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
import type {
  InvoiceReportData,
  InvoiceReportFilters,
} from "@/lib/invoice-report-types";

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthFilters(): InvoiceReportFilters {
  const today = new Date();
  return {
    startDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`,
    endDate: localDate(today),
    categoryId: null,
  };
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function displayMonth(value: string) {
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00.000Z`));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ar-EG").format(value);
}

function reportErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    error.message === "Canteen access is required for this report."
  ) {
    return "ليس لديك صلاحية عرض تقارير الفواتير.";
  }
  if (
    error instanceof Error &&
    error.message === "The invoice report filters are invalid."
  ) {
    return "تواريخ التقرير غير صالحة.";
  }
  return "تعذر تحميل التقرير. تحقق من الاتصال ثم أعد المحاولة.";
}

export default function InvoiceReportPanel({
  persistent,
}: {
  persistent: boolean;
}) {
  const [filters, setFilters] = useState(currentMonthFilters);
  const [appliedFilters, setAppliedFilters] = useState(currentMonthFilters);
  const [report, setReport] = useState<InvoiceReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadReport = async () => {
      try {
        if (persistent) {
          const result = await getInvoiceReportAction(appliedFilters);
          if (active) setReport(result);
        } else {
          const demo = getDemoInvoiceReport();
          const filteredRows = demo.rows.filter(
            (row) =>
              row.invoiceDate >= appliedFilters.startDate &&
              row.invoiceDate <= appliedFilters.endDate &&
              (appliedFilters.categoryId === null ||
                demo.categories.find(
                  (category) =>
                    category.name === row.categoryName &&
                    category.id === appliedFilters.categoryId,
                ) !== undefined),
          );
          if (active) setReport({ ...demo, rows: filteredRows });
        }
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
  const summary = summarizeInvoiceReport(rows);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !filters.startDate ||
      !filters.endDate ||
      filters.startDate > filters.endDate
    ) {
      setError("اختر نطاقًا زمنيًا صحيحًا.");
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
    });
    if (appliedFilters.categoryId !== null) {
      params.set("categoryId", String(appliedFilters.categoryId));
    }
    const link = document.createElement("a");
    link.href = `/api/reports/invoices?${params}`;
    document.body.append(link);
    link.click();
    link.remove();
  }

  return (
    <section className="content-panel invoice-report-panel" dir="rtl">
      <PrintBrand
        title="تقرير الفواتير"
        subtitle="بحث حسب التاريخ والفئة مع إجماليات يومية وشهرية"
        meta={[
          {
            label: "الفترة",
            value: `${displayDate(appliedFilters.startDate)} — ${displayDate(appliedFilters.endDate)}`,
          },
        ]}
      />
      <div className="panel-heading">
        <div>
          <h3>تقارير الفواتير</h3>
          <p>بحث حسب التاريخ والفئة مع إجماليات يومية وشهرية.</p>
        </div>
        <div className="invoice-report-actions">
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

      <form className="invoice-report-filters" onSubmit={applyFilters}>
        <label>
          من تاريخ
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
          إلى تاريخ
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
          الفئة
          <select
            value={filters.categoryId ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                categoryId: event.target.value
                  ? Number(event.target.value)
                  : null,
              }))
            }
          >
            <option value="">كل الفئات</option>
            {(report?.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={loading}>
          عرض التقرير
        </button>
      </form>

      {error && <p className="invoice-report-error" role="alert">{error}</p>}
      {loading ? (
        <div className="empty-state" aria-live="polite">
          جارٍ تحميل التقرير...
        </div>
      ) : report ? (
        <>
          <div className="invoice-report-summary report-summary">
            <article>
              <span>إجمالي المبيعات</span>
              <strong>{formatNumber(summary.invoicesTotal)} ج.م</strong>
            </article>
            <article>
              <span>عدد الفواتير</span>
              <strong>{formatNumber(summary.invoiceCount)}</strong>
            </article>
            <article>
              <span>المدفوع</span>
              <strong>{formatNumber(summary.paid)} ج.م</strong>
            </article>
            <article>
              <span>المتبقي</span>
              <strong>{formatNumber(summary.remaining)} ج.م</strong>
            </article>
            <article>
              <span>عدد تفاصيل الفواتير</span>
              <strong>{formatNumber(summary.count)}</strong>
            </article>
            <article>
              <span>الفترة</span>
              <strong>
                {displayDate(appliedFilters.startDate)} —{" "}
                {displayDate(appliedFilters.endDate)}
              </strong>
              <span>
                الفئة:{" "}
                {report.categories.find(
                  (category) => category.id === appliedFilters.categoryId,
                )?.name ?? "كل الفئات"}
              </span>
            </article>
          </div>

          <div className="invoice-report-periods report-detail">
            <section>
              <h4>الإجماليات اليومية</h4>
              {summary.daily.length ? (
                <div className="table-wrap">
                  <table className="resident-table">
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>عدد التفاصيل</th>
                        <th>الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.daily.map((item) => (
                        <tr key={item.period}>
                          <td>{displayDate(item.period)}</td>
                          <td>{formatNumber(item.count)}</td>
                          <td>{formatNumber(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="invoice-report-empty">لا توجد نتائج.</p>
              )}
            </section>
            <section>
              <h4>الإجماليات الشهرية</h4>
              {summary.monthly.length ? (
                <div className="table-wrap">
                  <table className="resident-table">
                    <thead>
                      <tr>
                        <th>الشهر</th>
                        <th>عدد التفاصيل</th>
                        <th>الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.monthly.map((item) => (
                        <tr key={item.period}>
                          <td>{displayMonth(item.period)}</td>
                          <td>{formatNumber(item.count)}</td>
                          <td>{formatNumber(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="invoice-report-empty">لا توجد نتائج.</p>
              )}
            </section>
          </div>

          <div className="table-wrap invoice-report-details report-detail">
            <table className="resident-table">
              <thead>
                <tr>
                  <th>رقم الفاتورة</th>
                  <th>تاريخ الفاتورة</th>
                  <th>رقم ملف النزيل</th>
                  <th>اسم النزيل (ويب)</th>
                  <th>نوع البيع (ويب)</th>
                  <th>الرصيد</th>
                  <th>الفئه</th>
                  <th>الفئة (رقم)</th>
                  <th>اسم الفئة (ويب)</th>
                  <th>الصنف</th>
                  <th>السعر</th>
                  <th>الكمية</th>
                  <th>الاجمالى</th>
                  <th>التاريخ</th>
                  <th>اليوم</th>
                  <th>الشهر</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.invoiceNumber}-${index}`}>
                    <td>{formatNumber(row.invoiceNumber)}</td>
                    <td>{displayDate(row.invoiceDate)}</td>
                    <td>
                      {row.residentNumber === null
                        ? "—"
                        : formatNumber(row.residentNumber)}
                    </td>
                    <td>{row.residentName || "—"}</td>
                    <td>{row.saleType === "cash" ? "نقدي" : "نزيل"}</td>
                    <td>{formatNumber(row.balance)}</td>
                    <td>{row.alternateCategory || "—"}</td>
                    <td>
                      {row.categoryId === null
                        ? "—"
                        : formatNumber(row.categoryId)}
                    </td>
                    <td>{row.categoryName}</td>
                    <td>{row.itemName}</td>
                    <td>{row.unitPrice}</td>
                    <td>{row.quantity}</td>
                    <td>{formatNumber(row.total)}</td>
                    <td>{displayDate(row.lineDate)}</td>
                    <td>{row.dayName || "—"}</td>
                    <td>{row.monthName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="empty-state">لا توجد فواتير في هذا النطاق.</div>
            )}
          </div>
        </>
      ) : null}
      {!persistent && (
        <p className="invoice-report-demo-note">
          هذه بيانات تجريبية فقط ولا تُحفظ في قاعدة البيانات.
        </p>
      )}
    </section>
  );
}
