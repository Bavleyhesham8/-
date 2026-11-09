"use client";

import { useMemo, useState, type FormEvent } from "react";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
import ResidentPicker from "@/components/resident-picker";
import type { Resident } from "@/lib/demo-data";
import type { TreatmentBundle } from "@/lib/treatment-types";
import {
  formatAgeAtDate,
  formatStayDuration,
  normalizeResidentStayNumber,
} from "@/lib/resident-stay-report-utils";

type ReportKind = "names" | "diagnosis" | "governorate" | "housing";

type Props = {
  residents: Resident[];
  treatment?: TreatmentBundle;
  initialReport?: string | null;
  persistent: boolean;
};

type Filters = {
  search: string;
  governorate: string;
  villa: string;
  status: "all" | "current" | "departed";
  startDate: string;
  endDate: string;
  includeArchived: boolean;
};

const reportTabs: { key: ReportKind; label: string; description: string }[] = [
  {
    key: "names",
    label: "تقرير الأسماء",
    description: "كشف بأسماء النزلاء وبيانات الملف والإقامة.",
  },
  {
    key: "diagnosis",
    label: "تقرير التشخيص",
    description: "ملخص العلاج والتشخيص المسجل لكل نزيل من سجلات العيادة.",
  },
  {
    key: "governorate",
    label: "تقرير المحافظة",
    description: "توزيع النزلاء حسب المحافظة مع إجمالي المقيمين والغادرين.",
  },
  {
    key: "housing",
    label: "تقرير السكن",
    description: "توزيع النزلاء حسب الفيلا والغرفة.",
  },
];

const numberFormatter = new Intl.NumberFormat("ar-EG");

function uniqueSorted(values: (string | undefined)[]) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b, "ar"));
}

