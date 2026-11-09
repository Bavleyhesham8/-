"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  deleteLookupAction,
  saveLookupAction,
} from "@/app/actions/lookups";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
import ResidentPicker from "@/components/resident-picker";
import type { DemoUser, Resident } from "@/lib/demo-data";
import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";
import type { StaffBundle } from "@/lib/staff-types";
import type {
  LookupData,
  LookupKind,
} from "@/lib/lookup-types";

type Props = {
  lookups: LookupData;
  residents: Resident[];
  staffData: StaffBundle;
  sales: CanteenSalesBundle;
  currentUser: DemoUser;
  persistent: boolean;
  onLookupsChange: (lookups: LookupData) => void;
  onResidentsChange: (residents: Resident[]) => void;
  onStaffDataChange: (staffData: StaffBundle) => void;
  onSalesChange: (sales: CanteenSalesBundle) => void;
};

type LookupDraft = {
  number: string;
  name: string;
  acheshe: string;
  father: string;
  governorate: string;
  district: string;
  day: string;
  villaNumber: string;
};

const emptyDraft: LookupDraft = {
  number: "",
  name: "",
  acheshe: "",
  father: "",
  governorate: "",
  district: "",
  day: "",
  villaNumber: "",
};

const lookupKinds: { key: LookupKind; label: string }[] = [
  { key: "church", label: "الكنيسة التابع لها" },
  { key: "governorate", label: "المحافظة" },
  { key: "day", label: "اليوم" },
  { key: "alternate-category", label: "الفئه" },
  { key: "villa", label: "رقم الفيلا" },
];

const numberFormatter = new Intl.NumberFormat("ar-EG");

function nextId(rows: { id: number }[]) {
  return Math.max(0, ...rows.map((row) => row.id)) + 1;
}

