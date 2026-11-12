"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  deleteLookupAction,
  saveLookupAction,
} from "@/app/actions/lookups";
import { getResidentStayReportAction } from "@/app/actions/resident-stay-report";
import PrintBrand from "@/components/print-brand";
import { printCurrentView } from "@/lib/print";
import {
  canonicalRoom,
  canonicalVilla,
  formatRoom,
  formatVilla,
} from "@/lib/stay-location";
import {
  canViewResidentChurchData,
  hasScreenAccess,
} from "@/lib/access-control";
import { normalizeArabicName } from "@/lib/resident-matching";
import ResidentPicker from "@/components/resident-picker";
import type { DemoUser, Resident } from "@/lib/demo-data";
import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";
import type { StaffBundle } from "@/lib/staff-types";
import type { ResidentStayReportRow } from "@/lib/resident-stay-report-types";
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
  initialReferenceTab?: string | null;
  onLookupsChange: (lookups: LookupData) => void;
  onResidentsChange: (residents: Resident[]) => void;
  onStaffDataChange: (staffData: StaffBundle) => void;
  onSalesChange: (sales: CanteenSalesBundle) => void;
};

type LookupDraft = {
  number: string;
  name: string;
  acheshe: string;
  governorate: string;
  district: string;
  day: string;
  villaNumber: string;
};

const emptyDraft: LookupDraft = {
  number: "",
  name: "",
  acheshe: "",
  governorate: "",
  district: "",
  day: "",
  villaNumber: "",
};

const lookupKinds: { key: LookupKind; label: string }[] = [
  { key: "church", label: "الكنائس وأب الاعتراف" },
  { key: "governorate", label: "المحافظة" },
  { key: "day", label: "أيام الفواتير" },
  { key: "alternate-category", label: "فئات الفواتير" },
  { key: "villa", label: "الفيلا" },
  { key: "room", label: "الغرف" },
];

