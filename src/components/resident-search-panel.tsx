"use client";

import { useMemo, useState, type FormEvent } from "react";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
import type { Resident } from "@/lib/demo-data";
import {
  formatAgeAtDate,
  formatStayDuration,
  normalizeResidentStayNumber,
} from "@/lib/resident-stay-report-utils";

type Props = {
  residents: Resident[];
  persistent: boolean;
};

type EventFilter = "all" | "entered" | "exited" | "stayed";

type Filters = {
  search: string;
  event: EventFilter;
  status: "all" | "current" | "departed";
  governorate: string;
  villa: string;
  church: string;
  confessor: string;
  startDate: string;
  endDate: string;
  includeArchived: boolean;
};

const numberFormatter = new Intl.NumberFormat("ar-EG");

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function haystack(resident: Resident) {
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
    resident.nationalId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function uniqueSorted(values: (string | undefined)[]) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b, "ar"));
}

export default function ResidentSearchPanel({ residents, persistent }: Props) {
  const emptyFilters: Filters = {
    search: "",
    event: "all",
    status: "all",
    governorate: "",
    villa: "",
    church: "",
    confessor: "",
    startDate: "",
    endDate: "",
    includeArchived: false,
  };
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [error, setError] = useState("");

  const governorateOptions = useMemo(
    () => uniqueSorted(residents.map((resident) => resident.governorate)),
    [residents],
  );
  const churchOptions = useMemo(
    () => uniqueSorted(residents.map((resident) => resident.church)),
    [residents],
  );

  const filtered = useMemo(() => {
    const search = appliedFilters.search.trim().toLocaleLowerCase();
    const villa = normalizeResidentStayNumber(
      appliedFilters.villa.trim(),
    ).toLocaleLowerCase();
    const hasRange = Boolean(
      appliedFilters.startDate || appliedFilters.endDate,
    );
    const start = appliedFilters.startDate;
    const end = appliedFilters.endDate;

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
        appliedFilters.church &&
        (resident.church ?? "") !== appliedFilters.church
      ) {
        return false;
      }
      if (
        appliedFilters.confessor &&
        !(resident.confessor ?? "")
          .toLocaleLowerCase()
          .includes(appliedFilters.confessor.toLocaleLowerCase())
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
      if (search && !haystack(resident).includes(search)) return false;

      if (!hasRange) return true;

      const entered =
        resident.admissionDate &&
        (!start || resident.admissionDate >= start) &&
        (!end || resident.admissionDate <= end);
      const exited =
        resident.exitDate &&
        (!start || resident.exitDate >= start) &&
        (!end || resident.exitDate <= end);
      const stayed =
        resident.admissionDate &&
        (!end || resident.admissionDate <= end) &&
        (!resident.exitDate || !start || resident.exitDate >= start);

      if (appliedFilters.event === "entered") return Boolean(entered);
      if (appliedFilters.event === "exited") return Boolean(exited);
      if (appliedFilters.event === "stayed") return Boolean(stayed);
      return Boolean(entered || exited || stayed);
    });
  }, [residents, appliedFilters]);

  const summary = useMemo(() => {
    const current = filtered.filter(
      (resident) => resident.status === "current",
    ).length;
    const entered = filtered.filter(
      (resident) =>
        resident.admissionDate &&
        (!appliedFilters.startDate ||
          resident.admissionDate >= appliedFilters.startDate) &&
        (!appliedFilters.endDate ||
          resident.admissionDate <= appliedFilters.endDate),
    ).length;
    const exited = filtered.filter(
      (resident) =>
        resident.exitDate &&
        (!appliedFilters.startDate ||
          resident.exitDate >= appliedFilters.startDate) &&
        (!appliedFilters.endDate ||
          resident.exitDate <= appliedFilters.endDate),
    ).length;
    return {
      total: filtered.length,
      current,
      departed: filtered.length - current,
      entered,
      exited,
    };
  }, [filtered, appliedFilters.startDate, appliedFilters.endDate]);

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
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setError("");
  }

  return (
    <section className="content-panel resident-report-panel" dir="rtl">
      <PrintBrand
        title="بحث النزلاء"
        subtitle="بحث بالاسم أو الملف أو الهاتف أو المحافظة، وتصفية حسب تاريخ الدخول والخروج"
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
          <h3>بحث النزلاء</h3>
          <p>
            ابحث عن نزيل بالاسم أو رقم الملف أو الهاتف أو المحافظة، أو اعرض من
            دخل/خرج خلال فترة زمنية محددة. حركات الوارد والمنصرف التفصيلية متاحة
            أيضًا في «دفتر اليومية والحركات».
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

      <form className="resident-report-filters" onSubmit={applyFilters}>
        <label>
          بحث بالاسم أو الملف أو الهاتف
          <input
            type="search"
            value={filters.search}
            maxLength={120}
            placeholder="مثال: اسم النزيل أو رقم الملف..."
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                search: event.target.value,
              }))
            }
          />
        </label>
        <label>
          نوع الحدث
          <select
            value={filters.event}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                event: event.target.value as EventFilter,
              }))
            }
          >
            <option value="all">الكل</option>
            <option value="entered">دخل خلال الفترة</option>
            <option value="exited">خرج خلال الفترة</option>
            <option value="stayed">كان مقيمًا خلال الفترة</option>
          </select>
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
          الكنيسة
          <select
            value={filters.church}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                church: event.target.value,
              }))
            }
          >
            <option value="">كل الكنائس</option>
            {churchOptions.map((church) => (
              <option key={church} value={church}>
                {church}
              </option>
            ))}
          </select>
        </label>
        <label>
          أب الاعتراف
          <input
            type="text"
            value={filters.confessor}
            maxLength={120}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                confessor: event.target.value,
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
          بحث
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
          <span>نتائج البحث</span>
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
          <span>دخلوا خلال الفترة</span>
          <strong>{numberFormatter.format(summary.entered)}</strong>
        </article>
        <article>
          <span>خرجوا خلال الفترة</span>
          <strong>{numberFormatter.format(summary.exited)}</strong>
        </article>
      </div>

      <div className="table-wrap resident-report-details report-detail">
        <table className="resident-table">
          <thead>
            <tr>
              <th>رقم الملف</th>
              <th>اسم النزيل</th>
              <th>الحالة</th>
              <th>تاريخ الدخول</th>
              <th>تاريخ الخروج</th>
              <th>مدة الإقامة</th>
              <th>العمر</th>
              <th>الفيلا</th>
              <th>الغرفة</th>
              <th>المحافظة</th>
              <th>الكنيسة</th>
              <th>أب الاعتراف</th>
              <th>الهاتف</th>
              <th>العنوان</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((resident) => (
              <tr key={resident.id}>
                <td>{resident.fileNumber || "—"}</td>
                <td>{resident.name}</td>
                <td>{resident.status === "current" ? "مقيم" : "غادر"}</td>
                <td>{formatDate(resident.admissionDate)}</td>
                <td>{formatDate(resident.exitDate)}</td>
                <td>
                  {formatStayDuration(
                    resident.admissionDate,
                    resident.exitDate,
                  )}
                </td>
                <td>
                  {resident.birthDate
                    ? formatAgeAtDate(
                        resident.birthDate,
                        resident.exitDate || todayValue(),
                      )
                    : "—"}
                </td>
                <td>{resident.villa || "—"}</td>
                <td>{resident.room || "—"}</td>
                <td>{resident.governorate || "—"}</td>
                <td>{resident.church || "—"}</td>
                <td>{resident.confessor || "—"}</td>
                <td>{resident.phone || "—"}</td>
                <td>{resident.address || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty-state">
            لا توجد نتائج مطابقة لعوامل البحث المحددة.
          </div>
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