export default function LookupManagerPanel({
  lookups,
  residents,
  staffData,
  sales,
  currentUser,
  persistent,
  onLookupsChange,
  onResidentsChange,
  onStaffDataChange,
  onSalesChange,
}: Props) {
  const isAdministrator = currentUser.role === "admin";
  const [kind, setKind] = useState<LookupKind>("church");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<LookupDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [residentQuery, setResidentQuery] = useState("");
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [reverseChurch, setReverseChurch] = useState("");
  const [reverseGovernorate, setReverseGovernorate] = useState("");
  const [selectedReportGovernorate, setSelectedReportGovernorate] = useState("");
  const canManageCurrentKind =
    isAdministrator || (kind === "villa" && Boolean(currentUser.canEdit));

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft);
    setError("");
    setMessage("");
  }

  function changeKind(nextKind: LookupKind) {
    setKind(nextKind);
    resetForm();
  }

  function hasReferences(recordId: number) {
    switch (kind) {
      case "church": {
        const record = lookups.churches.find((item) => item.id === recordId);
        return !!record?.name && staffData.profiles.some(
          (profile) => profile.church === record.name,
        );
      }
      case "governorate": {
        const record = lookups.governorates.find(
          (item) => item.id === recordId,
        );
        return (
          !!record?.governorate &&
          !!record.district &&
          staffData.profiles.some(
            (profile) =>
              profile.governorate === record.governorate &&
              profile.district === record.district,
          )
        );
      }
      case "alternate-category": {
        const record = lookups.alternateCategories.find(
          (item) => item.id === recordId,
        );
        return (
          !!record?.name &&
          sales.invoices.some((invoice) =>
            invoice.lines.some(
              (line) => line.alternateCategory === record.name,
            ),
          )
        );
      }
      case "day":
        return false;
      case "villa": {
        const record = lookups.villas.find((item) => item.id === recordId);
        return (
          !!record?.villaNumber &&
          residents.some(
            (resident) =>
              !resident.archived &&
              resident.status === "current" &&
              resident.villa === record.villaNumber,
          )
        );
      }
    }
  }

  function startEditing(recordId: number) {
    setEditingId(recordId);
    setError("");
    setMessage("");
    switch (kind) {
      case "church": {
        const record = lookups.churches.find((item) => item.id === recordId);
        if (!record) return;
        setDraft({
          ...emptyDraft,
          number: record.number ?? "",
          name: record.name ?? "",
          acheshe: record.acheshe ?? "",
          father: record.father ?? "",
        });
        return;
      }
      case "governorate": {
        const record = lookups.governorates.find(
          (item) => item.id === recordId,
        );
        if (!record) return;
        setDraft({
          ...emptyDraft,
          governorate: record.governorate ?? "",
          district: record.district ?? "",
        });
        return;
      }
      case "day": {
        const record = lookups.days.find((item) => item.id === recordId);
        if (!record) return;
        setDraft({ ...emptyDraft, day: record.day ?? "" });
        return;
      }
      case "alternate-category": {
        const record = lookups.alternateCategories.find(
          (item) => item.id === recordId,
        );
        if (!record) return;
        setDraft({ ...emptyDraft, name: record.name ?? "" });
        return;
      }
      case "villa": {
        const record = lookups.villas.find((item) => item.id === recordId);
        if (!record) return;
        setDraft({ ...emptyDraft, villaNumber: record.villaNumber ?? "" });
      }
    }
  }

  function saveDemoRecord() {
    const normalized = (value: string) => value.trim().normalize("NFC");
    const id = editingId ?? nextId(
      kind === "church"
        ? lookups.churches
        : kind === "governorate"
          ? lookups.governorates
          : kind === "day"
            ? lookups.days
              : kind === "alternate-category"
                ? lookups.alternateCategories
                : lookups.villas,
    );
    switch (kind) {
      case "church": {
        const record = {
          id,
          number: normalized(draft.number) || null,
          name: normalized(draft.name),
          acheshe: normalized(draft.acheshe) || null,
          father: normalized(draft.father) || null,
        };
        onLookupsChange({
          ...lookups,
          churches: [
            ...lookups.churches.filter((item) => item.id !== id),
            record,
          ],
        });
        return;
      }
      case "governorate": {
        const record = {
          id,
          governorate: normalized(draft.governorate),
          district: normalized(draft.district),
        };
        onLookupsChange({
          ...lookups,
          governorates: [
            ...lookups.governorates.filter((item) => item.id !== id),
            record,
          ],
        });
        return;
      }
      case "day": {
        const record = { id, day: normalized(draft.day) };
        onLookupsChange({
          ...lookups,
          days: [...lookups.days.filter((item) => item.id !== id), record],
        });
        return;
      }
      case "alternate-category": {
        const record = { id, name: normalized(draft.name) };
        onLookupsChange({
          ...lookups,
          alternateCategories: [
            ...lookups.alternateCategories.filter((item) => item.id !== id),
            record,
          ],
        });
        return;
      }
      case "villa": {
        const record = {
          id,
          villaNumber: normalized(draft.villaNumber),
        };
        onLookupsChange({
          ...lookups,
          villas: [...lookups.villas.filter((item) => item.id !== id), record],
        });
      }
    }
  }

  function cascadeLocalReferences() {
    if (editingId === null) return;
    switch (kind) {
      case "church": {
        const oldName = lookups.churches.find(
          (item) => item.id === editingId,
        )?.name;
        const newName = draft.name.trim().normalize("NFC");
        if (oldName && oldName !== newName) {
          onStaffDataChange({
            ...staffData,
            profiles: staffData.profiles.map((profile) =>
              profile.church === oldName
                ? { ...profile, church: newName }
                : profile,
            ),
          });
        }
        return;
      }
      case "governorate": {
        const oldRecord = lookups.governorates.find(
          (item) => item.id === editingId,
        );
        const newGovernorate = draft.governorate.trim().normalize("NFC");
        const newDistrict = draft.district.trim().normalize("NFC");
        if (
          oldRecord?.governorate &&
          oldRecord.district &&
          (oldRecord.governorate !== newGovernorate ||
            oldRecord.district !== newDistrict)
        ) {
          onStaffDataChange({
            ...staffData,
            profiles: staffData.profiles.map((profile) =>
              profile.governorate === oldRecord.governorate &&
              profile.district === oldRecord.district
                ? {
                    ...profile,
                    governorate: newGovernorate,
                    district: newDistrict,
                  }
                : profile,
            ),
          });
        }
        return;
      }
      case "alternate-category": {
        const oldName = lookups.alternateCategories.find(
          (item) => item.id === editingId,
        )?.name;
        const newName = draft.name.trim().normalize("NFC");
        if (oldName && oldName !== newName) {
          onSalesChange({
            ...sales,
            invoices: sales.invoices.map((invoice) => ({
              ...invoice,
              lines: invoice.lines.map((line) =>
                line.alternateCategory === oldName
                  ? { ...line, alternateCategory: newName }
                  : line,
              ),
            })),
          });
        }
        return;
      }
      case "day":
        return;
      case "villa": {
        const oldNumber = lookups.villas.find(
          (item) => item.id === editingId,
        )?.villaNumber;
        const newNumber = draft.villaNumber.trim().normalize("NFC");
        if (oldNumber && oldNumber !== newNumber) {
          onResidentsChange(
            residents.map((resident) =>
              resident.villa === oldNumber
                ? { ...resident, villa: newNumber }
                : resident,
            ),
          );
        }
        return;
      }
    }
  }

  function buildInput() {
    switch (kind) {
      case "church":
        return {
          kind,
          id: editingId,
          number: draft.number,
          name: draft.name,
          acheshe: draft.acheshe,
          father: draft.father,
        };
      case "governorate":
        return {
          kind,
          id: editingId,
          governorate: draft.governorate,
          district: draft.district,
        };
      case "day":
        return { kind, id: editingId, day: draft.day };
      case "alternate-category":
        return { kind, id: editingId, name: draft.name };
      case "villa":
        return { kind, id: editingId, villaNumber: draft.villaNumber };
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (kind === "villa") {
      const villaNumber = draft.villaNumber.trim().normalize("NFC");
      if (
        lookups.villas.some(
          (item) =>
            item.id !== editingId && item.villaNumber === villaNumber,
        )
      ) {
        setError("رقم الفيلا مسجل بالفعل.");
        return;
      }
    }
    setSaving(true);
    try {
      if (persistent) {
        const result = await saveLookupAction(buildInput());
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onLookupsChange(result.data);
      } else {
        saveDemoRecord();
      }
      cascadeLocalReferences();
      resetForm();
      setMessage("تم حفظ سجل القائمة.");
    } catch {
      setError("تعذر حفظ سجل القائمة. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(recordId: number) {
    setError("");
    setMessage("");
    if (hasReferences(recordId)) {
      setError("لا يمكن حذف هذا السجل لأنه مستخدم في بيانات أخرى.");
      return;
    }
    setSaving(true);
    try {
      if (persistent) {
        const result = await deleteLookupAction({ kind, id: recordId });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onLookupsChange(result.data);
      } else {
        switch (kind) {
          case "church":
            onLookupsChange({
              ...lookups,
              churches: lookups.churches.filter((item) => item.id !== recordId),
            });
            break;
          case "governorate":
            onLookupsChange({
              ...lookups,
              governorates: lookups.governorates.filter(
                (item) => item.id !== recordId,
              ),
            });
            break;
          case "day":
            onLookupsChange({
              ...lookups,
              days: lookups.days.filter((item) => item.id !== recordId),
            });
            break;
          case "alternate-category":
            onLookupsChange({
              ...lookups,
              alternateCategories: lookups.alternateCategories.filter(
                (item) => item.id !== recordId,
              ),
            });
            break;
          case "villa":
            onLookupsChange({
              ...lookups,
              villas: lookups.villas.filter((item) => item.id !== recordId),
            });
            break;
        }
      }
      if (editingId === recordId) resetForm();
      setMessage("تم حذف سجل القائمة.");
    } catch {
      setError("تعذر حذف سجل القائمة. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  const columns =
    kind === "church"
      ? ["رقم الكنيسة", "اسم الكنيسة", "أب الاعتراف", "الأب الكاهن"]
      : kind === "governorate"
        ? ["المحافظة", "المركز / الحي"]
        : kind === "day"
          ? ["اليوم"]
          : kind === "alternate-category"
            ? ["الفئة"]
            : ["رقم الفيلا"];

  const rows =
    kind === "church"
      ? lookups.churches.map((item) => ({
          id: item.id,
          values: [item.number, item.name, item.acheshe, item.father],
        }))
      : kind === "governorate"
        ? lookups.governorates.map((item) => ({
            id: item.id,
            values: [item.governorate, item.district],
          }))
        : kind === "day"
          ? lookups.days.map((item) => ({
              id: item.id,
              values: [item.day],
            }))
          : kind === "alternate-category"
            ? lookups.alternateCategories.map((item) => ({
                id: item.id,
                values: [item.name],
              }))
            : lookups.villas.map((item) => ({
                id: item.id,
                values: [item.villaNumber],
              }));

  const activeResidents = useMemo(
    () => residents.filter((resident) => !resident.archived),
    [residents],
  );
  const selectedResidentChurch = lookups.churches.find(
    (church) => church.name === selectedResident?.church,
  );
  const reverseChurchResidents = activeResidents.filter(
    (resident) => resident.church === reverseChurch,
  );
  const reverseGovernorateResidents = activeResidents.filter(
    (resident) => resident.governorate === reverseGovernorate,
  );
  const governorateOptions = useMemo(
    () =>
      [
        ...new Set(
          activeResidents
            .map((resident) => resident.governorate)
            .filter((value): value is string => Boolean(value)),
        ),
      ]
        .sort((left, right) => left.localeCompare(right, "ar")),
    [activeResidents],
  );
  const selectedReportResidents = activeResidents.filter(
    (resident) => resident.governorate === selectedReportGovernorate,
  );
  const governorateDistribution = useMemo(() => {
    const districts = new Map(
      lookups.governorates
        .filter((item) => item.governorate)
        .map((item) => [item.governorate as string, item.district ?? ""]),
    );
    const groups = new Map<
      string,
      { total: number; current: number; departed: number }
    >();
    for (const resident of residents.filter((item) => !item.archived)) {
      const governorate = resident.governorate?.trim() || "غير محدد";
      const group = groups.get(governorate) ?? {
        total: 0,
        current: 0,
        departed: 0,
      };
      group.total += 1;
      if (resident.status === "current") group.current += 1;
      else group.departed += 1;
      groups.set(governorate, group);
    }
    return [...groups.entries()]
      .map(([governorate, counts]) => ({
        governorate,
        district: districts.get(governorate) ?? "",
        ...counts,
      }))
      .sort((a, b) => b.total - a.total);
  }, [lookups.governorates, residents]);
  const distributionTotal = governorateDistribution.reduce(
    (sum, row) => sum + row.total,
    0,
  );

  return (
    <section className="content-panel lookup-manager-panel" dir="rtl">
      <PrintBrand
        title="البيانات المرجعية"
        subtitle="بحث الكنائس وأب الاعتراف وتوزيع النزلاء حسب المحافظة"
      />
      <div className="panel-heading">
        <div>
          <h3>البيانات المرجعية</h3>
          <p>
            إدارة قوائم Access الأصلية مع إبقاء «الفئة» و«الفئه» منفصلتين.
            تُحدّث أرقام الفيلات المرتبطة بالإقامات عند إعادة التسمية.
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

      <section className="lookup-reference-search">
        <div className="panel-heading">
          <div>
            <h3>البحث في بيانات النزلاء والمرجعيات</h3>
            <p>
              اختر نزيلًا لعرض مرجعه الكنسي والجغرافي، أو اختر كنيسة ومحافظة
              لعرض النزلاء المرتبطين بهما.
            </p>
          </div>
        </div>
        <div className="lookup-form">
          <label className="form-field">
            اسم النزيل
            <ResidentPicker
              residents={activeResidents}
              value={residentQuery}
              onChange={(value, resident) => {
                setResidentQuery(value);
                setSelectedResident(resident);
              }}
              placeholder="ابحث واختر نزيلًا..."
            />
          </label>
        </div>
        {selectedResident && (
          <div className="resident-report-summary report-summary">
            <article>
              <span>الكنيسة</span>
              <strong>{selectedResident.church || "غير مسجل"}</strong>
            </article>
            <article>
              <span>أب الاعتراف</span>
              <strong>
                {selectedResidentChurch?.acheshe ||
                  selectedResident.confessor ||
                  "غير مسجل"}
              </strong>
            </article>
            <article>
              <span>الأب الكاهن</span>
              <strong>{selectedResidentChurch?.father || "غير مسجل"}</strong>
            </article>
            <article>
              <span>رقم الكنيسة</span>
              <strong>{selectedResidentChurch?.number || "غير مسجل"}</strong>
            </article>
            <article>
              <span>المحافظة</span>
              <strong>{selectedResident.governorate || "غير مسجل"}</strong>
            </article>
            <article>
              <span>الفيلا</span>
              <strong>{selectedResident.villa || "غير مسجل"}</strong>
            </article>
          </div>
        )}
        <div className="lookup-form">
          <label className="form-field">
            الكنيسة
            <select
              value={reverseChurch}
              onChange={(event) => setReverseChurch(event.target.value)}
            >
              <option value="">اختر كنيسة</option>
              {lookups.churches.map((church) =>
                church.name ? (
                  <option key={church.id} value={church.name}>
                    {church.name}
                  </option>
                ) : null,
              )}
            </select>
          </label>
          <label className="form-field">
            المحافظة
            <select
              value={reverseGovernorate}
              onChange={(event) => setReverseGovernorate(event.target.value)}
            >
              <option value="">اختر محافظة</option>
              {governorateOptions.map((governorate) => (
                <option key={governorate} value={governorate}>
                  {governorate}
                </option>
              ))}
            </select>
          </label>
        </div>
        {reverseChurch && (
          <div className="lookup-count" aria-live="polite">
            {numberFormatter.format(reverseChurchResidents.length)} نزيل في{" "}
            {reverseChurch || "الكنيسة المختارة"}
          </div>
        )}
        {reverseChurch && (
          <div className="table-wrap report-detail">
            <table className="resident-table lookup-table">
              <thead>
                <tr>
                  <th>اسم النزيل</th>
                  <th>رقم الملف</th>
                  <th>الحالة</th>
                  <th>المحافظة</th>
                  <th>الفيلا</th>
                </tr>
              </thead>
              <tbody>
                {reverseChurchResidents.map((resident) => (
                  <tr key={resident.id}>
                    <td>{resident.name}</td>
                    <td>{resident.fileNumber}</td>
                    <td>{resident.status === "current" ? "مقيم" : "غادر"}</td>
                    <td>{resident.governorate || "—"}</td>
                    <td>{resident.villa || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!reverseChurchResidents.length && (
              <div className="empty-state">لا يوجد نزلاء مرتبطون بهذه الكنيسة.</div>
            )}
          </div>
        )}
        {reverseGovernorate && (
          <div className="lookup-count" aria-live="polite">
            {numberFormatter.format(reverseGovernorateResidents.length)} نزيل في{" "}
            {reverseGovernorate}
          </div>
        )}
        {reverseGovernorate && (
          <div className="table-wrap report-detail">
            <table className="resident-table lookup-table">
              <thead>
                <tr>
                  <th>اسم النزيل</th>
                  <th>رقم الملف</th>
                  <th>الحالة</th>
                  <th>الكنيسة</th>
                  <th>الفيلا</th>
                </tr>
              </thead>
              <tbody>
                {reverseGovernorateResidents.map((resident) => (
                  <tr key={resident.id}>
                    <td>{resident.name}</td>
                    <td>{resident.fileNumber}</td>
                    <td>{resident.status === "current" ? "مقيم" : "غادر"}</td>
                    <td>{resident.church || "—"}</td>
                    <td>{resident.villa || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!reverseGovernorateResidents.length && (
              <div className="empty-state">لا يوجد نزلاء في هذه المحافظة.</div>
            )}
          </div>
        )}
      </section>

      <section className="lookup-governorate-report">
        <div className="panel-heading">
          <div>
            <h3>تقرير توزيع النزلاء حسب المحافظة</h3>
            <p>اضغط على اسم المحافظة لعرض نزلائها.</p>
          </div>
        </div>
        <div className="resident-report-summary report-summary">
          <article>
            <span>إجمالي النزلاء</span>
            <strong>{numberFormatter.format(distributionTotal)}</strong>
          </article>
          <article>
            <span>عدد المحافظات</span>
            <strong>{numberFormatter.format(governorateDistribution.length)}</strong>
          </article>
          <article>
            <span>المقيمون</span>
            <strong>
              {numberFormatter.format(
                governorateDistribution.reduce(
                  (sum, row) => sum + row.current,
                  0,
                ),
              )}
            </strong>
          </article>
          <article>
            <span>الغادرون</span>
            <strong>
              {numberFormatter.format(
                governorateDistribution.reduce(
                  (sum, row) => sum + row.departed,
                  0,
                ),
              )}
            </strong>
          </article>
        </div>
        <div className="table-wrap report-detail">
          <table className="resident-table lookup-table">
            <thead>
              <tr>
                <th>المحافظة</th>
                <th>المركز / الحي</th>
                <th>عدد النزلاء</th>
                <th>المقيمون</th>
                <th>الغادرون</th>
                <th>النسبة</th>
              </tr>
            </thead>
            <tbody>
              {governorateDistribution.map((row) => (
                <tr key={row.governorate}>
                  <td>
                    <button
                      className="table-action"
                      type="button"
                      aria-pressed={selectedReportGovernorate === row.governorate}
                      onClick={() =>
                        setSelectedReportGovernorate(
                          selectedReportGovernorate === row.governorate
                            ? ""
                            : row.governorate,
                        )
                      }
                    >
                      {row.governorate}
                    </button>
                  </td>
                  <td>{row.district || "—"}</td>
                  <td>{numberFormatter.format(row.total)}</td>
                  <td>{numberFormatter.format(row.current)}</td>
                  <td>{numberFormatter.format(row.departed)}</td>
                  <td>
                    {distributionTotal
                      ? `${numberFormatter.format(
                          Math.round((row.total / distributionTotal) * 100),
                        )}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!governorateDistribution.length && (
            <div className="empty-state">لا توجد بيانات نزلاء بعد.</div>
          )}
        </div>
        {selectedReportGovernorate && (
          <div className="table-wrap report-detail">
            <h4>
              نزلاء محافظة {selectedReportGovernorate} (
              {numberFormatter.format(selectedReportResidents.length)})
            </h4>
            <table className="resident-table lookup-table">
              <thead>
                <tr>
                  <th>اسم النزيل</th>
                  <th>رقم الملف</th>
                  <th>الحالة</th>
                  <th>الفيلا</th>
                </tr>
              </thead>
              <tbody>
                {selectedReportResidents.map((resident) => (
                  <tr key={resident.id}>
                    <td>{resident.name}</td>
                    <td>{resident.fileNumber}</td>
                    <td>{resident.status === "current" ? "مقيم" : "غادر"}</td>
                    <td>{resident.villa || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="lookup-tabs" role="tablist" aria-label="قوائم البيانات">
        {lookupKinds.map((item) => (
          <button
            aria-selected={kind === item.key}
            className={kind === item.key ? "active" : ""}
            key={item.key}
            onClick={() => changeKind(item.key)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {!persistent && (
        <p className="lookup-demo-note">
          بيانات تجريبية فقط؛ التغييرات لا تُحفظ بعد تحديث الصفحة.
        </p>
      )}
      {!isAdministrator && (
        <p className="lookup-demo-note">
          {kind === "villa" && currentUser.canEdit
            ? "يمكنك إدارة أرقام الفيلات بصلاحية تعديل النزلاء؛ بقية القوائم للأدمن فقط."
            : "لديك صلاحية عرض فقط. يضيف المسؤول القيم ويعدلها ويحذفها."}
        </p>
      )}

      {canManageCurrentKind && (
        <form className="lookup-form" onSubmit={submit}>
          {kind === "church" && (
            <>
              <label className="form-field">
                رقم الكنيسة
                <input
                  maxLength={255}
                  value={draft.number}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      number: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="form-field">
                اسم الكنيسة
                <input
                  maxLength={255}
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="form-field">
                أب الاعتراف
                <input
                  maxLength={255}
                  value={draft.acheshe}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      acheshe: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="form-field">
                الأب الكاهن
                <input
                  maxLength={255}
                  value={draft.father}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      father: event.target.value,
                    }))
                  }
                />
              </label>
            </>
          )}
          {kind === "governorate" && (
            <>
              <label className="form-field">
                المحافظة
                <input
                  maxLength={255}
                  required
                  value={draft.governorate}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      governorate: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="form-field">
                المركز / الحي
                <input
                  maxLength={255}
                  required
                  value={draft.district}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      district: event.target.value,
                    }))
                  }
                />
              </label>
            </>
          )}
          {kind === "day" && (
            <label className="form-field">
              اليوم
              <input
                maxLength={255}
                required
                value={draft.day}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    day: event.target.value,
                  }))
                }
              />
            </label>
          )}
          {kind === "alternate-category" && (
            <label className="form-field">
              الفئة (جدول الفئه)
              <input
                maxLength={255}
                required
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
          )}
          {kind === "villa" && (
            <label className="form-field">
              رقم الفيلا
              <input
                maxLength={64}
                required
                value={draft.villaNumber}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    villaNumber: event.target.value,
                  }))
                }
              />
            </label>
          )}
          <div className="lookup-form-actions">
            <button className="primary-button" disabled={saving} type="submit">
              {saving
                ? "جارٍ الحفظ..."
                : editingId === null
                  ? "إضافة"
                  : "حفظ التعديل"}
            </button>
            {editingId !== null && (
              <button
                className="secondary-button"
                disabled={saving}
                onClick={resetForm}
                type="button"
              >
                إلغاء التعديل
              </button>
            )}
          </div>
        </form>
      )}

      {error && (
        <p className="lookup-message error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="lookup-message success" role="status">
          {message}
        </p>
      )}

      <div className="table-wrap">
        <table className="resident-table lookup-table">
          <thead>
            <tr>
              {columns.map((column) => <th key={column}>{column}</th>)}
              {canManageCurrentKind && <th>الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {row.values.map((value, index) => (
                  <td key={`${row.id}-${index}`}>{value || "—"}</td>
                ))}
                {canManageCurrentKind && (
                  <td className="lookup-row-actions">
                    <button
                      className="table-action"
                      disabled={saving}
                      onClick={() => startEditing(row.id)}
                      type="button"
                    >
                      تعديل
                    </button>
                    <button
                      className="table-action danger"
                      disabled={saving || hasReferences(row.id)}
                      onClick={() => remove(row.id)}
                      title={
                        hasReferences(row.id)
                          ? "لا يمكن الحذف لأن القيمة مستخدمة."
                          : undefined
                      }
                      type="button"
                    >
                      حذف
                    </button>
                    {hasReferences(row.id) && (
                      <span className="lookup-in-use">مستخدم</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty-state">لا توجد سجلات.</div>}
      </div>
      {kind === "day" && (
        <p className="lookup-footer">
          اليوم في الفواتير يُستخرج تلقائيًا من تاريخ الفاتورة.
        </p>
      )}
      {kind === "villa" && (
        <p className="lookup-footer">
          القيم غير المسجلة لا تُقبل للإقامات الجديدة، ولا تُحذف قيمة مستخدمة.
        </p>
      )}
      <span className="lookup-count" aria-live="polite">
        {numberFormatter.format(rows.length)} سجل
      </span>
    </section>
  );
}
