"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { getCanteenReportAction } from "@/app/actions/canteen-report";
import { updateCanteenMovementAction } from "@/app/actions/canteen";
import { getDemoCanteenReport } from "@/lib/canteen-report-demo-data";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
import type {
  CanteenReportData,
  CanteenReportFilters,
  CanteenReportMovement,
} from "@/lib/canteen-report-types";
import type { Resident } from "@/lib/demo-data";

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
  if (error instanceof Error) {
    if (
      error.message.includes("canteen-reports") ||
      error.message === "Canteen access is required for this report."
    ) {
      return "يتطلب عرض هذا التقرير صلاحية «سجل حركات الكانتين».";
    }
    if (error.message === "The canteen report filters are invalid.") {
      return "تواريخ أو عوامل التصفية غير صالحة.";
    }
  }
  return "تعذر تحميل التقرير. تحقق من الاتصال ثم أعد المحاولة.";
}

export default function CanteenReportPanel({
  persistent,
  canManage = false,
  residents = [],
}: {
  persistent: boolean;
  canManage?: boolean;
  residents?: Resident[];
}) {
  const residentListId = useId();
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [report, setReport] = useState<CanteenReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [editingMovement, setEditingMovement] =
    useState<CanteenReportMovement | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editRecipient, setEditRecipient] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

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
  }, [appliedFilters, persistent, reloadKey]);

  function startEditMovement(movement: CanteenReportMovement) {
    setEditingMovement(movement);
    setEditDate(movement.date);
    setEditQuantity(String(movement.quantity));
    setEditRecipient(movement.recipient);
    setEditCategory(movement.issueCategory);
    setEditError("");
  }

  async function submitMovementEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMovement) return;
    const quantity = Number(editQuantity);
    if (
      !editDate ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      (editingMovement.direction === "out" && !editRecipient.trim())
    ) {
      setEditError("راجع التاريخ والكمية واسم المستلم.");
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      if (persistent) {
        const result = await updateCanteenMovementAction({
          movementId: editingMovement.id,
          movementDate: editDate,
          quantity,
          recipient: editRecipient.trim(),
          itemCategory: editCategory.trim(),
        });
        if (!result.ok) {
          setEditError(result.error);
          return;
        }
      }
      setEditingMovement(null);
      setReloadKey((key) => key + 1);
    } catch {
      setEditError("تعذر تعديل الحركة. حاول مرة أخرى.");
    } finally {
      setEditSaving(false);
    }
  }

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

  const movements = report?.movements ?? [];
  const remainingBalance = report?.totals.remaining ?? 0;
  const selectedProductName =
    appliedFilters.itemNumber === null
      ? "كل الأصناف"
      : (report?.products.find(
          (product) => product.itemNumber === appliedFilters.itemNumber,
        )?.name ?? `صنف ${appliedFilters.itemNumber}`);

  return (
    <section className="content-panel canteen-report-panel" dir="rtl">
      <PrintBrand
        title="سجل حركات الكانتين"
        subtitle="الوارد والمنصرف والمستلم والرصيد بعد الحركة وقيمة الحركة"
        meta={[
          {
            label: "الفترة",
            value: `${displayDate(appliedFilters.startDate)} — ${displayDate(appliedFilters.endDate)}`,
          },
          { label: "الصنف", value: selectedProductName },
          {
            label: "نوع الحركة",
            value:
              appliedFilters.direction === "in"
                ? "الوارد فقط"
                : appliedFilters.direction === "out"
                  ? "المنصرف فقط"
                  : "الوارد والمنصرف",
          },
          {
            label: "النزيل / المستلم",
            value: appliedFilters.recipient.trim() || "الكل",
          },
        ]}
      />
      <div className="panel-heading">
        <div>
          <h3>سجل حركات الكانتين</h3>
          <p>
            وارد ومنصرف مع المستلم وبند الصرف والسعر والقيمة والرصيد بعد كل
            حركة، وإمكانية تعديل الحركات.
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
            onClick={() => printCurrentView({ section: "both" })}
            disabled={!report || loading}
          >
            طباعة الكل
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => printCurrentView({ section: "summary" })}
            disabled={!report || loading}
          >
            طباعة الملخص فقط
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => printCurrentView({ section: "detail" })}
            disabled={!report || loading}
          >
            طباعة الحركات فقط
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
          النزيل / المستلم
          <input
            list={residentListId}
            type="search"
            value={filters.recipient}
            maxLength={160}
            placeholder="اسم النزيل أو المستلم..."
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                recipient: event.target.value,
              }))
            }
          />
          <datalist id={residentListId}>{residents.filter((resident) => !resident.archived).map((resident) => <option key={resident.id} value={resident.name} />)}</datalist>
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

      {canManage && editingMovement && (
        <form
          className="inventory-form canteen-movement-edit-form"
          onSubmit={submitMovementEdit}
        >
          <div className="panel-heading">
            <div>
              <h4>
                تعديل حركة {editingMovement.direction === "in" ? "وارد" : "منصرف"} —{" "}
                {editingMovement.itemName}
              </h4>
              <p>
                سيُعاد حساب الرصيد بعد الحركة لكل الحركات اللاحقة لنفس الصنف.
              </p>
            </div>
          </div>
          <label className="form-field">
            التاريخ
            <input
              type="date"
              required
              value={editDate}
              onChange={(event) => setEditDate(event.target.value)}
            />
          </label>
          <label className="form-field">
            الكمية
            <input
              type="number"
              min="0.01"
              step="any"
              required
              value={editQuantity}
              onChange={(event) => setEditQuantity(event.target.value)}
            />
          </label>
          {editingMovement.direction === "out" && (
            <>
              <label className="form-field">
                المستلم
                <input
                  maxLength={160}
                  value={editRecipient}
                  onChange={(event) => setEditRecipient(event.target.value)}
                  placeholder="اسم المستلم"
                />
              </label>
              <label className="form-field">
                بند الصرف / الغرض
                <input
                  maxLength={160}
                  value={editCategory}
                  onChange={(event) => setEditCategory(event.target.value)}
                />
              </label>
            </>
          )}
          {editError && (
            <p className="form-error" role="alert">
              {editError}
            </p>
          )}
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              disabled={editSaving}
              onClick={() => setEditingMovement(null)}
            >
              إلغاء
            </button>
            <button className="primary-button" disabled={editSaving}>
              {editSaving ? "جارٍ الحفظ..." : "حفظ التعديل"}
            </button>
          </div>
        </form>
      )}

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
                    <th>السعر</th>
                    <th>القيمة</th>
                    <th>الرصيد بعد الحركة</th>
                    <th>المستلم</th>
                    <th>بند الصرف</th>
                    <th>رقم المستند</th>
                    {appliedFilters.includeVoided && <th>حالة الإلغاء</th>}
                    {canManage && <th>الإجراءات</th>}
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
                      <td>{formatNumber(movement.price)} ج.م</td>
                      <td>{formatNumber(movement.value)} ج.م</td>
                      <td>{formatNumber(movement.balanceAfter)}</td>
                      <td>{movement.recipient || "—"}</td>
                      <td>{movement.issueCategory || "—"}</td>
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
                      {canManage && (
                        <td>
                          <button
                            className="table-action"
                            type="button"
                            disabled={movement.voided || editSaving}
                            onClick={() => startEditMovement(movement)}
                          >
                            تعديل
                          </button>
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