const numberFormatter = new Intl.NumberFormat("ar-EG");
const referenceTabs = [
  { key: "resident", label: "بحث النزلاء" },
  { key: "church", label: "حسب الكنيسة وأب الاعتراف" },
  { key: "governorate", label: "حسب المحافظة" },
  { key: "period", label: "الدخول خلال فترة" },
  { key: "villa", label: "الفيلا والغرف" },
] as const;
type ReferenceTab = (typeof referenceTabs)[number]["key"];
type PeriodMode = "day" | "range";

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeChurchName(value: string | null | undefined) {
  return normalizeArabicName(value);
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function nextId(rows: { id: number }[]) {
  return Math.max(0, ...rows.map((row) => row.id)) + 1;
}

function ResidentTable({
  rows,
  emptyMessage,
  columns,
}: {
  rows: Resident[];
  emptyMessage: string;
  columns: {
    key: "governorate" | "district" | "villa" | "room";
    label: string;
  }[];
}) {
  return (
    <div className="table-wrap report-detail">
      <table className="resident-table lookup-table">
        <thead>
          <tr>
            <th>اسم النزيل</th>
            <th>رقم الملف</th>
            <th>الحالة</th>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((resident) => (
            <tr key={resident.id}>
              <td>{resident.name}</td>
              <td>{resident.fileNumber}</td>
              <td>{resident.status === "current" ? "مقيم" : "غادر"}</td>
              {columns.map((column) => (
                <td key={`${resident.id}-${column.key}`}>{resident[column.key] || "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty-state">{emptyMessage}</div>}
    </div>
  );
}

export default function LookupManagerPanel({
  lookups,
  residents,
  staffData,
  sales,
  currentUser,
  persistent,
  initialReferenceTab,
  onLookupsChange,
  onResidentsChange,
  onStaffDataChange,
  onSalesChange,
}: Props) {
  const isAdministrator = currentUser.role === "admin";
  const [kind, setKind] = useState<LookupKind>("church");
  const [referenceTab, setReferenceTab] = useState<ReferenceTab>(() => {
    const requestedTab =
      referenceTabs.find((tab) => tab.key === initialReferenceTab)?.key ??
      "resident";
    return requestedTab;
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<LookupDraft>(emptyDraft);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [managementOpen, setManagementOpen] = useState(
    () => initialReferenceTab === "manage" && isAdministrator,
  );
  const [residentQuery, setResidentQuery] = useState("");
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [reverseChurch, setReverseChurch] = useState("");
  const [reverseConfessor, setReverseConfessor] = useState("");
  const [selectedReportGovernorate, setSelectedReportGovernorate] = useState("");
  const [selectedVilla, setSelectedVilla] = useState("");
  const [periodStart, setPeriodStart] = useState(() =>
    localDateValue(new Date()),
  );
  const [periodEnd, setPeriodEnd] = useState(() =>
    localDateValue(new Date()),
  );
  const [periodMode, setPeriodMode] = useState<PeriodMode>("day");
  const [appliedPeriod, setAppliedPeriod] = useState(() => ({
    mode: "day" as PeriodMode,
    startDate: localDateValue(new Date()),
    endDate: localDateValue(new Date()),
  }));
  const [periodRows, setPeriodRows] = useState<ResidentStayReportRow[]>([]);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState("");
  const canManageCurrentKind = isAdministrator && kind !== "church";
  const canViewResidentReferences = canViewResidentChurchData(
    currentUser.role,
    currentUser.allowedScreens ?? [],
    currentUser.canEdit,
  );
  const canViewPeriodReport =
    isAdministrator ||
    hasScreenAccess(
      currentUser.role,
      currentUser.allowedScreens ?? [],
      "resident-stay-reports",
    );

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
              canonicalVilla(resident.villa) ===
              canonicalVilla(record.villaNumber),
          )
        );
      }
      case "room": {
        const record = lookups.rooms.find((item) => item.id === recordId);
        return (
          !!record?.villaNumber &&
          residents.some(
            (resident) =>
              canonicalRoom(resident.room) ===
              canonicalRoom(record.villaNumber),
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
        setDraft({
          ...emptyDraft,
          villaNumber: canonicalVilla(record.villaNumber),
        });
        return;
      }
      case "room": {
        const record = lookups.rooms.find((item) => item.id === recordId);
        if (!record) return;
        setDraft({
          ...emptyDraft,
          villaNumber: formatRoom(record.villaNumber),
        });
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
                : kind === "villa"
                  ? lookups.villas
                  : lookups.rooms,
    );
    switch (kind) {
      case "church": {
        const record = {
          id,
          number: normalized(draft.number) || null,
          name: normalized(draft.name),
          acheshe: normalized(draft.acheshe) || null,
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
          villaNumber: canonicalVilla(draft.villaNumber),
        };
        onLookupsChange({
          ...lookups,
          villas: [...lookups.villas.filter((item) => item.id !== id), record],
        });
        return;
      }
      case "room": {
        const record = {
          id,
          villaNumber: formatRoom(draft.villaNumber),
        };
        onLookupsChange({
          ...lookups,
          rooms: [...lookups.rooms.filter((item) => item.id !== id), record],
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
        const newNumber = canonicalVilla(draft.villaNumber);
        if (
          oldNumber &&
          newNumber &&
          canonicalVilla(oldNumber) !== newNumber
        ) {
          onResidentsChange(
            residents.map((resident) =>
              canonicalVilla(resident.villa) === canonicalVilla(oldNumber)
                ? { ...resident, villa: newNumber }
                : resident,
            ),
          );
        }
        return;
      }
      case "room": {
        const oldNumber = lookups.rooms.find(
          (item) => item.id === editingId,
        )?.villaNumber;
        const newNumber = formatRoom(draft.villaNumber);
        if (
          oldNumber &&
          newNumber &&
          canonicalRoom(oldNumber) !== canonicalRoom(newNumber)
        ) {
          onResidentsChange(
            residents.map((resident) =>
              canonicalRoom(resident.room) === canonicalRoom(oldNumber)
                ? { ...resident, room: newNumber }
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
        return {
          kind,
          id: editingId,
          villaNumber: canonicalVilla(draft.villaNumber),
        };
      case "room":
        return {
          kind,
          id: editingId,
          villaNumber: formatRoom(draft.villaNumber),
        };
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
          case "room":
            onLookupsChange({
              ...lookups,
              rooms: lookups.rooms.filter((item) => item.id !== recordId),
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

  const activeResidents = useMemo(
    () => residents.filter((resident) => !resident.archived),
    [residents],
  );
  const churchResidentReferences = useMemo(() => {
    const references = new Map<string, { church: string; confessor: string; count: number }>();
    for (const resident of activeResidents) {
      const church = resident.church?.trim() ?? "";
      const confessor = resident.confessor?.trim() ?? "";
      if (!church && !confessor) continue;
      const key = `${normalizeChurchName(church)}\u0000${normalizeChurchName(confessor)}`;
      const current = references.get(key);
      if (current) current.count += 1;
      else references.set(key, { church, confessor, count: 1 });
    }
    return [...references.values()].sort((left, right) =>
      left.church.localeCompare(right.church, "ar") ||
      left.confessor.localeCompare(right.confessor, "ar"),
    );
  }, [activeResidents]);
  const residentChurchOptions = useMemo(
    () => [...new Map(activeResidents
      .map((resident) => resident.church?.trim() ?? "")
      .filter(Boolean)
      .map((name) => [normalizeChurchName(name), name] as const)).values()]
      .sort((left, right) => left.localeCompare(right, "ar")),
    [activeResidents],
  );
  const columns =
    kind === "church"
      ? ["الكنيسة المسجلة بملفات النزلاء", "أب الاعتراف", "عدد النزلاء"]
      : kind === "governorate"
        ? ["المحافظة", "المركز / الحي"]
        : kind === "day"
          ? ["اليوم"]
          : kind === "alternate-category"
            ? ["الفئة"]
            : ["رقم الفيلا"];

  const rows =
    kind === "church"
      ? churchResidentReferences.map((item, index) => ({
          id: index + 1,
          values: [item.church, item.confessor, numberFormatter.format(item.count)],
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
            : (kind === "villa" ? lookups.villas : lookups.rooms).map((item) => ({
                id: item.id,
                values: [item.villaNumber],
              }));

  const reverseChurchResidents = activeResidents.filter(
    (resident) =>
        (!reverseChurch ||
          normalizeChurchName(resident.church)
            .includes(normalizeChurchName(reverseChurch))) &&
        (!reverseConfessor ||
          normalizeChurchName(resident.confessor)
            .includes(normalizeChurchName(reverseConfessor))) &&
      Boolean(reverseChurch || reverseConfessor),
  );
  const governorateGroups = useMemo(() => {
    const groups = new Map<string, Resident[]>();
    for (const resident of activeResidents) {
      const governorate = resident.governorate?.trim() || "غير محدد";
      const group = groups.get(governorate) ?? [];
      group.push(resident);
      groups.set(governorate, group);
    }
    return [...groups.entries()]
      .map(([governorate, rows]) => ({
        governorate,
        rows: rows.sort((left, right) => left.name.localeCompare(right.name, "ar")),
      }))
      .sort((left, right) => left.governorate.localeCompare(right.governorate, "ar"));
  }, [activeResidents]);
  const visibleGovernorateGroups = selectedReportGovernorate
    ? governorateGroups.filter((group) => group.governorate === selectedReportGovernorate)
    : governorateGroups;
  const confessorOptions = useMemo(
    () => [...new Map(activeResidents
      .map((resident) => resident.confessor?.trim() ?? "")
      .filter(Boolean)
      .map((name) => [normalizeChurchName(name), name] as const)).values()]
      .sort((left, right) => left.localeCompare(right, "ar")),
    [activeResidents],
  );
  const selectedVillaResidents = activeResidents
    .filter(
      (resident) =>
        canonicalVilla(resident.villa) === canonicalVilla(selectedVilla) &&
        resident.status === "current",
    )
    .sort((left, right) =>
      left.room.localeCompare(right.room, "ar", { numeric: true }),
    );
  const villaOptions = useMemo(
    () =>
      [
        ...new Set([
          ...lookups.villas
            .map((item) => item.villaNumber?.trim() ?? "")
            .filter(Boolean),
          ...activeResidents
            .map((resident) => canonicalVilla(resident.villa))
            .filter(Boolean),
        ]),
      ].sort((left, right) => left.localeCompare(right, "ar", { numeric: true })),
    [activeResidents, lookups.villas],
  );
  const governorateDistribution = useMemo(() => {
    const districts = new Map<string, Set<string>>();
    for (const item of lookups.governorates) {
      const governorate = item.governorate?.trim();
      const district = item.district?.trim();
      if (!governorate || !district) continue;
      const values = districts.get(governorate) ?? new Set<string>();
      values.add(district);
      districts.set(governorate, values);
    }
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
        district: [...(districts.get(governorate) ?? [])].join("، "),
        ...counts,
      }))
      .sort((a, b) => b.total - a.total);
  }, [lookups.governorates, residents]);
  const distributionTotal = governorateDistribution.reduce(
    (sum, row) => sum + row.total,
    0,
  );

  useEffect(() => {
    if (referenceTab !== "period" || !canViewPeriodReport) return;
    let active = true;

    async function loadPeriodRows() {
      try {
        const result = persistent
          ? await getResidentStayReportAction({
              startDate: appliedPeriod.startDate,
              endDate: appliedPeriod.endDate,
              villa: "",
              room: "",
              search: "",
              includeArchived: false,
            })
          : {
              rows: activeResidents
                .filter(
                  (resident) =>
                    resident.admissionDate >= appliedPeriod.startDate &&
                    resident.admissionDate <= appliedPeriod.endDate,
                )
                .map((resident) => ({
                  stayId: resident.id,
                  fileNumber: resident.fileNumber,
                  residentName: resident.name,
                  birthDate: "",
                  admissionDate: resident.admissionDate,
                  exitDate: resident.exitDate,
                  villa: resident.villa,
                  room: resident.room,
                  archived: resident.archived,
                })),
            };
        if (active) setPeriodRows(result.rows);
      } catch {
        if (active) {
          setPeriodRows([]);
          setPeriodError("تعذر تحميل تقرير الدخول لهذه الفترة.");
        }
      } finally {
        if (active) setPeriodLoading(false);
      }
    }

    void loadPeriodRows();
    return () => {
      active = false;
    };
  }, [
    activeResidents,
    appliedPeriod,
    canViewPeriodReport,
    persistent,
    referenceTab,
  ]);

  function downloadCsv(
    filename: string,
    headers: string[],
    rows: (string | number)[][],
  ) {
    const contents = [headers, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", contents], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function printSelectedReport() {
    document.body.classList.add("lookup-report-print");
    const cleanup = () => {
      document.body.classList.remove("lookup-report-print");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    printCurrentView();
  }

  function exportSelectedReport() {
    switch (referenceTab) {
      case "resident":
        if (!selectedResident) return;
        downloadCsv(
          "resident-reference.csv",
          ["الاسم", "رقم الملف", "الكنيسة", "أب الاعتراف", "المحافظة", "المركز / الحي", "الفيلا", "الغرفة", "تاريخ الدخول", "تاريخ الخروج", "الحالة"],
          [[
            selectedResident.name,
            selectedResident.fileNumber,
            selectedResident.church,
            selectedResident.confessor,
            selectedResident.governorate ?? "",
            selectedResident.district,
            selectedResident.villa,
            selectedResident.room,
            selectedResident.admissionDate,
            selectedResident.exitDate,
            selectedResident.status === "current" ? "مقيم" : "غادر",
          ]],
        );
        return;
      case "church":
        if (!reverseChurch && !reverseConfessor) return;
        downloadCsv(
          "church-residents.csv",
          ["الاسم", "رقم الملف", "الكنيسة", "أب الاعتراف", "الحالة", "المحافظة", "المركز / الحي", "الفيلا", "الغرفة"],
          reverseChurchResidents.map((resident) => [
            resident.name,
            resident.fileNumber,
            resident.church,
            resident.confessor,
            resident.status === "current" ? "مقيم" : "غادر",
            resident.governorate ?? "",
            resident.district,
            resident.villa,
            resident.room,
          ]),
        );
        return;
      case "governorate":
        downloadCsv(
          "governorate-residents.csv",
          ["المحافظة", "اسم النزيل", "رقم الملف", "الحالة", "المركز / الحي", "الفيلا", "الغرفة"],
          visibleGovernorateGroups.flatMap((group) =>
            group.rows.map((resident) => [
              group.governorate,
              resident.name,
              resident.fileNumber,
              resident.status === "current" ? "مقيم" : "غادر",
              resident.district,
              resident.villa,
              resident.room,
            ]),
          ),
        );
        return;
      case "period":
        downloadCsv(
          "resident-admissions.csv",
          ["اسم النزيل", "رقم الملف", "تاريخ الدخول", "تاريخ الخروج", "الفيلا", "الغرفة"],
          periodRows.map((row) => [
            row.residentName,
            row.fileNumber,
            row.admissionDate,
            row.exitDate,
            row.villa,
            row.room,
          ]),
        );
        return;
      case "villa":
        if (!selectedVilla) return;
        downloadCsv(
          "villa-occupancy.csv",
          ["الفيلا", "الغرفة", "اسم النزيل", "رقم الملف", "الحالة"],
          selectedVillaResidents.map((resident) => [
            resident.villa,
            resident.room,
            resident.name,
            resident.fileNumber,
            resident.status === "current" ? "مقيم" : "غادر",
          ]),
        );
        return;
    }
  }

  const canExportSelectedReport =
    (referenceTab === "period"
      ? canViewPeriodReport && periodRows.length > 0
      : canViewResidentReferences) &&
    ((referenceTab === "resident" && Boolean(selectedResident)) ||
      (referenceTab === "church" && Boolean(reverseChurch || reverseConfessor)) ||
      (referenceTab === "governorate" && governorateDistribution.length > 0) ||
      (referenceTab === "period" && periodRows.length > 0) ||
      (referenceTab === "villa" && Boolean(selectedVilla)));
  const canPrintSelectedReport =
    referenceTab === "period"
      ? canViewPeriodReport
      : canViewResidentReferences;
  const reportTitle =
    referenceTabs.find((tab) => tab.key === referenceTab)?.label ??
    "البيانات المرجعية";

  return (
    <section className="content-panel lookup-manager-panel" dir="rtl">
      <div className="lookup-report-print-area">
      <PrintBrand
        title={reportTitle}
        subtitle="تقارير النزلاء والمرجعيات"
      />
      <div className="panel-heading">
        <div>
          <h3>البحث والتقارير</h3>
          <p>ابحث عن نزيل أو اعرض تقارير الكنائس والمحافظات والسكن، ثم اطبعها أو نزّلها.</p>
        </div>
        <div className="resident-report-actions no-print">
          <button
            className="secondary-button"
            type="button"
            disabled={!canExportSelectedReport}
            onClick={exportSelectedReport}
          >
            تنزيل التقرير CSV
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!canPrintSelectedReport}
            onClick={printSelectedReport}
          >
            طباعة التقرير
          </button>
          {isAdministrator && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setManagementOpen(true);
                window.setTimeout(
                  () => document.getElementById("lookup-admin-management")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                  0,
                );
              }}
            >
              إعدادات القوائم
            </button>
          )}
        </div>
      </div>

      <nav className="lookup-report-tabs no-print" aria-label="نوع التقرير">
        {referenceTabs
          .map((tab) => (
            <button
              aria-current={referenceTab === tab.key ? "page" : undefined}
              className={referenceTab === tab.key ? "active" : ""}
              key={tab.key}
              onClick={() => {
                if (
                  tab.key === "period" &&
                  canViewPeriodReport &&
                  referenceTab !== "period"
                ) {
                  setPeriodLoading(true);
                  setPeriodError("");
                }
                setReferenceTab(tab.key);
              }}
              type="button"
            >
              {tab.label}
            </button>
          ))}
      </nav>

      <div className="lookup-report-content">
        {!canViewResidentReferences && referenceTab !== "period" ? (
          <div className="empty-state">
            تقارير الكنائس وبياناتها متاحة للأدمن والموظف المصرح له بتعديل
            بيانات النزلاء فقط.
          </div>
        ) : (
          <>
            {referenceTab === "resident" && (
              <section className="lookup-report-section">
                <h3>تقرير شخص واحد</h3>
                <p>ابحث بالاسم أو رقم الملف واختر النزيل لعرض بياناته المرجعية.</p>
                <label className="form-field">
                  النزيل
                  <ResidentPicker
                    residents={activeResidents}
                    value={residentQuery}
                    onChange={(value, resident) => {
                      setResidentQuery(value);
                      setSelectedResident(resident);
                    }}
                    placeholder="اكتب الاسم أو رقم الملف ثم اختر من القائمة"
                  />
                </label>
                {selectedResident ? (
                  <div className="resident-report-summary report-summary">
                    <article><span>الاسم</span><strong>{selectedResident.name}</strong></article>
                    <article><span>رقم الملف</span><strong>{selectedResident.fileNumber}</strong></article>
                    <article><span>الكنيسة</span><strong>{selectedResident.church || "غير مسجل"}</strong></article>
                    <article><span>أب الاعتراف</span><strong>{selectedResident.confessor || "غير مسجل"}</strong></article>
                    <article><span>المحافظة</span><strong>{selectedResident.governorate || "غير مسجل"}</strong></article>
                    <article><span>المركز / الحي</span><strong>{selectedResident.district || "غير مسجل"}</strong></article>
                    <article><span>الفيلا / الغرفة</span><strong>{[selectedResident.villa, selectedResident.room].filter(Boolean).join(" / ") || "غير مسجل"}</strong></article>
                    <article><span>تاريخ الدخول</span><strong>{selectedResident.admissionDate || "غير مسجل"}</strong></article>
                    <article><span>تاريخ الخروج</span><strong>{selectedResident.exitDate || "—"}</strong></article>
                    <article><span>الحالة</span><strong>{selectedResident.status === "current" ? "مقيم" : "غادر"}</strong></article>
                  </div>
                ) : (
                  <div className="empty-state">اختر نزيلًا لعرض تقريره.</div>
                )}
              </section>
            )}

            {referenceTab === "church" && (
              <section className="lookup-report-section">
                <h3>بحث النزلاء حسب الكنيسة وأب الاعتراف</h3>
                <p>تُبنى القائمتان من ملفات النزلاء. أضف الكنيسة وأب الاعتراف من ملف النزيل، وسيظهران هنا للبحث والطباعة.</p>
                <div className="lookup-filter-grid no-print">
                  <label className="form-field">
                    ابحث بالكنيسة
                    <input type="search" list="resident-church-search-options" value={reverseChurch} onChange={(event) => setReverseChurch(event.target.value)} placeholder="اكتب جزءًا من اسم الكنيسة" />
                    <datalist id="resident-church-search-options">
                      {residentChurchOptions.map((church) => <option key={church} value={church} />)}
                    </datalist>
                  </label>
                  <label className="form-field">
                    ابحث بأب الاعتراف
                    <input type="search" list="resident-confessor-search-options" value={reverseConfessor} onChange={(event) => setReverseConfessor(event.target.value)} placeholder="اكتب اسم أب الاعتراف" />
                    <datalist id="resident-confessor-search-options">
                      {confessorOptions.map((confessor) => <option key={confessor} value={confessor} />)}
                    </datalist>
                  </label>
                  {(reverseChurch || reverseConfessor) && (
                    <button className="secondary-button self-end" type="button" onClick={() => { setReverseChurch(""); setReverseConfessor(""); }}>
                      مسح الاختيارات
                    </button>
                  )}
                </div>
                {(reverseChurch || reverseConfessor) && (
                  <>
                    {(() => {
                      return (
                        <div className="resident-report-summary report-summary">
                          {reverseChurch && <article><span>الكنيسة</span><strong>{reverseChurch}</strong></article>}
                          {reverseConfessor && <article><span>أب الاعتراف</span><strong>{reverseConfessor}</strong></article>}
                          <article><span>عدد النزلاء</span><strong>{numberFormatter.format(reverseChurchResidents.length)}</strong></article>
                        </div>
                      );
                    })()}
                    <ResidentTable
                      rows={reverseChurchResidents}
                      emptyMessage="لا يوجد نزلاء مطابقون للاختيارات."
                      columns={[
                        { key: "governorate", label: "المحافظة" },
                        { key: "villa", label: "الفيلا" },
                        { key: "room", label: "الغرفة" },
                      ]}
                    />
                  </>
                )}
                {!reverseChurch && !reverseConfessor && <div className="empty-state">اختر كنيسة أو أب اعتراف لعرض الأسماء وطباعتها.</div>}
              </section>
            )}

            {referenceTab === "governorate" && (
              <section className="lookup-report-section">
                <h3>تقرير أسماء النزلاء حسب المحافظة</h3>
                <p>تظهر أسماء النزلاء تحت المحافظة المسجلين بها. اختر محافظة لتصفية التقرير، أو اترك الكل لطباعة القائمة كاملة.</p>
                <div className="resident-report-summary report-summary">
                  <article><span>إجمالي النزلاء</span><strong>{numberFormatter.format(distributionTotal)}</strong></article>
                  <article><span>عدد المحافظات</span><strong>{numberFormatter.format(governorateDistribution.length)}</strong></article>
                  <article><span>المقيمون</span><strong>{numberFormatter.format(governorateDistribution.reduce((sum, row) => sum + row.current, 0))}</strong></article>
                  <article><span>الغادرون</span><strong>{numberFormatter.format(governorateDistribution.reduce((sum, row) => sum + row.departed, 0))}</strong></article>
                </div>
                <label className="form-field lookup-governorate-filter no-print">
                  المحافظة
                  <select value={selectedReportGovernorate} onChange={(event) => setSelectedReportGovernorate(event.target.value)}>
                    <option value="">كل المحافظات</option>
                    {governorateGroups.map((group) => <option key={group.governorate} value={group.governorate}>{group.governorate}</option>)}
                  </select>
                </label>
                <div className="governorate-report-groups">
                  {visibleGovernorateGroups.map((group) => (
                    <section className="governorate-report-group" key={group.governorate}>
                      <h4>{group.governorate}<span>{numberFormatter.format(group.rows.length)} نزيل</span></h4>
                      <ResidentTable
                        rows={group.rows}
                        emptyMessage="لا يوجد نزلاء في هذه المحافظة."
                        columns={[{ key: "district", label: "المركز / الحي" }, { key: "villa", label: "الفيلا" }, { key: "room", label: "الغرفة" }]}
                      />
                    </section>
                  ))}
                  {!visibleGovernorateGroups.length && <div className="empty-state">لا توجد بيانات نزلاء لهذه المحافظة.</div>}
                </div>
              </section>
            )}

            {referenceTab === "period" && (
              <section className="lookup-report-section">
                <h3>تقرير الدخول خلال يوم أو فترة</h3>
                <p>اختر يومًا محددًا أو فترة، وسيظهر من كان تاريخ دخوله خلالها.</p>
                {!canViewPeriodReport ? (
                  <div className="empty-state">يتطلب هذا التقرير صلاحية شاشة «الفترة الزمنية».</div>
                ) : (
                  <>
                    <form
                      className="lookup-form no-print"
                      onSubmit={(event) => {
                        event.preventDefault();
                      const endDate =
                        periodMode === "day" ? periodStart : periodEnd;
                      if (
                        !periodStart ||
                        !endDate ||
                        periodStart > endDate
                      ) {
                        setPeriodError("اختر نطاقًا صحيحًا للتاريخ.");
                        setPeriodLoading(false);
                        return;
                      }
                      setPeriodError("");
                      setPeriodLoading(true);
                      setAppliedPeriod({
                        mode: periodMode,
                        startDate: periodStart,
                        endDate,
                      });
                      }}
                    >
                      <fieldset className="lookup-period-mode">
                      <legend>نوع البحث</legend>
                      <label>
                        <input
                          checked={periodMode === "day"}
                          name="lookup-period-mode"
                          onChange={() => setPeriodMode("day")}
                          type="radio"
                        />
                        يوم محدد
                      </label>
                      <label>
                        <input
                          checked={periodMode === "range"}
                          name="lookup-period-mode"
                          onChange={() => setPeriodMode("range")}
                          type="radio"
                        />
                        فترة
                      </label>
                      </fieldset>
                      <label className="form-field">
                      {periodMode === "day"
                        ? "تاريخ الدخول"
                        : "من تاريخ الدخول"}
                      <input
                        type="date"
                        required
                        value={periodStart}
                        onChange={(event) =>
                          setPeriodStart(event.target.value)
                        }
                      />
                      </label>
                      {periodMode === "range" && (
                      <label className="form-field">
                        إلى تاريخ الدخول
                        <input
                          type="date"
                          required
                          value={periodEnd}
                          onChange={(event) =>
                            setPeriodEnd(event.target.value)
                          }
                        />
                      </label>
                    )}
                    <button className="primary-button" type="submit">
                      عرض التقرير
                    </button>
                    </form>
                    <p className="lookup-count" aria-live="polite">
                    {numberFormatter.format(periodRows.length)} دخول{" "}
                    {appliedPeriod.mode === "day"
                      ? `في يوم ${appliedPeriod.startDate}`
                      : `من ${appliedPeriod.startDate} إلى ${appliedPeriod.endDate}`}
                    </p>
                    {periodError && <p className="lookup-message error" role="alert">{periodError}</p>}
                    {periodLoading ? <div className="empty-state">جارٍ تحميل التقرير...</div> : (
                      <div className="table-wrap report-detail">
                        <table className="resident-table lookup-table">
                          <thead><tr><th>اسم النزيل</th><th>رقم الملف</th><th>تاريخ الدخول</th><th>تاريخ الخروج</th><th>الفيلا</th><th>الغرفة</th></tr></thead>
                          <tbody>{periodRows.map((row) => <tr key={row.stayId}><td>{row.residentName}</td><td>{row.fileNumber}</td><td>{row.admissionDate}</td><td>{row.exitDate || "—"}</td><td>{row.villa || "—"}</td><td>{row.room || "—"}</td></tr>)}</tbody>
                        </table>
                        {!periodRows.length && <div className="empty-state">لا توجد حالات دخول في الفترة المحددة.</div>}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {referenceTab === "villa" && (
              <section className="lookup-report-section">
                <h3>تقرير الفيلا والغرف</h3>
                <p>اختر فيلا لمعرفة الغرف والنزلاء المقيمين حاليًا.</p>
                <label className="form-field">الفيلا
                  <select value={selectedVilla} onChange={(event) => setSelectedVilla(event.target.value)}>
                    <option value="">اختر فيلا</option>
                    {villaOptions.map((villa) => <option key={villa} value={villa}>{formatVilla(villa)}</option>)}
                  </select>
                </label>
                {selectedVilla && (
                  <>
                    <p className="lookup-count">{numberFormatter.format(selectedVillaResidents.length)} نزيل مقيم في الفيلا {selectedVilla}</p>
                    <ResidentTable rows={selectedVillaResidents} emptyMessage="لا يوجد نزلاء مقيمون حاليًا في هذه الفيلا." columns={[{ key: "room", label: "الغرفة" }]} />
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
      </div>

      {isAdministrator && (
        <details
          className="lookup-admin-management no-print"
          id="lookup-admin-management"
          open={managementOpen}
          onToggle={(event) => setManagementOpen(event.currentTarget.open)}
        >
          <summary>إعدادات القوائم المنسدلة</summary>
            <p className="lookup-settings-explanation">
            الكنائس وأب الاعتراف تُستمد تلقائيًا من ملفات النزلاء. أضفهما أو صححهما من ملف الشخص؛ أما المحافظات والأيام والفئات والفيلات والغرف فتُدار من هنا.
          </p>
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

          {kind === "church" && (
            <p className="lookup-settings-explanation">
              هذه القيم للبحث والتقارير فقط وتُجمع من ملفات النزلاء غير المؤرشفة. لتعديل اسم أو إضافة اسم جديد، افتح ملف النزيل وعدّل الكنيسة أو أب الاعتراف هناك.
            </p>
          )}

          {!persistent && (
            <p className="lookup-demo-note">
              بيانات تجريبية فقط؛ التغييرات لا تُحفظ بعد تحديث الصفحة.
            </p>
          )}

          {canManageCurrentKind && (
            <form className="lookup-form" onSubmit={submit}>
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
          {(kind === "villa" || kind === "room") && (
            <label className="form-field">
              {kind === "villa" ? "رقم الفيلا (A إلى D)" : "اسم الغرفة"}
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
          القيم غير المسجلة لا تُقبل للإقامات الجديدة، ولا تُحذف فيلا لها سجل إقامة.
        </p>
      )}
      <span className="lookup-count" aria-live="polite">
        {numberFormatter.format(rows.length)} سجل
      </span>
        </details>
      )}
    </section>
  );
}