function normalizeReportKind(value?: string | null): ReportKind {
  return value === "diagnosis" ||
    value === "governorate" ||
    value === "housing"
    ? value
    : "names";
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function residentHaystack(resident: Resident) {
  return [
    resident.fileNumber,
    resident.residentNumber,
    resident.name,
    resident.phone,
    resident.address,
    resident.district,
    resident.governorate,
    resident.church,
    resident.confessor,
    resident.villa,
    resident.room,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = key(row) || "غير محدد";
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}

export default function ResidentReportsPanel({
  residents,
  treatment,
  initialReport,
  persistent,
}: Props) {
  const [report, setReport] = useState<ReportKind>(() =>
    normalizeReportKind(initialReport),
  );
  const [filters, setFilters] = useState<Filters>({
    search: "",
    governorate: "",
    villa: "",
    status: "all",
    startDate: "",
    endDate: "",
    includeArchived: false,
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [error, setError] = useState("");
  const [selectedGovernorate, setSelectedGovernorate] = useState("");

  const governorateOptions = useMemo(
    () =>
      uniqueSorted(residents.map((resident) => resident.governorate)),
    [residents],
  );

  const filtered = useMemo(() => {
    const search = appliedFilters.search.trim().toLocaleLowerCase();
    const villa = normalizeResidentStayNumber(
      appliedFilters.villa.trim(),
    ).toLocaleLowerCase();

    return residents.filter((resident) => {
      if (!appliedFilters.includeArchived && resident.archived) return false;
      if (
        appliedFilters.status === "current" &&
        resident.status !== "current"
      ) {
        return false;
      }
      if (
        appliedFilters.status === "departed" &&
        resident.status !== "departed"
      ) {
        return false;
      }
      if (
        appliedFilters.governorate &&
        (resident.governorate ?? "") !== appliedFilters.governorate
      ) {
        return false;
      }
      if (
        villa &&
        normalizeResidentStayNumber(resident.villa.trim()).toLocaleLowerCase() !==
          villa
      ) {
        return false;
      }
      if (
        appliedFilters.startDate &&
        (!resident.admissionDate ||
          resident.admissionDate < appliedFilters.startDate)
      ) {
        return false;
      }
      if (
        appliedFilters.endDate &&
        (!resident.admissionDate ||
          resident.admissionDate > appliedFilters.endDate)
      ) {
        return false;
      }
      if (search && !residentHaystack(resident).includes(search)) return false;
      return true;
    });
  }, [residents, appliedFilters]);

  const summary = useMemo(() => {
    const current = filtered.filter(
      (resident) => resident.status === "current",
    ).length;
    const departed = filtered.length - current;
    const governorates = new Set<string>();
    const churches = new Set<string>();
    for (const resident of filtered) {
      if (resident.governorate) governorates.add(resident.governorate);
      if (resident.church) churches.add(resident.church);
    }
    return {
      total: filtered.length,
      current,
      departed,
      governorates: governorates.size,
      churches: churches.size,
    };
  }, [filtered]);

  const governorateGroups = useMemo(
    () => groupBy(filtered, (resident) => resident.governorate ?? ""),
    [filtered],
  );

  const housingGroups = useMemo(
    () =>
      groupBy(
        filtered,
        (resident) =>
          `${resident.villa || "بدون فيلا"} — ${resident.room || "بدون غرفة"}`,
      ),
    [filtered],
  );

  const treatmentRows = useMemo(() => {
    const rows: {
      key: string;
      residentName: string;
      fileNumber: string;
      residentNumber: string;
      medicationName: string;
      amount: number;
      quantity: number;
      total: number;
      treatmentDate: string;
      voided: boolean;
    }[] = [];

    const byResidentNumber = new Map(
      filtered
        .filter((resident) => resident.residentNumber)
        .map((resident) => [resident.residentNumber ?? "", resident]),
    );
    const byName = new Map(filtered.map((resident) => [resident.name, resident]));

    for (const record of treatment?.records ?? []) {
      const resident =
        byResidentNumber.get(String(record.residentNumber)) ??
        byName.get(record.residentName ?? "");
      if (!resident) continue;
      for (const entry of record.entries) {
        rows.push({
          key: `record-${record.residentNumber}-${entry.id}`,
          residentName: resident.name,
          fileNumber: resident.fileNumber,
          residentNumber: resident.residentNumber ?? String(record.residentNumber),
          medicationName: entry.medicationName,
          amount: entry.amount,
          quantity: entry.quantity,
          total: entry.total,
          treatmentDate: entry.treatmentDate ?? "",
          voided: entry.voided,
        });
      }
    }

    for (const entry of treatment?.unassignedEntries ?? []) {
      if (entry.residentNumber === null) continue;
      const resident = byResidentNumber.get(String(entry.residentNumber));
      if (!resident) continue;
      rows.push({
        key: `unassigned-${entry.id}`,
        residentName: resident.name,
        fileNumber: resident.fileNumber,
        residentNumber: resident.residentNumber ?? String(entry.residentNumber),
        medicationName: entry.medicationName,
        amount: entry.amount,
        quantity: entry.quantity,
        total: entry.total,
        treatmentDate: entry.treatmentDate ?? "",
        voided: entry.voided,
      });
    }

    return rows.sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate));
  }, [filtered, treatment]);

  const diagnosisSummary = useMemo(() => {
    let billed = 0;
    let active = 0;
    const residentsCount = new Set<string>();
    for (const row of treatmentRows) {
      if (row.voided) continue;
      billed += row.total;
      active += 1;
      residentsCount.add(row.residentNumber);
    }
    return {
      entries: treatmentRows.length,
      active,
      residents: residentsCount.size,
      billed,
    };
  }, [treatmentRows]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      filters.startDate &&
      filters.endDate &&
      filters.startDate > filters.endDate
    ) {
      setError("تاريخ البداية يجب أن يكون قبل تاريخ النهاية.");
      return;
    }
    setError("");
    setAppliedFilters({ ...filters });
  }

  function resetFilters() {
    const empty: Filters = {
      search: "",
      governorate: "",
      villa: "",
      status: "all",
      startDate: "",
      endDate: "",
      includeArchived: false,
    };
    setFilters(empty);
    setAppliedFilters(empty);
    setError("");
  }

  const activeTab = reportTabs.find((tab) => tab.key === report) ?? reportTabs[0];

  return (
    <section className="content-panel resident-report-panel" dir="rtl">
      <PrintBrand
        title="تقرير النزلاء"
        subtitle={activeTab.description}
        meta={[
          {
            label: "الفترة",
            value:
              appliedFilters.startDate || appliedFilters.endDate
                ? `${formatDate(appliedFilters.startDate)} — ${formatDate(appliedFilters.endDate)}`
                : "كل الفترات",
          },
        ]}
      />

      <div className="panel-heading">
        <div>
          <h3>تقارير النزلاء</h3>
          <p>
            تقارير الأسماء والتشخيص والمحافظة والسكن من نفس بيانات النزلاء
            المعروضة في النظام، مع إمكانية التصفية حسب التاريخ والمحافظة والفيلا.
          </p>
        </div>
        <div className="resident-report-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={printCurrentView}
          >
            طباعة / حفظ PDF
          </button>
        </div>
      </div>

      <div className="lookup-tabs" role="tablist" aria-label="أنواع تقرير النزلاء">
        {reportTabs.map((tab) => (
          <button
            aria-selected={report === tab.key}
            className={report === tab.key ? "active" : ""}
            key={tab.key}
            onClick={() => setReport(tab.key)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form className="resident-report-filters" onSubmit={applyFilters}>
        <label>
          بحث بالاسم أو الملف أو الهاتف
          <ResidentPicker
            residents={residents}
            value={filters.search}
            placeholder="ابحث بالاسم أو رقم الملف..."
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                search: value,
              }))
            }
          />
        </label>
        <label>
          المحافظة
          <select
            value={filters.governorate}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                governorate: event.target.value,
              }))
            }
          >
            <option value="">كل المحافظات</option>
            {governorateOptions.map((governorate) => (
              <option key={governorate} value={governorate}>
                {governorate}
              </option>
            ))}
          </select>
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
          الحالة
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: event.target.value as Filters["status"],
              }))
            }
          >
            <option value="all">الكل</option>
            <option value="current">مقيم حاليًا</option>
            <option value="departed">غادر</option>
          </select>
        </label>
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
          تضمين المؤرشفين
        </label>
        <button className="primary-button" type="submit">
          عرض التقرير
        </button>
        <button className="secondary-button" type="button" onClick={resetFilters}>
          إعادة ضبط
        </button>
      </form>

      {error && (
        <p className="resident-report-error" role="alert">
          {error}
        </p>
      )}

      <div className="resident-report-summary report-summary">
        <article>
          <span>إجمالي النزلاء</span>
          <strong>{numberFormatter.format(summary.total)}</strong>
        </article>
        <article>
          <span>المقيمون حاليًا</span>
          <strong>{numberFormatter.format(summary.current)}</strong>
        </article>
        <article>
          <span>الغادرون</span>
          <strong>{numberFormatter.format(summary.departed)}</strong>
        </article>
        <article>
          <span>المحافظات</span>
          <strong>{numberFormatter.format(summary.governorates)}</strong>
        </article>
        <article>
          <span>الكنائس</span>
          <strong>{numberFormatter.format(summary.churches)}</strong>
        </article>
      </div>

      <div className="report-detail">
        {report === "names" && (
          <div className="table-wrap resident-report-details">
            <table className="resident-table">
              <thead>
                <tr>
                  <th>رقم الملف</th>
                  <th>اسم النزيل</th>
                  <th>تاريخ الميلاد</th>
                  <th>العمر</th>
                  <th>الحالة</th>
                  <th>تاريخ الدخول</th>
                  <th>تاريخ الخروج</th>
                  <th>مدة الإقامة</th>
                  <th>الفيلا</th>
                  <th>الغرفة</th>
                  <th>المحافظة</th>
                  <th>الكنيسة</th>
                  <th>أب الاعتراف</th>
                  <th>الهاتف</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((resident) => (
                  <tr key={resident.id}>
                    <td>{resident.fileNumber || "—"}</td>
                    <td>{resident.name}</td>
                    <td>{formatDate(resident.birthDate)}</td>
                    <td>
                      {resident.birthDate
                        ? formatAgeAtDate(
                            resident.birthDate,
                            resident.exitDate ||
                              new Date().toISOString().slice(0, 10),
                          )
                        : "—"}
                    </td>
                    <td>{resident.status === "current" ? "مقيم" : "غادر"}</td>
                    <td>{formatDate(resident.admissionDate)}</td>
                    <td>{formatDate(resident.exitDate)}</td>
                    <td>
                      {formatStayDuration(
                        resident.admissionDate,
                        resident.exitDate,
                      )}
                    </td>
                    <td>{resident.villa || "—"}</td>
                    <td>{resident.room || "—"}</td>
                    <td>{resident.governorate || "—"}</td>
                    <td>{resident.church || "—"}</td>
                    <td>{resident.confessor || "—"}</td>
                    <td>{resident.phone || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="empty-state">
                لا توجد سجلات نزلاء ضمن عوامل التصفية المحددة.
              </div>
            )}
          </div>
        )}

        {report === "diagnosis" && (
          <>
            <div className="resident-report-summary report-summary">
              <article>
                <span>عدد سجلات العلاج</span>
                <strong>{numberFormatter.format(diagnosisSummary.entries)}</strong>
              </article>
              <article>
                <span>السجلات السارية</span>
                <strong>{numberFormatter.format(diagnosisSummary.active)}</strong>
              </article>
              <article>
                <span>عدد النزلاء</span>
                <strong>{numberFormatter.format(diagnosisSummary.residents)}</strong>
              </article>
              <article>
                <span>إجمالي المستحقات</span>
                <strong>{numberFormatter.format(diagnosisSummary.billed)}</strong>
              </article>
            </div>
            <div className="table-wrap resident-report-details">
              <table className="resident-table">
                <thead>
                  <tr>
                    <th>رقم الملف</th>
                    <th>اسم النزيل</th>
                    <th>التشخيص / العلاج</th>
                    <th>المبلغ</th>
                    <th>الكمية</th>
                    <th>الإجمالي</th>
                    <th>التاريخ</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {treatmentRows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.fileNumber || "—"}</td>
                      <td>{row.residentName}</td>
                      <td>{row.medicationName}</td>
                      <td>{numberFormatter.format(row.amount)}</td>
                      <td>{numberFormatter.format(row.quantity)}</td>
                      <td>{numberFormatter.format(row.total)}</td>
                      <td>{formatDate(row.treatmentDate)}</td>
                      <td>{row.voided ? "ملغى" : "ساري"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!treatmentRows.length && (
                <div className="empty-state">
                  لا توجد سجلات تشخيص أو علاج مرتبطة بالنزلاء المحددين.
                </div>
              )}
            </div>
          </>
        )}

        {report === "governorate" && (
          <>
            <div className="table-wrap resident-report-details">
              <table className="resident-table">
                <thead>
                  <tr>
                    <th>المحافظة</th>
                    <th>عدد النزلاء</th>
                    <th>المقيمون</th>
                    <th>الغادرون</th>
                    <th>النسبة</th>
                  </tr>
                </thead>
                <tbody>
                  {governorateGroups.map(([governorate, rows]) => {
                    const current = rows.filter(
                      (resident) => resident.status === "current",
                    ).length;
                    return (
                      <tr key={governorate}>
                        <td>
                          <button
                            className="table-action"
                            type="button"
                            aria-pressed={selectedGovernorate === governorate}
                            onClick={() =>
                              setSelectedGovernorate(
                                selectedGovernorate === governorate
                                  ? ""
                                  : governorate,
                              )
                            }
                          >
                            {governorate}
                          </button>
                        </td>
                        <td>{numberFormatter.format(rows.length)}</td>
                        <td>{numberFormatter.format(current)}</td>
                        <td>{numberFormatter.format(rows.length - current)}</td>
                        <td>
                          {summary.total
                            ? `${numberFormatter.format(
                                Math.round((rows.length / summary.total) * 100),
                              )}%`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!governorateGroups.length && (
                <div className="empty-state">لا توجد بيانات محافظات.</div>
              )}
            </div>
            <div className="table-wrap resident-report-details">
              <table className="resident-table">
                <thead>
                  <tr>
                    <th>المحافظة</th>
                    <th>اسم النزيل</th>
                    <th>رقم الملف</th>
                    <th>الحالة</th>
                    <th>الفيلا</th>
                    <th>الغرفة</th>
                  </tr>
                </thead>
                <tbody>
                  {governorateGroups
                    .filter(
                      ([governorate]) =>
                        !selectedGovernorate ||
                        governorate === selectedGovernorate,
                    )
                    .flatMap(([governorate, rows]) =>
                    rows.map((resident) => (
                      <tr key={`${governorate}-${resident.id}`}>
                        <td>{governorate}</td>
                        <td>{resident.name}</td>
                        <td>{resident.fileNumber || "—"}</td>
                        <td>
                          {resident.status === "current" ? "مقيم" : "غادر"}
                        </td>
                        <td>{resident.villa || "—"}</td>
                        <td>{resident.room || "—"}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {report === "housing" && (
          <>
            <div className="table-wrap resident-report-details">
              <table className="resident-table">
                <thead>
                  <tr>
                    <th>الفيلا — الغرفة</th>
                    <th>عدد النزلاء</th>
                    <th>المقيمون</th>
                    <th>الغادرون</th>
                  </tr>
                </thead>
                <tbody>
                  {housingGroups.map(([group, rows]) => {
                    const current = rows.filter(
                      (resident) => resident.status === "current",
                    ).length;
                    return (
                      <tr key={group}>
                        <td>{group}</td>
                        <td>{numberFormatter.format(rows.length)}</td>
                        <td>{numberFormatter.format(current)}</td>
                        <td>{numberFormatter.format(rows.length - current)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!housingGroups.length && (
                <div className="empty-state">لا توجد بيانات سكن.</div>
              )}
            </div>
            <div className="table-wrap resident-report-details">
              <table className="resident-table">
                <thead>
                  <tr>
                    <th>الفيلا</th>
                    <th>الغرفة</th>
                    <th>اسم النزيل</th>
                    <th>رقم الملف</th>
                    <th>الحالة</th>
                    <th>تاريخ الدخول</th>
                    <th>تاريخ الخروج</th>
                  </tr>
                </thead>
                <tbody>
                  {housingGroups.flatMap(([group, rows]) =>
                    rows.map((resident) => (
                      <tr key={`${group}-${resident.id}`}>
                        <td>{resident.villa || "—"}</td>
                        <td>{resident.room || "—"}</td>
                        <td>{resident.name}</td>
                        <td>{resident.fileNumber || "—"}</td>
                        <td>
                          {resident.status === "current" ? "مقيم" : "غادر"}
                        </td>
                        <td>{formatDate(resident.admissionDate)}</td>
                        <td>{formatDate(resident.exitDate)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {!persistent && (
        <p className="resident-report-demo-note">
          هذه بيانات تجريبية فقط ولا تُحفظ في قاعدة البيانات.
        </p>
      )}
    </section>
  );
}
