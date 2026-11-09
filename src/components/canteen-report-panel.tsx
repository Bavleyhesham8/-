"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getCanteenReportAction } from "@/app/actions/canteen-report";
import { getDemoCanteenReport } from "@/lib/canteen-report-demo-data";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
import type {
  CanteenReportData,
  CanteenReportFilters,
} from "@/lib/canteen-report-types";

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialFilters(): CanteenReportFilters {
  const today = new Date();
  return {
    startDate: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`,
    endDate: localDate(today),
    itemNumber: null,
    direction: "all",
    recipient: "",
    includeVoided: false,
  };
}

function displayDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 3,
  }).format(value);
}

function reportErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    error.message === "Canteen access is required for this report."
  ) {
    return "يتطلب عرض هذا التقرير صلاحية الكانتين.";
  }
  if (
    error instanceof Error &&
    error.message === "The canteen report filters are invalid."
  ) {
    return "تواريخ أو عوامل التصفية غير صالحة.";
  }
  return "تعذر تحميل التقرير. تحقق من الاتصال ثم أعد المحاولة.";
}

export default function CanteenReportPanel({
  persistent,
}: {
  persistent: boolean;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState<CanteenReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadReport = async () => {
      try {
        const result = persistent
          ? await getCanteenReportAction(appliedFilters)
          : getDemoCanteenReport(appliedFilters);
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
      direction: appliedFilters.direction,
      recipient: appliedFilters.recipient,
      includeVoided: String(appliedFilters.includeVoided),
    });
    if (appliedFilters.itemNumber !== null) {
      params.set("itemNumber", String(appliedFilters.itemNumber));
    }
    const link = document.createElement("a");
    link.href = `/api/reports/canteen-stock?${params}`;
    document.body.append(link);
    link.click();
    link.remove();
  }

  const balances = report?.balances ?? [];
  const movements = report?.movements ?? [];
  const remainingBalance = report?.totals.remaining ?? 0;

  return (
    <section className="content-panel canteen-report-panel" dir="rtl">
      <PrintBrand
        title="تقرير مخزون الكانتين"
        subtitle="الرصيد الفعال وحركات الوارد والمنصرف"
        meta={[
          {
            label: "الفترة",
            value: `${displayDate(appliedFilters.startDate)} — ${displayDate(appliedFilters.endDate)}`,
          },
        ]}
      />
      <div className="panel-heading">
        <div>
          <h3>تقارير مخزون الكانتين</h3>
          <p>
            الأرصدة الفعالة، الوارد والمنصرف، وسندات الصرف ضمن الفترة المحددة.
          </p>
        </div>
        <div className="canteen-report-actions">
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

      <form className="canteen-report-filters" onSubmit={applyFilters}>
        <label>
          من تاريخ الحركة
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
          إلى تاريخ الحركة
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
          الصنف
          <select
            value={filters.itemNumber ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                itemNumber: event.target.value
                  ? Number(event.target.value)
                  : null,
              }))
            }
          >
            <option value="">كل الأصناف</option>
            {(report?.products ?? []).map((product) => (
              <option key={product.itemNumber} value={product.itemNumber}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          نوع الحركة
          <select
            value={filters.direction}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                direction: event.target.value as CanteenReportFilters["direction"],
              }))
            }
          >
            <option value="all">الوارد والمنصرف</option>
            <option value="in">الوارد فقط</option>
            <option value="out">المنصرف فقط</option>
          </select>
        </label>
        <label>
          المستلم
          <input
            type="search"
            value={filters.recipient}
            maxLength={160}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                recipient: event.target.value,
              }))
            }
          />
        </label>
        <label className="canteen-report-void-filter">
          <input
            type="checkbox"
            checked={filters.includeVoided}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                includeVoided: event.target.checked,
              }))
            }
          />
          إظهار الحركات الملغاة للمراجعة
        </label>
        <button className="primary-button" type="submit" disabled={loading}>
          عرض التقرير
        </button>
      </form>

      {error && (
        <p className="canteen-report-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className="empty-state" aria-live="polite">
          جارٍ تحميل التقرير...
        </div>
      ) : report ? (
        <>
          <section className="canteen-report-section">
            <div className="canteen-report-section-heading">
              <h4>الرصيد الفعال الحالي</h4>
              <span>يُحسب من جميع الحركات غير الملغاة.</span>
            </div>
            <div className="table-wrap report-detail">
              <table className="resident-table">
                <thead>
                  <tr>
                    <th>رقم الصنف</th>
                    <th>الصنف</th>
                    <th>السعر</th>
                    <th>الرصيد الحالي</th>
                    <th>قيمة الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((balance) => (
                    <tr key={balance.itemNumber}>
                      <td>{formatNumber(balance.itemNumber)}</td>
                      <td>{balance.itemName}</td>
                      <td>{formatNumber(balance.price)} ج.م</td>
                      <td>{formatNumber(balance.balance)}</td>
                      <td>{formatNumber(balance.value)} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!balances.length && (
                <div className="empty-state">لا توجد أصناف.</div>
              )}
            </div>
          </section>

          <div className="canteen-report-summary report-summary">
            <article>
              <span>إجمالي الوارد بالفترة</span>
              <strong>{formatNumber(report.totals.incoming)}</strong>
            </article>
            <article>
              <span>إجمالي المنصرف بالفترة</span>
              <strong>{formatNumber(report.totals.outgoing)}</strong>
            </article>
            <article>
              <span>الرصيد المتبقي الحالي</span>
              <strong>{formatNumber(remainingBalance)}</strong>
            </article>
            <article>
              <span>قيمة المخزون المتبقي</span>
              <strong>{formatNumber(report.totals.value)} ج.م</strong>
            </article>
            <article>
              <span>عدد الحركات المعروضة</span>
              <strong>{formatNumber(movements.length)}</strong>
            </article>
            <article>
              <span>الفترة</span>
              <strong>
                {displayDate(appliedFilters.startDate)} —{" "}
                {displayDate(appliedFilters.endDate)}
              </strong>
            </article>
          </div>

          <section className="canteen-report-section canteen-report-movements">
            <div className="canteen-report-section-heading">
              <h4>تفاصيل حركات المخزون</h4>
              {appliedFilters.includeVoided && (
                <span>الحركات الملغاة ظاهرة للمراجعة ولا تدخل في الإجماليات.</span>
              )}
            </div>
            <div className="table-wrap report-detail">
              <table className="resident-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>رقم الصنف</th>
                    <th>الصنف</th>
                    <th>الحركة</th>
                    <th>الكمية</th>
                    <th>الرصيد المسجل</th>
                    <th>المستلم</th>
                    <th>رقم المستند</th>
                    {appliedFilters.includeVoided && <th>حالة الإلغاء</th>}
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr
                      key={movement.id}
                      className={movement.voided ? "canteen-report-voided" : ""}
                    >
                      <td>{displayDate(movement.date)}</td>
                      <td>{formatNumber(movement.itemNumber)}</td>
                      <td>{movement.itemName}</td>
                      <td>
                        {movement.direction === "in" ? "وارد" : "منصرف"}
                      </td>
                      <td>{formatNumber(movement.quantity)}</td>
                      <td>{formatNumber(movement.balanceAfter)}</td>
                      <td>{movement.recipient || "—"}</td>
                      <td>
                        {movement.voucherId === null
                          ? "—"
                          : formatNumber(movement.voucherId)}
                      </td>
                      {appliedFilters.includeVoided && (
                        <td>
                          {movement.voided
                            ? `ملغاة: ${movement.voidReason}`
                            : "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!movements.length && (
                <div className="empty-state">
                  لا توجد حركات ضمن عوامل التصفية المحددة.
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
      {!persistent && (
        <p className="canteen-report-demo-note">
          هذه بيانات تجريبية فقط ولا تُحفظ في قاعدة البيانات.
        </p>
      )}
    </section>
  );
}
