"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  deleteLookupAction,
  saveLookupAction,
} from "@/app/actions/lookups";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
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
  const [referenceSearch, setReferenceSearch] = useState("");

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
          residents.some((resident) => resident.villa === record.villaNumber)
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
      ? ["num", "nam", "Achesh", "Fathr"]
      : kind === "governorate"
        ? ["Cont", "Cet"]
        : kind === "day"
          ? ["اليوم"]
          : kind === "alternate-category"
            ? ["الفئة"]
            : ["N_V"];

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

  const referenceTerm = referenceSearch.trim().toLocaleLowerCase();
  const filteredChurches = useMemo(
    () =>
      lookups.churches.filter((church) =>
        [church.number, church.name, church.acheshe, church.father]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(referenceTerm),
      ),
    [lookups.churches, referenceTerm],
  );
  const filteredGovernorates = useMemo(
    () =>
      lookups.governorates.filter((governorate) =>
        [governorate.governorate, governorate.district]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(referenceTerm),
      ),
    [lookups.governorates, referenceTerm],
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
    for (const resident of residents) {
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
            <h3>بحث الكنائس وأب الاعتراف</h3>
            <p>
              ابحث باسم الكنيسة أو رقمها أو أب الاعتراف، وابحث في المحافظات
              والمراكز. يعرض الجدول عدد النزلاء المسجلين في كل محافظة.
            </p>
          </div>
        </div>
        <label className="form-field">
          بحث في الكنائس والمحافظات
          <input
            type="search"
            value={referenceSearch}
            maxLength={160}
            placeholder="مثال: كنيسة، أب اعتراف، محافظة، مركز..."
            onChange={(event) => setReferenceSearch(event.target.value)}
          />
        </label>
        {referenceTerm && (
          <>
            <div className="table-wrap report-detail">
              <table className="resident-table lookup-table">
                <thead>
                  <tr>
                    <th>رقم الكنيسة</th>
                    <th>اسم الكنيسة</th>
                    <th>Achesh</th>
                    <th>أب الاعتراف</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredChurches.slice(0, 10).map((church) => (
                    <tr key={`church-${church.id}`}>
                      <td>{church.number || "—"}</td>
                      <td>{church.name || "—"}</td>
                      <td>{church.acheshe || "—"}</td>
                      <td>{church.father || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredChurches.length && (
                <div className="empty-state">لا توجد كنائس مطابقة.</div>
              )}
            </div>
            <div className="table-wrap report-detail">
              <table className="resident-table lookup-table">
                <thead>
                  <tr>
                    <th>المحافظة</th>
                    <th>المركز / الحي</th>
                    <th>عدد النزلاء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGovernorates.slice(0, 10).map((governorate) => {
                    const count = residents.filter(
                      (resident) =>
                        (resident.governorate ?? "") ===
                        (governorate.governorate ?? ""),
                    ).length;
                    return (
                      <tr key={`governorate-${governorate.id}`}>
                        <td>{governorate.governorate || "—"}</td>
                        <td>{governorate.district || "—"}</td>
                        <td>{numberFormatter.format(count)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!filteredGovernorates.length && (
                <div className="empty-state">لا توجد محافظات مطابقة.</div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="lookup-governorate-report">
        <div className="panel-heading">
          <div>
            <h3>تقرير توزيع النزلاء حسب المحافظة</h3>
            <p>
              ملخص بعدد النزلاء والمقيمين والغادرين في كل محافظة، مع التفاصيل
              الكاملة أسفل الملخص.
            </p>
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
                  <td>{row.governorate}</td>
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
          لديك صلاحية عرض فقط. يضيف المسؤول القيم ويعدلها ويحذفها.
        </p>
      )}

      {isAdministrator && (
        <form className="lookup-form" onSubmit={submit}>
          {kind === "church" && (
            <>
              <label className="form-field">
                num
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
                nam
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
                Achesh
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
                Fathr
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
                المحافظة (Cont)
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
                المركز / الحي (Cet)
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
              رقم الفيلا (N_V)
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
              {isAdministrator && <th>الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {row.values.map((value, index) => (
                  <td key={`${row.id}-${index}`}>{value || "—"}</td>
                ))}
                {isAdministrator && (
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
