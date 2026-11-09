"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  createDemoId,
  demoInventory,
} from "@/lib/inventory-demo-data";
import { demoCanteen } from "@/lib/canteen-demo-data";
import { demoCanteenSales } from "@/lib/canteen-sales-demo-data";
import { demoMeatSales } from "@/lib/meat-sales-demo-data";
import { demoCustody } from "@/lib/custody-demo-data";
import { demoStaffBundle } from "@/lib/staff-demo-data";
import {
  demoResidents,
  demoUsers,
  type DemoUser,
  type Resident,
  type ResidentStatus,
} from "@/lib/demo-data";
import { hasScreenAccess } from "@/lib/access-control";
import {
  checkOutResidentAction,
  createStaffAccountAction,
  saveResidentAction,
  updateResidentArchiveAction,
} from "@/app/actions/residents";
import { authClient } from "@/lib/auth-client";
import { formatDate, localDateValue } from "@/lib/date-format";
import InventoryPanel from "@/components/inventory-panel";
import type { InventoryBundle } from "@/lib/inventory-types";
import CanteenPanel from "@/components/canteen-panel";
import ResidentPicker from "@/components/resident-picker";
import type { CanteenBundle } from "@/lib/canteen-types";
import CanteenReportPanel from "@/components/canteen-report-panel";
import CanteenSalesPanel from "@/components/canteen-sales-panel";
import type { CanteenSalesBundle } from "@/lib/canteen-sales-types";
import InvoiceReportPanel from "@/components/invoice-report-panel";
import ResidentStayReportPanel from "@/components/resident-stay-report-panel";
import MeatSalesPanel from "@/components/meat-sales-panel";
import type { MeatSalesBundle } from "@/lib/meat-sales-types";
import CustodyPanel from "@/components/custody-panel";
import type { CustodyBundle } from "@/lib/custody-types";
import ResidentFinancePanel from "@/components/resident-finance-panel";
import { demoResidentFinance } from "@/lib/resident-finance-demo-data";
import type { ResidentFinanceBundle } from "@/lib/resident-finance-types";
import StaffPanel from "@/components/staff-panel";
import type { StaffBundle } from "@/lib/staff-types";
import LookupManagerPanel from "@/components/lookup-manager-panel";
import { demoLookupData } from "@/lib/lookup-demo-data";
import type { LookupData } from "@/lib/lookup-types";
import TreatmentPanel from "@/components/treatment-panel";
import { demoTreatmentBundle } from "@/lib/treatment-demo-data";
import type { TreatmentBundle } from "@/lib/treatment-types";
import ExecutiveOverview from "@/components/executive-overview";
import AccessManagerPanel from "@/components/access-manager-panel";
import ResidentStatementModal from "@/components/resident-statement-modal";
import ResidentPhotoManager from "@/components/resident-photo-manager";
import ResidentProfilePrintModal from "@/components/resident-profile-print-modal";
import GlobalTrackingPanel from "@/components/global-tracking-panel";
import ResidentReportsPanel from "@/components/resident-reports-panel";
import ResidentSearchPanel from "@/components/resident-search-panel";
import PrintToolbar from "@/components/print-toolbar";
import PrintBrand from "@/components/print-brand";

type View =
  | "overview"
  | "residents"
  | "resident-reports"
  | "resident-search"
  | "treatment"
  | "rooms"
  | "inventory"
  | "custody"
  | "resident-finance"
  | "canteen"
  | "canteen-reports"
  | "sales"
  | "invoice-reports"
  | "resident-stay-reports"
  | "meat-sales"
  | "staff"
  | "lookups"
  | "tracking"
  | "access";
type StatusFilter = "all" | ResidentStatus | "archived";
type ResidentDraft = Omit<
  Resident,
  "id" | "archived" | "church" | "confessor"
>;

const emptyDraft: ResidentDraft = {
  fileNumber: "",
  name: "",
  birthDate: "",
  phone: "",
  address: "",
  district: "",
  emergencyContact: "",
  emergencyPhone: "",
  relationship: "",
  admissionDate: "",
  exitDate: "",
  villa: "",
  room: "",
  status: "current",
  nationalId: "",
  maritalStatus: "",
  qualification: "",
  previousExperience: "",
  previousWorkplaces: "",
  residentEntry: "",
  relationshipDegree: "",
  entryTime: "",
  exitMethod: "",
  treatingDoctorNumber: "",
  treatingDoctorAddress: "",
  rehabilitationTeam: "",
  rehabilitationStage: "",
  trainer: "",
  supervisor: "",
  lecturer: "",
  imagePath: "",
  governorate: "",
  residentNumber: "",
  incompleteStay: false,
  followUp: false,
  graduated: false,
};

type NavItem = {
  id: string;
  key: View;
  label: string;
  icon: IconName;
  group: string;
  tab?: string;
};

const navItems: NavItem[] = [
  { id: "home", key: "overview", label: "الرئيسية", icon: "grid", group: "الرئيسية" },

  { id: "residents", key: "residents", label: "النزلاء", icon: "people", group: "النزلاء" },
  { id: "resident-reports", key: "resident-reports", label: "تقرير النزلاء", icon: "search", group: "النزلاء", tab: "names" },
  { id: "resident-periods", key: "resident-stay-reports", label: "الفترة الزمنية", icon: "calendar", group: "النزلاء", tab: "stay" },
  { id: "resident-search", key: "resident-search", label: "بحث النزلاء", icon: "search", group: "النزلاء" },

  { id: "daily-ledger", key: "tracking", label: "دفتر اليومية والحركات", icon: "search", group: "اليومية", tab: "ledger" },
  { id: "resident-finance", key: "resident-finance", label: "أمانات النزلاء", icon: "box", group: "اليومية" },

  { id: "treatment", key: "treatment", label: "العلاج", icon: "pill", group: "الخدمات" },
  { id: "rooms", key: "rooms", label: "السكن والغرف", icon: "room", group: "الخدمات" },
  { id: "staff", key: "staff", label: "الموظفون", icon: "people", group: "الخدمات" },

  { id: "refrigerator", key: "meat-sales", label: "الثلاجة", icon: "box", group: "المخازن", tab: "sale" },
  { id: "food-store", key: "inventory", label: "مخزن الأغذية", icon: "box", group: "المخازن" },
  { id: "canteen", key: "canteen", label: "الكانتين", icon: "box", group: "المخازن", tab: "stock" },
  { id: "canteen-sales", key: "sales", label: "فواتير الكانتين", icon: "box", group: "المخازن", tab: "invoices" },
  { id: "custody", key: "custody", label: "مخزن العهدة", icon: "box", group: "المخازن" },

  { id: "canteen-report", key: "canteen-reports", label: "أرصدة الكانتين والمنصرف", icon: "search", group: "التقارير", tab: "report" },
  { id: "resident-purchases", key: "invoice-reports", label: "مشتريات النزلاء", icon: "search", group: "التقارير", tab: "purchases" },
  { id: "date-search", key: "tracking", label: "بحث بين تاريخين", icon: "search", group: "التقارير", tab: "search" },

  { id: "lookups", key: "lookups", label: "البيانات المرجعية", icon: "search", group: "الإدارة" },
  { id: "access", key: "access", label: "إدارة الوصول", icon: "shield", group: "الإدارة" },
];

const statusFilters: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "current", label: "مقيم حاليًا" },
  { key: "departed", label: "غادروا" },
  { key: "archived", label: "الأرشيف" },
];

type IconName =
  | "grid"
  | "people"
  | "pill"
  | "room"
  | "shield"
  | "search"
  | "plus"
  | "close"
  | "edit"
  | "door"
  | "archive"
  | "restore"
  | "calendar"
  | "pin"
  | "phone"
  | "check"
  | "alert"
  | "box";

function Icon({
  name,
  size = 18,
}: {
  name: IconName;
  size?: number;
}) {
  const shapes: Record<IconName, ReactNode> = {
    pill: (
      <>
        <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
        <path d="m8.5 8.5 7 7" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    room: (
      <>
        <path d="M3 20V8l9-5 9 5v12" />
        <path d="M9 20v-6h6v6M3 10h18" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    door: (
      <>
        <path d="M4 21h16M6 21V4l12-2v19" />
        <path d="M14 12h.01" />
      </>
    ),
    archive: (
      <>
        <rect x="3" y="4" width="18" height="4" rx="1" />
        <path d="M5 8v12h14V8M10 12h4" />
      </>
    ),
    restore: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    phone: (
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 3a2 2 0 0 1-.5 2.1L8 10.1a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c1 .3 2 .6 3 .7a2 2 0 0 1 1.6 1.9Z" />
    ),
    check: <path d="m5 12 4 4L19 6" />,
    alert: (
      <>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    box: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="M3 8v9l9 5 9-5V8M12 13v9" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes[name]}
    </svg>
  );
}

function initials(name: string) {
  return name.trim().slice(-1);
}

function displayValue(value: string) {
  return value.trim() || "غير مسجل";
}

function ResidentForm({
  initial,
  checkIn = false,
  basicOnly = false,
  villaOptions,
  error,
  onSave,
  onCancel,
}: {
  initial?: Resident;
  checkIn?: boolean;
  basicOnly?: boolean;
  villaOptions: LookupData["villas"];
  error: string;
  onSave: (draft: ResidentDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ResidentDraft>(() => {
    const initialDraft = initial
      ? {
          fileNumber: initial.fileNumber,
          name: initial.name,
          birthDate: initial.birthDate,
          phone: initial.phone,
          address: initial.address,
          district: initial.district,
          emergencyContact: initial.emergencyContact,
          emergencyPhone: initial.emergencyPhone,
          relationship: initial.relationship,
          admissionDate: initial.admissionDate,
          exitDate: initial.exitDate,
          villa: initial.villa,
          room: initial.room,
          status: initial.status,
          nationalId: initial.nationalId || "",
          maritalStatus: initial.maritalStatus || "",
          qualification: initial.qualification || "",
          previousExperience: initial.previousExperience || "",
          previousWorkplaces: initial.previousWorkplaces || "",
          residentEntry: initial.residentEntry || "",
          relationshipDegree: initial.relationshipDegree || "",
          entryTime: initial.entryTime || "",
          exitMethod: initial.exitMethod || "",
          treatingDoctorNumber: initial.treatingDoctorNumber || "",
          treatingDoctorAddress: initial.treatingDoctorAddress || "",
          rehabilitationTeam: initial.rehabilitationTeam || "",
          rehabilitationStage: initial.rehabilitationStage || "",
          trainer: initial.trainer || "",
          supervisor: initial.supervisor || "",
          lecturer: initial.lecturer || "",
          imagePath: initial.imagePath || "",
        }
      : { ...emptyDraft };
    if (checkIn) {
      return {
        ...initialDraft,
        status: "current",
        admissionDate: localDateValue(),
        exitDate: "",
        villa: "",
        room: "",
      };
    }
    return initialDraft;
  });

  function update<K extends keyof ResidentDraft>(
    key: K,
    value: ResidentDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      ...draft,
      exitDate:
        draft.status === "current"
          ? ""
          : draft.exitDate || localDateValue(),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="modal-content">
        <div style={{ marginBottom: "20px", paddingBottom: "16px", borderBottom: "1px solid #e2e8f0" }}>
          <ResidentPhotoManager
            photoUrl={draft.imagePath}
            residentName={draft.name}
            onPhotoChange={(newUrl) => update("imagePath", newUrl)}
          />
        </div>
        <div className="form-grid">
          <label className="form-field">
            الاسم الكامل *
            <input
              autoFocus
              required
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="اسم تجريبي"
            />
          </label>
          <label className="form-field">
            رقم الملف *
            <input
              required
              value={draft.fileNumber}
              onChange={(event) => update("fileNumber", event.target.value)}
              placeholder="مثل: D-1009"
            />
          </label>
          {!basicOnly && (
            <>
              <label className="form-field">
                تاريخ الميلاد
                <input
                  type="date"
                  value={draft.birthDate}
                  onChange={(event) => update("birthDate", event.target.value)}
                />
              </label>
              <label className="form-field">
                رقم الهاتف
                <input
                  type="tel"
                  value={draft.phone}
                  onChange={(event) => update("phone", event.target.value)}
                  placeholder="اختياري"
                />
              </label>
              <label className="form-field full">
                العنوان
                <input
                  value={draft.address}
                  onChange={(event) => update("address", event.target.value)}
                  placeholder="اختياري"
                />
              </label>
              <label className="form-field">
                المحافظة / المنطقة
                <input
                  value={draft.district}
                  onChange={(event) => update("district", event.target.value)}
                  placeholder="اختياري"
                />
              </label>
              <label className="form-field">
                جهة اتصال للطوارئ
                <input
                  value={draft.emergencyContact}
                  onChange={(event) =>
                    update("emergencyContact", event.target.value)
                  }
                  placeholder="اختياري"
                />
              </label>
              <label className="form-field">
                هاتف جهة الاتصال
                <input
                  type="tel"
                  value={draft.emergencyPhone}
                  onChange={(event) =>
                    update("emergencyPhone", event.target.value)
                  }
                  placeholder="اختياري"
                />
              </label>
              <label className="form-field">
                صلة القرابة
                <input
                  value={draft.relationship}
                  onChange={(event) =>
                    update("relationship", event.target.value)
                  }
                  placeholder="اختياري"
                />
              </label>
              <label className="form-field">
                الرقم القومي
                <input
                  value={draft.nationalId}
                  onChange={(event) => update("nationalId", event.target.value)}
                  placeholder="14 رقم"
                />
              </label>
              <label className="form-field">
                الحالة الاجتماعية
                <input
                  value={draft.maritalStatus}
                  onChange={(event) =>
                    update("maritalStatus", event.target.value)
                  }
                  placeholder="أعزب / متزوج / ..."
                />
              </label>
              <label className="form-field">
                صلة القرابة (الدرجة)
                <input
                  value={draft.relationshipDegree}
                  onChange={(event) =>
                    update("relationshipDegree", event.target.value)
                  }
                  placeholder="أولى / ثانية / ..."
                />
              </label>
              <label className="form-field">
                المؤهل الدراسي
                <input
                  value={draft.qualification}
                  onChange={(event) =>
                    update("qualification", event.target.value)
                  }
                  placeholder="المؤهل العلمي"
                />
              </label>
              <label className="form-field">
                الخبرات السابقة
                <input
                  value={draft.previousExperience}
                  onChange={(event) =>
                    update("previousExperience", event.target.value)
                  }
                  placeholder="المهارات والخبرات"
                />
              </label>
              <label className="form-field">
                أماكن العمل السابقة
                <input
                  value={draft.previousWorkplaces}
                  onChange={(event) =>
                    update("previousWorkplaces", event.target.value)
                  }
                  placeholder="الشركات والجهات"
                />
              </label>
              <label className="form-field">
                ساعة الدخول
                <input
                  value={draft.entryTime}
                  onChange={(event) => update("entryTime", event.target.value)}
                  placeholder="مثال: 10:00 صباحًا"
                />
              </label>
              <label className="form-field">
                دخول النزيل (طريقة الدخول)
                <input
                  value={draft.residentEntry}
                  onChange={(event) =>
                    update("residentEntry", event.target.value)
                  }
                  placeholder="بمعرفة الأهل / ..."
                />
              </label>
              <label className="form-field">
                طريقة الخروج
                <input
                  value={draft.exitMethod}
                  onChange={(event) => update("exitMethod", event.target.value)}
                  placeholder="تعافي / خروج بإقرار / ..."
                />
              </label>
              <label className="form-field">
                رقم الطبيب المعالج
                <input
                  value={draft.treatingDoctorNumber}
                  onChange={(event) =>
                    update("treatingDoctorNumber", event.target.value)
                  }
                  placeholder="رقم الهاتف"
                />
              </label>
              <label className="form-field full">
                عنوان الطبيب المعالج
                <input
                  value={draft.treatingDoctorAddress}
                  onChange={(event) =>
                    update("treatingDoctorAddress", event.target.value)
                  }
                  placeholder="عيادة الطبيب أو المستشفى"
                />
              </label>
              <label className="form-field">
                فريق التأهيل والإرشاد
                <input
                  value={draft.rehabilitationTeam}
                  onChange={(event) =>
                    update("rehabilitationTeam", event.target.value)
                  }
                  placeholder="اسم الفريق أو المشرف"
                />
              </label>
              <label className="form-field">
                مرحلة التأهيل والتعافي
                <input
                  value={draft.rehabilitationStage}
                  onChange={(event) =>
                    update("rehabilitationStage", event.target.value)
                  }
                  placeholder="أولى / ثانية / متقدمة"
                />
              </label>
              <label className="form-field">
                المدرب
                <input
                  value={draft.trainer}
                  onChange={(event) => update("trainer", event.target.value)}
                  placeholder="اسم المدرب"
                />
              </label>
              <label className="form-field">
                المشرف
                <input
                  value={draft.supervisor}
                  onChange={(event) => update("supervisor", event.target.value)}
                  placeholder="اسم المشرف"
                />
              </label>
              <label className="form-field">
                المحاضر
                <input
                  value={draft.lecturer}
                  onChange={(event) => update("lecturer", event.target.value)}
                  placeholder="اسم المحاضر"
                />
              </label>
            </>
          )}
          <label className="form-field">
            تاريخ الدخول *
            <input
              required
              type="date"
              value={draft.admissionDate}
              onChange={(event) => update("admissionDate", event.target.value)}
            />
          </label>
          <label className="form-field">
            الحالة
            <select
              value={draft.status}
              onChange={(event) =>
                update("status", event.target.value as ResidentStatus)
              }
            >
              <option value="current">مقيم حاليًا</option>
              <option value="departed">غادر المركز</option>
            </select>
          </label>
          <label className="form-field">
            الفيلا (N_V)
            <select
              value={draft.villa}
              onChange={(event) => update("villa", event.target.value)}
            >
              <option value="">بدون فيلا</option>
              {!checkIn &&
                initial &&
                draft.villa &&
                !villaOptions.some(
                  (villa) => villa.villaNumber === draft.villa,
                ) && (
                  <option value={draft.villa}>
                    {draft.villa} — قيمة محفوظة
                  </option>
                )}
              {villaOptions.map((villa) => (
                villa.villaNumber !== null ? (
                  <option key={villa.id} value={villa.villaNumber}>
                    {villa.villaNumber}
                  </option>
                ) : null
              ))}
            </select>
          </label>
          <label className="form-field">
            الغرفة
            <input
              value={draft.room}
              onChange={(event) => update("room", event.target.value)}
              placeholder="اختياري"
            />
          </label>
          {draft.status === "departed" && (
            <label className="form-field">
              تاريخ المغادرة
              <input
                type="date"
                value={draft.exitDate}
                onChange={(event) => update("exitDate", event.target.value)}
              />
            </label>
          )}
          <div className="form-hint form-field full">
            الحقول الصحية والقومية والدينية والصور مؤجلة؛ الموظف يرى الحقول
            الأساسية فقط، ولا تُستورد أي سجلات Access.
          </div>
        </div>
        {error && (
          <p className="form-hint" role="alert">
            {error}
          </p>
        )}
        <div className="modal-form-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            إلغاء
          </button>
          <button className="primary-button" type="submit">
            <Icon name="check" size={15} />
            حفظ في العرض التجريبي
          </button>
        </div>
      </div>
    </form>
  );
}

const emptyInventory: InventoryBundle = {
  categories: [],
  items: [],
  movements: [],
};
const emptyCustody: CustodyBundle = {
  items: [],
  warehouseMovements: [],
  employees: [],
  records: [],
  linkedEmployeeNumber: null,
};
const emptyResidentFinance: ResidentFinanceBundle = {
  records: [],
  unassignedEntries: [],
};
const emptyTreatment: TreatmentBundle = {
  records: [],
  unassignedEntries: [],
};
const emptyCanteen: CanteenBundle = { products: [], movements: [] };
const emptyCanteenSales: CanteenSalesBundle = {
  items: [],
  categories: [],
  invoices: [],
};
const emptyMeatSales: MeatSalesBundle = {
  catalog: [],
  products: [],
  movements: [],
  invoices: [],
};
const emptyStaff: StaffBundle = {
  profiles: [],
  employees: [],
  leaveEntries: [],
  accountOptions: [],
  accountLinks: [],
};
const emptyLookups: LookupData = {
  churches: [],
  governorates: [],
  days: [],
  alternateCategories: [],
  villas: [],
};

type CenterDashboardProps = {
  persistent?: boolean;
  initialResidents?: Resident[];
  initialUsers?: DemoUser[];
  initialInventory?: InventoryBundle;
  initialCustody?: CustodyBundle;
  initialResidentFinance?: ResidentFinanceBundle;
  initialCanteen?: CanteenBundle;
  initialSales?: CanteenSalesBundle;
  initialMeatSales?: MeatSalesBundle;
  initialStaffData?: StaffBundle;
  initialLookups?: LookupData;
  initialTreatment?: TreatmentBundle;
  currentUser?: DemoUser;
};

function getActiveUser(user: DemoUser | undefined) {
  if (!user) throw new Error("The current application user is missing.");
  return user;
}

export default function CenterDashboard({
  persistent = false,
  initialResidents,
  initialUsers,
  initialInventory,
  initialCustody,
  initialResidentFinance,
  initialCanteen,
  initialSales,
  initialMeatSales,
  initialStaffData,
  initialLookups,
  initialTreatment,
  currentUser,
}: CenterDashboardProps = {}) {
  const router = useRouter();
  const [residents, setResidents] = useState(
    initialResidents ?? (persistent ? [] : demoResidents),
  );
  const [users, setUsers] = useState(
    initialUsers ?? (persistent ? [] : demoUsers),
  );
  const [inventory, setInventory] = useState(
    initialInventory ?? (persistent ? emptyInventory : demoInventory),
  );
  const [custody, setCustody] = useState(
    initialCustody ?? (persistent ? emptyCustody : demoCustody),
  );
  const [residentFinance, setResidentFinance] = useState(
    initialResidentFinance ??
      (persistent ? emptyResidentFinance : demoResidentFinance),
  );
  const [treatment, setTreatment] = useState(
    initialTreatment ?? (persistent ? emptyTreatment : demoTreatmentBundle),
  );
  const [canteen, setCanteen] = useState(
    initialCanteen ?? (persistent ? emptyCanteen : demoCanteen),
  );
  const [sales, setSales] = useState(
    initialSales ?? (persistent ? emptyCanteenSales : demoCanteenSales),
  );
  const [meatSales, setMeatSales] = useState(
    initialMeatSales ?? (persistent ? emptyMeatSales : demoMeatSales),
  );
  const [staffData, setStaffData] = useState(
    initialStaffData ?? (persistent ? emptyStaff : demoStaffBundle),
  );
  const [lookups, setLookups] = useState(
    initialLookups ?? (persistent ? emptyLookups : demoLookupData),
  );
  const [statementResident, setStatementResident] = useState<Resident | null>(null);
  const [profilePrintResident, setProfilePrintResident] = useState<Resident | null>(null);
  const [view, setView] = useState<View>("overview");
  const [viewTab, setViewTab] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [checkInMode, setCheckInMode] = useState(false);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [addingStaff, setAddingStaff] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!selectedId && !editingId) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (editingId) {
        setEditingId(null);
        setCheckInMode(false);
        setFormError("");
      } else {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [editingId, selectedId]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const activeUser = getActiveUser(currentUser ?? users[0]);
  const activeInventory = useMemo(() => {
    if (activeUser.role === "admin" || activeUser.canManageWarehouse) {
      return inventory;
    }
    const grantedCategoryIds = new Set(
      activeUser.inventoryCategoryIds ?? [],
    );
    const grantedItems = inventory.items.filter((item) =>
      grantedCategoryIds.has(item.categoryId),
    );
    return {
      categories: inventory.categories.filter((category) =>
        grantedCategoryIds.has(category.id),
      ),
      items: grantedItems,
      movements: inventory.movements.filter((movement) =>
        grantedCategoryIds.has(movement.categoryId),
      ),
    };
  }, [activeUser, inventory]);
  const currentEmployeeNumber =
    persistent || activeUser.role === "admin"
      ? custody.linkedEmployeeNumber
      : (staffData.accountLinks.find(
          (link) => link.userId === activeUser.id,
        )?.employeeNumber ?? null);
  const activeCustody = useMemo(() => {
    if (persistent || activeUser.role === "admin") return custody;
    if (currentEmployeeNumber === null) {
      return {
        ...custody,
        items: [],
        warehouseMovements: [],
        employees: [],
        records: [],
        linkedEmployeeNumber: null,
      };
    }

    return {
      ...custody,
      items: [],
      warehouseMovements: [],
      employees: [],
      records: custody.records.filter(
        (record) =>
          record.recipientEmployeeNumber === currentEmployeeNumber ||
          record.details.some(
            (detail) =>
              detail.currentEmployeeNumber === currentEmployeeNumber ||
              detail.events.some(
                (event) =>
                  event.fromEmployeeNumber === currentEmployeeNumber ||
                  event.toEmployeeNumber === currentEmployeeNumber,
              ),
          ),
      ),
      linkedEmployeeNumber: currentEmployeeNumber,
    };
  }, [activeUser, currentEmployeeNumber, custody, persistent]);
  function removeCategoryGrants(categoryId: string) {
    setUsers((current) =>
      current.map((staff) => ({
        ...staff,
        inventoryCategoryIds: (staff.inventoryCategoryIds ?? []).filter(
          (id) => id !== categoryId,
        ),
      })),
    );
  }
  const canEdit =
    activeUser.role === "admin" || Boolean(activeUser.canEdit);
  const canAccessClinic =
    activeUser.role === "admin" || Boolean(activeUser.canAccessClinic);
  const canIssueInvoices =
    activeUser.role === "admin" || Boolean(activeUser.canIssueInvoices);
  const canManageWarehouse =
    activeUser.role === "admin" || Boolean(activeUser.canManageWarehouse);
  const canManageCustody =
    activeUser.role === "admin" || Boolean(activeUser.canManageCustody);
  const canManageMeatSales =
    activeUser.role === "admin" || Boolean(activeUser.canManageMeatSales);
  const canManageCanteen =
    activeUser.role === "admin" ||
    Boolean(activeUser.canManageCanteen || activeUser.canteenAccess);

  // الشاشة لا تُعرض إلا إذا كانت هناك بيانات وصلاحية فعلية لعرضها،
  // حتى لا يصل المستخدم إلى تبويب فارغ.
  const hasScreenPermission = (screenKey: View): boolean => {
    switch (screenKey) {
      case "overview":
      case "residents":
      case "rooms":
      case "staff":
      case "lookups":
      case "tracking":
      case "resident-reports":
      case "resident-search":
      case "resident-stay-reports":
      case "treatment":
      case "canteen":
      case "canteen-reports":
      case "invoice-reports":
      case "sales":
      case "inventory":
      case "custody":
      case "meat-sales":
      case "resident-finance":
        return true;
      case "access":
        return activeUser.role === "admin";
      default:
        return false;
    }
  };

  const isScreenAllowed = (screenKey: View): boolean => {
    if (!hasScreenPermission(screenKey)) return false;
    return hasScreenAccess(activeUser.role, activeUser.allowedScreens, screenKey);
  };
  const selectedResident =
    residents.find((resident) => resident.id === selectedId) ?? null;

  const activeResidents = useMemo(
    () => residents.filter((resident) => !resident.archived),
    [residents],
  );

  const currentCount = activeResidents.filter(
    (resident) => resident.status === "current",
  ).length;
  const departedCount = activeResidents.filter(
    (resident) => resident.status === "departed",
  ).length;
  const roomCount = new Set(
    activeResidents
      .filter(
        (resident) =>
          resident.status === "current" && resident.room,
      )
      .map((resident) => `${resident.villa}-${resident.room}`),
  ).size;

  const visibleResidents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ar");
    return residents.filter((resident) => {
      const matchesFilter =
        filter === "archived"
          ? resident.archived
          : !resident.archived &&
            (filter === "all" || resident.status === filter);
      const searchableFields =
        activeUser.role === "admin"
          ? [resident.name, resident.fileNumber, resident.phone]
          : [resident.name, resident.fileNumber];
      const matchesSearch =
        !query ||
        searchableFields
          .join(" ")
          .toLocaleLowerCase("ar")
          .includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [activeUser.role, filter, residents, search]);

  const roomGroups = useMemo(() => {
    const groups = new Map<string, Resident[]>();
    activeResidents
      .filter(
        (resident) =>
          resident.status === "current" && (resident.villa || resident.room),
      )
      .forEach((resident) => {
        const key = resident.villa ? `فيلا ${resident.villa}` : "بدون فيلا";
        groups.set(key, [...(groups.get(key) ?? []), resident]);
      });
    return [...groups.entries()].sort(([left], [right]) =>
      left.localeCompare(right, "ar"),
    );
  }, [activeResidents]);

  function openAddForm() {
    setSelectedId(null);
    setFormError("");
    setCheckInMode(false);
    setEditingId("new");
  }

  async function saveResident(draft: ResidentDraft) {
    const fileNumber = draft.fileNumber.trim().normalize("NFC");
    if (!draft.name.trim() || !fileNumber) {
      setFormError("الاسم ورقم الملف مطلوبان.");
      return;
    }
    if (
      draft.status === "departed" &&
      draft.exitDate &&
      draft.exitDate < draft.admissionDate
    ) {
      setFormError("تاريخ المغادرة يجب أن يكون بعد تاريخ الدخول.");
      return;
    }
    const duplicateFileNumber = residents.some(
      (resident) =>
        resident.id !== editingId &&
        resident.fileNumber.trim().normalize("NFC").toLocaleUpperCase("en") ===
          fileNumber.toLocaleUpperCase("en"),
    );
    if (duplicateFileNumber) {
      setFormError("رقم الملف مستخدم بالفعل؛ اختر رقمًا آخر.");
      return;
    }

    setFormError("");
    const normalizedDraft = {
      ...draft,
      name: draft.name.trim(),
      fileNumber,
    };
    const currentResident =
      editingId && editingId !== "new"
        ? residents.find((resident) => resident.id === editingId)
        : undefined;
    const startsNewStay =
      !currentResident ||
      (currentResident.status === "departed" &&
        normalizedDraft.status === "current");
    if (
      normalizedDraft.villa &&
      (startsNewStay || normalizedDraft.villa !== currentResident?.villa) &&
      !lookups.villas.some(
        (villa) =>
          villa.villaNumber === normalizedDraft.villa.normalize("NFC"),
      )
    ) {
      setFormError("اختر رقم فيلا مسجلًا في البيانات المرجعية.");
      return;
    }
    const actionDraft =
      activeUser.role === "admin"
        ? normalizedDraft
        : {
            fileNumber: normalizedDraft.fileNumber,
            name: normalizedDraft.name,
            admissionDate: normalizedDraft.admissionDate,
            exitDate: normalizedDraft.exitDate,
            villa: normalizedDraft.villa,
            room: normalizedDraft.room,
            status: normalizedDraft.status,
          };

    if (persistent) {
      try {
        const result = await saveResidentAction(
          editingId === "new" ? null : editingId,
          actionDraft,
        );
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        setResidents((current) =>
          editingId === "new"
            ? [result.resident, ...current]
            : current.map((resident) =>
                resident.id === result.resident.id
                  ? result.resident
                  : resident,
              ),
        );
        setSelectedId(result.resident.id);
        setMessage("تم حفظ سجل النزيل في قاعدة البيانات.");
        setEditingId(null);
        setCheckInMode(false);
        return;
      } catch {
        setFormError("تعذر حفظ السجل في قاعدة البيانات. حاول مرة أخرى.");
        return;
      }
    }

    if (editingId === "new") {
      const nextResident: Resident = {
        ...normalizedDraft,
        church: "",
        confessor: "",
        id: createDemoId(),
        archived: false,
      };
      setResidents((current) => [nextResident, ...current]);
      setSelectedId(nextResident.id);
      setMessage("تمت إضافة السجل إلى بيانات العرض التجريبي.");
    } else if (editingId) {
      setResidents((current) =>
        current.map((resident) =>
          resident.id === editingId
            ? {
                ...resident,
                ...normalizedDraft,
                church: "",
                confessor: "",
              }
            : resident,
        ),
      );
      setSelectedId(editingId);
      setMessage("تم تحديث السجل في بيانات العرض التجريبي.");
    }
    setEditingId(null);
    setCheckInMode(false);
  }

  async function toggleStay(resident: Resident) {
    if (!canEdit) return;
    if (resident.status === "departed") {
      setSelectedId(null);
      setFormError("");
      setCheckInMode(true);
      setEditingId(resident.id);
      return;
    }
    const today = localDateValue();
    if (persistent) {
      try {
        const result = await checkOutResidentAction(resident.id, today);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        setResidents((current) =>
          current.map((item) =>
            item.id === resident.id ? result.resident : item,
          ),
        );
        setSelectedId(null);
        setMessage("تم حفظ المغادرة في قاعدة البيانات.");
      } catch {
        setMessage("تعذر تسجيل المغادرة. حاول مرة أخرى.");
      }
      return;
    }

    setResidents((current) =>
      current.map((item) =>
        item.id === resident.id
          ? {
              ...item,
              status: "departed",
              exitDate: today,
              villa: "",
              room: "",
            }
          : item,
      ),
    );
    setMessage("تم تسجيل المغادرة وإخلاء الغرفة في العرض التجريبي.");
  }

  async function toggleArchive(resident: Resident) {
    if (!canEdit) return;
    const archived = !resident.archived;
    if (persistent) {
      try {
        const result = await updateResidentArchiveAction(
          resident.id,
          archived,
        );
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
      } catch {
        setMessage("تعذر تحديث الأرشيف. حاول مرة أخرى.");
        return;
      }
    }
    setResidents((current) =>
      current.map((item) =>
        item.id === resident.id ? { ...item, archived } : item,
      ),
    );
    setSelectedId(null);
    setMessage(
      archived
        ? "تم نقل السجل إلى الأرشيف التجريبي."
        : "تمت استعادة السجل من الأرشيف التجريبي.",
    );
  }

  function openView(nextView: View, nextTab: string | null = null) {
    if (!isScreenAllowed(nextView)) return;
    setView(nextView);
    setViewTab(nextTab);
    setFilter("all");
    setSearch("");
  }

  async function signOut() {
    if (!persistent) {
      document.cookie =
        "qithara-demo-session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      router.replace("/sign-in");
      return;
    }
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setMessage("تعذر تسجيل الخروج. حاول مرة أخرى.");
        return;
      }
      router.replace("/sign-in");
    } catch {
      setMessage("تعذر الاتصال بخدمة تسجيل الخروج.");
    }
  }

  const pageTitles: Record<View, string> = {
    overview: "الرئيسية",
    residents: "النزلاء",
    "resident-reports": "تقرير النزلاء",
    "resident-search": "بحث النزلاء",
    treatment: "العلاج",
    rooms: "السكن والغرف",
    inventory: "مخزن الأغذية",
    custody: "مخزن العهدة",
    "resident-finance": "أمانات النزلاء",
    canteen: "الكانتين",
    "canteen-reports": "أرصدة الكانتين والمنصرف",
    sales: "فواتير الكانتين",
    "invoice-reports": "مشتريات النزلاء",
    "resident-stay-reports": "الفترة الزمنية",
    "meat-sales": "الثلاجة",
    staff: "الموظفون",
    lookups: "البيانات المرجعية",
    tracking: viewTab === "search" ? "بحث بين تاريخين" : "دفتر اليومية والحركات",
    access: "إدارة الوصول",
  };
  const pageTitle = pageTitles[view];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            ق
          </div>
          <div>
            <p className="brand-name">مركز قيثارة داود</p>
            <p className="brand-subtitle">نظام إدارة المركز</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="القائمة الرئيسية">
          {navItems
            .filter((item) => isScreenAllowed(item.key))
            .map((item, index, visibleItems) => {
              const previousGroup =
                index > 0 ? visibleItems[index - 1].group : null;
              const isActive =
                view === item.key &&
                (item.tab ?? null) === viewTab;
              return (
                <div className="nav-group" key={item.id}>
                  {item.group !== previousGroup && (
                    <p className="nav-caption">{item.group}</p>
                  )}
                  <button
                    className={`nav-item ${isActive ? "active" : ""}`}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => openView(item.key, item.tab ?? null)}
                  >
                    <span className="nav-icon">
                      <Icon name={item.icon} size={17} />
                    </span>
                    {item.label}
                  </button>
                </div>
              );
            })}
        </nav>

        <div className="sidebar-note">
          <strong>
            {persistent ? "Neon PostgreSQL" : "نموذج أولي محلي"}
          </strong>
          {persistent
            ? "السجلات محفوظة في قاعدة البيانات؛ لم تُستورد سجلات Access."
            : "لا يتصل بقاعدة بيانات ولا يحفظ التغييرات بعد تحديث الصفحة."}
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-copy">
            <h1>إدارة مركز قيثارة داود</h1>
            <p>
              {persistent
                  ? "إدارة النزلاء والإقامة والمخزون والكانتين"
                  : "نسخة تجريبية لإدارة النزلاء والإقامة والمخزون والكانتين"}
            </p>
          </div>
          <div className="topbar-user">
            <div className="avatar" aria-hidden="true">
              {initials(activeUser.name)}
            </div>
            <div className="user-copy">
              <strong>{activeUser.name}</strong>
              <span>
                {activeUser.role === "admin"
                  ? "مدير النظام (كامل الصلاحيات)"
                  : activeUser.role === "viewer"
                    ? "زائر بيانات ومراجع (عرض وتصدير)"
                    : activeUser.canEdit
                      ? "موظف — صلاحية تعديل السجلات"
                      : "موظف — صلاحيات مخصصة"}
              </span>
            </div>
            {persistent && (
              <button
                className="secondary-button account-button"
                type="button"
                onClick={() => setChangingPassword(true)}
              >
                تغيير كلمة المرور
              </button>
            )}
            <button
              className="secondary-button account-button"
              type="button"
              onClick={signOut}
              title="تسجيل الخروج والعودة لشاشة الدخول"
            >
              تسجيل الخروج
            </button>
          </div>
        </header>

        <main className="page-content dashboard-print-area">
          <div className="dashboard-global-print-brand">
            <PrintBrand title={pageTitle} />
          </div>

          <div className="prototype-banner" role="note">
            <span className="banner-mark" aria-hidden="true">
              !
            </span>
            <span>
              {persistent ? (
                <>
                  <strong>لا توجد سجلات Access مستوردة.</strong> استخدم بيانات
                  اختبار حتى مراجعة الترحيلات وإعدادات قاعدة الإنتاج.
                </>
              ) : (
                <>
                  <strong>بيانات وهمية — لا تستخدم بيانات حقيقية.</strong> هذا
                  نموذج محلي غير منشور؛ لا يوجد تسجيل دخول أو صلاحيات فعلية أو
                  حفظ دائم. صلاحيات المدير والموظفين وفئات المخزون هنا للعرض فقط.
                </>
              )}
            </span>
          </div>

          <div className="page-heading">
            <div>
              <h2>{pageTitle}</h2>
              <p>
                {view === "access"
                  ? persistent
                    ? "إضافة الموظفين وإدارة صلاحيات النزلاء والمخزون والكانتين."
                    : "إعدادات توضيحية لحسابات الموظفين وصلاحياتهم."
                  : view === "inventory"
                    ? persistent
                      ? "أرصدة الأصناف وحركاتها حسب فئات الوصول الممنوحة."
                      : "بيانات مخزون وهمية لاختبار العرض والصلاحيات."
                  : view === "canteen"
                    ? persistent
                      ? "أصناف الكانتين وحركات الوارد والمنصرف."
                      : "بيانات كانتين وهمية لاختبار المخزون والصلاحيات."
                  : view === "sales"
                    ? persistent
                      ? "مبيعات الكانتين وفواتير النزلاء والدفعات محفوظة مع سجل الإلغاء."
                      : "بيانات مبيعات وهمية لاختبار الفواتير والمخزون."
                  : view === "meat-sales"
                    ? persistent
                      ? "مبيعات اللحوم ودفعاتها وخصم الثلاجة محفوظة في قاعدة البيانات."
                      : "بيانات لحوم وثلاجة وهمية لاختبار البيع والوارد."
                  : view === "staff"
                    ? activeUser.role === "admin"
                      ? "إدارة ملفات الموظفين وسجلات الإجازات وربط حسابات الدخول."
                      : "عرض ملفك الشخصي وسجل إجازاتك المرتبط بحسابك."
                  : persistent
                    ? "إدارة السجلات والإقامة المحفوظة في قاعدة البيانات."
                    : "متابعة سجلات تجريبية وإدارة الإقامة."}
              </p>
            </div>
            {view === "residents" && (
              <button
                className="primary-button"
                type="button"
                disabled={!canEdit}
                onClick={openAddForm}
              >
                <Icon name="plus" size={16} />
                إضافة نزيل
              </button>
            )}
            <PrintToolbar />
          </div>

          {view === "overview" && (
            <ExecutiveOverview
              residents={residents}
              sales={sales}
              meatSales={meatSales}
              treatment={treatment}
              residentFinance={residentFinance}
              custody={custody}
              lookups={lookups}
              onNavigate={(targetView, targetTab) =>
                openView(targetView as View, targetTab ?? null)
              }
            />
          )}

          {view === "residents" && (
            <div className="stats-grid">
              <StatCard
                icon="people"
                label="إجمالي السجلات النشطة"
                value={activeResidents.length}
              />
              <StatCard
                icon="room"
                label="النزلاء المقيمون الآن"
                value={currentCount}
              />
              <StatCard
                icon="door"
                label="الغرف المشغولة"
                value={roomCount}
              />
              <StatCard
                icon="calendar"
                label="سجلات المغادرة"
                value={departedCount}
                amber
              />
            </div>
          )}

          {view === "residents" && (
            <section className="list-panel" aria-label="سجلات النزلاء">
              <div className="list-toolbar">
                <label className="search-box">
                  <Icon name="search" size={17} />
                  <span className="sr-only">ابحث بالاسم أو رقم الملف</span>
                  <ResidentPicker
                    residents={residents}
                    value={search}
                    onChange={(value) => setSearch(value)}
                    placeholder="ابحث بالاسم أو رقم الملف..."
                  />
                </label>
                <div className="filter-list" aria-label="تصفية حسب الحالة">
                  {statusFilters.map((item) => (
                    <button
                      className={`filter-chip ${filter === item.key ? "active" : ""}`}
                      key={item.key}
                      type="button"
                      aria-pressed={filter === item.key}
                      onClick={() => setFilter(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="table-wrap">
                <table className="resident-table">
                  <thead>
                    <tr>
                      <th scope="col">النزيل</th>
                      <th scope="col">رقم الملف</th>
                      <th scope="col">الفيلا / الغرفة</th>
                      <th scope="col">تاريخ الدخول</th>
                      <th scope="col">الحالة</th>
                      <th scope="col">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleResidents.map((resident) => (
                      <tr key={resident.id}>
                        <td>
                          <div className="person-cell">
                            {resident.imagePath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={resident.imagePath}
                                alt={resident.name}
                                style={{
                                  width: "36px",
                                  height: "36px",
                                  borderRadius: "10px",
                                  objectFit: "cover",
                                  border: "1.5px solid #0f766e",
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <span className="person-avatar" aria-hidden="true">
                                {initials(resident.name)}
                              </span>
                            )}
                            <span className="person-info">
                              <strong>{resident.name}</strong>
                              {activeUser.role === "admin" && (
                                <span>
                                  {resident.phone || "بيانات تجريبية"}
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="resident-id">{resident.fileNumber}</td>
                        <td>
                          {resident.villa || resident.room
                            ? `${resident.villa ? `فيلا ${resident.villa}` : ""}${resident.villa && resident.room ? " · " : ""}${resident.room ? `غرفة ${resident.room}` : ""}`
                            : "—"}
                        </td>
                        <td>{formatDate(resident.admissionDate)}</td>
                        <td>
                          <StatusPill resident={resident} />
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <button
                              className="table-action"
                              type="button"
                              onClick={() => setSelectedId(resident.id)}
                            >
                              عرض الملف
                            </button>
                            <button
                              className="table-action"
                              style={{
                                backgroundColor: "rgba(37, 99, 235, 0.08)",
                                color: "#1d4ed8",
                                borderColor: "rgba(37, 99, 235, 0.2)",
                              }}
                              type="button"
                              onClick={() => setProfilePrintResident(resident)}
                              title="طباعة الملف الشخصي واستمارة القيد الرسمية A4"
                            >
                              طباعة الملف
                            </button>
                            <button
                              className="table-action"
                              style={{
                                backgroundColor: "rgba(20, 89, 66, 0.08)",
                                color: "var(--green-dark, #10513c)",
                                borderColor: "rgba(20, 89, 66, 0.2)",
                              }}
                              type="button"
                              onClick={() => setStatementResident(resident)}
                              title="كشف الحساب المالي الموحد 360°"
                            >
                              كشف حساب
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {visibleResidents.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">
                            لا توجد سجلات مطابقة. جرّب تغيير البحث أو التصفية.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {view === "rooms" && (
            <section className="content-panel">
              <div className="panel-heading">
                <div>
                  <h3>الإقامة الحالية</h3>
                  <p>
                    توزيع تجريبي حسب الفيلا والغرفة؛ لا توجد حدود إشغال مفعّلة.
                  </p>
                </div>
                <span className="status-pill current">
                  {currentCount} مقيم
                </span>
              </div>
              {roomGroups.length ? (
                <div className="room-grid">
                  {roomGroups.map(([villa, villaResidents]) => (
                    <article className="room-card" key={villa}>
                      <h4>{villa}</h4>
                      <div className="room-meta">
                        {villaResidents.length} سجل مقيم
                      </div>
                      <div className="room-residents">
                        {villaResidents.map((resident) => (
                          <div className="room-resident" key={resident.id}>
                            <span
                              className="person-avatar"
                              aria-hidden="true"
                            >
                              {initials(resident.name)}
                            </span>
                            <span>{resident.name}</span>
                            <span className="muted-cell">
                              {resident.room
                                ? `غرفة ${resident.room}`
                                : "غرفة غير محددة"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">لا توجد إقامة مسجلة حاليًا.</div>
              )}
            </section>
          )}

          {view === "resident-reports" && isScreenAllowed("resident-reports") && (
            <ResidentReportsPanel
              key={viewTab ?? "names"}
              residents={residents}
              treatment={treatment}
              initialReport={viewTab}
              persistent={persistent}
            />
          )}

          {view === "resident-search" && isScreenAllowed("resident-search") && (
            <ResidentSearchPanel
              residents={residents}
              persistent={persistent}
            />
          )}

          {view === "treatment" && isScreenAllowed("treatment") && (
            <TreatmentPanel
              bundle={treatment}
              residents={residents}
              canManage={canAccessClinic}
              onBundleChange={setTreatment}
            />
          )}

          {view === "inventory" && isScreenAllowed("inventory") && (
            <InventoryPanel
              inventory={activeInventory}
              persistent={persistent}
              canManage={canManageWarehouse}
              onInventoryChange={setInventory}
              onCategoryDeactivated={removeCategoryGrants}
            />
          )}

          {view === "custody" && isScreenAllowed("custody") && (
            <CustodyPanel
              bundle={activeCustody}
              persistent={persistent}
              canManage={canManageWarehouse || canManageCustody}
              currentEmployeeNumber={currentEmployeeNumber}
              onBundleChange={setCustody}
            />
          )}

          {view === "resident-finance" && isScreenAllowed("resident-finance") && (
            <ResidentFinancePanel
              bundle={residentFinance}
              persistent={persistent}
              canManage={activeUser.role === "admin"}
              onBundleChange={setResidentFinance}
            />
          )}

          {view === "canteen" && isScreenAllowed("canteen") && (
            <CanteenPanel
              canteen={canteen}
              persistent={persistent}
              canManage={canManageCanteen}
              canVoid={activeUser.role === "admin"}
              onCanteenChange={setCanteen}
            />
          )}

          {view === "canteen-reports" && isScreenAllowed("canteen-reports") && (
            <CanteenReportPanel persistent={persistent} />
          )}

          {view === "sales" && isScreenAllowed("sales") && (
            <CanteenSalesPanel
              sales={sales}
              lookups={lookups}
              residents={residents}
              canteen={canteen}
              persistent={persistent}
              canManage={canIssueInvoices}
              onSalesChange={setSales}
              onCanteenChange={setCanteen}
            />
          )}

          {view === "invoice-reports" && isScreenAllowed("invoice-reports") && (
            <InvoiceReportPanel persistent={persistent} />
          )}

          {view === "resident-stay-reports" && isScreenAllowed("resident-stay-reports") && (
            <ResidentStayReportPanel persistent={persistent} />
          )}

          {view === "meat-sales" && isScreenAllowed("meat-sales") && (
            <MeatSalesPanel
              key={viewTab ?? "sale"}
              sales={meatSales}
              persistent={persistent}
              canManage={canManageMeatSales}
              initialSection={viewTab}
              onSalesChange={setMeatSales}
            />
          )}

          {view === "staff" && (
            <StaffPanel
              bundle={staffData}
              lookups={lookups}
              users={users}
              currentUser={activeUser}
              persistent={persistent}
              onBundleChange={setStaffData}
            />
          )}

          {view === "lookups" && (
            <LookupManagerPanel
              lookups={lookups}
              residents={residents}
              staffData={staffData}
              sales={sales}
              currentUser={activeUser}
              persistent={persistent}
              onLookupsChange={setLookups}
              onResidentsChange={setResidents}
              onStaffDataChange={setStaffData}
              onSalesChange={setSales}
            />
          )}

          {view === "tracking" && (
            <GlobalTrackingPanel
              residents={residents}
              inventory={activeInventory}
              custody={activeCustody}
              canteen={canteen}
              sales={sales}
              meatSales={meatSales}
              residentFinance={residentFinance}
              treatment={treatment}
              persistent={persistent}
            />
          )}

          {view === "access" && activeUser.role === "admin" && (
            <div style={{ display: "grid", gap: "20px" }}>
              {persistent && addingStaff && (
                <StaffAccountForm
                  onCreated={(newUser) => {
                    setUsers((current) => [
                      ...current,
                      { ...newUser, inventoryCategoryIds: [] },
                    ]);
                    setAddingStaff(false);
                    setMessage(`تم إنشاء حساب ${newUser.name}.`);
                  }}
                  onCancel={() => setAddingStaff(false)}
                />
              )}
              <AccessManagerPanel
                users={users}
                inventory={inventory}
                persistent={persistent}
                onUsersChange={setUsers}
                onAddingStaffToggle={() => setAddingStaff((v) => !v)}
                addingStaff={addingStaff}
              />
            </div>
          )}
        </main>
      </div>

      {message && (
        <div className="toast" role="status">
          {message}
          <button
            className="icon-button"
            type="button"
            aria-label="إغلاق الرسالة"
            onClick={() => setMessage("")}
            style={{ marginInlineStart: 10, verticalAlign: "middle" }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {selectedResident && !editingId && (
        <ResidentDetails
          resident={selectedResident}
          canEdit={canEdit}
          basicOnly={activeUser.role !== "admin"}
          persistent={persistent}
          onClose={() => setSelectedId(null)}
          onPrintProfile={() => setProfilePrintResident(selectedResident)}
          onOpenStatement={() => setStatementResident(selectedResident)}
          onEdit={() => {
            setFormError("");
            setCheckInMode(false);
            setEditingId(selectedResident.id);
          }}
          onToggleStay={() => toggleStay(selectedResident)}
          onToggleArchive={() => toggleArchive(selectedResident)}
        />
      )}

      {editingId && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditingId(null);
              setCheckInMode(false);
              setFormError("");
            }
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resident-form-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="resident-form-title">
                  {editingId === "new"
                    ? "إضافة نزيل تجريبي"
                    : checkInMode
                      ? "تسجيل دخول وتحديد الإقامة"
                      : "تعديل البيانات"}
                </h3>
                <p>لا تُدخل بيانات أشخاص حقيقيين في هذا النموذج المحلي.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="إغلاق"
                onClick={() => {
                  setEditingId(null);
                  setCheckInMode(false);
                  setFormError("");
                }}
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            <ResidentForm
              key={`${editingId}-${checkInMode}`}
              initial={
                editingId === "new"
                  ? undefined
                  : residents.find((resident) => resident.id === editingId)
              }
              checkIn={checkInMode}
              basicOnly={activeUser.role !== "admin"}
              villaOptions={lookups.villas}
              error={formError}
              onSave={saveResident}
              onCancel={() => {
                setEditingId(null);
                setCheckInMode(false);
                setFormError("");
              }}
            />
          </section>
        </div>
      )}

      {statementResident && (
        <ResidentStatementModal
          resident={statementResident}
          sales={sales}
          treatment={treatment}
          residentFinance={residentFinance}
          onClose={() => setStatementResident(null)}
        />
      )}

      {profilePrintResident && (
        <ResidentProfilePrintModal
          resident={profilePrintResident}
          onClose={() => setProfilePrintResident(null)}
        />
      )}

      {changingPassword && persistent && (
        <PasswordChangeDialog onClose={() => setChangingPassword(false)} />
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  amber = false,
}: {
  icon: IconName;
  label: string;
  value: number;
  amber?: boolean;
}) {
  return (
    <article className="stat-card">
      <span className={`stat-icon ${amber ? "amber" : ""}`}>
        <Icon name={icon} size={18} />
      </span>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value.toLocaleString("ar-EG")}</strong>
      </div>
    </article>
  );
}

function StatusPill({ resident }: { resident: Resident }) {
  const statusClass = resident.archived
    ? "archived"
    : resident.status === "current"
      ? "current"
      : "departed";
  const label = resident.archived
    ? "مؤرشف"
    : resident.status === "current"
      ? "مقيم"
      : "غادر";
  return <span className={`status-pill ${statusClass}`}>{label}</span>;
}

function ResidentDetails({
  resident,
  canEdit,
  basicOnly,
  persistent,
  onClose,
  onPrintProfile,
  onOpenStatement,
  onEdit,
  onToggleStay,
  onToggleArchive,
}: {
  resident: Resident;
  canEdit: boolean;
  basicOnly: boolean;
  persistent: boolean;
  onClose: () => void;
  onPrintProfile: () => void;
  onOpenStatement: () => void;
  onEdit: () => void;
  onToggleStay: () => void;
  onToggleArchive: () => void;
}) {
  const stayFields: [string, string][] = [
    ["تاريخ الدخول", formatDate(resident.admissionDate)],
    ["تاريخ المغادرة", formatDate(resident.exitDate)],
    [
      "الفيلا / الغرفة",
      [resident.villa && `فيلا ${resident.villa}`, resident.room && `غرفة ${resident.room}`]
        .filter(Boolean)
        .join(" · ") || "غير محدد",
    ],
  ];
  const fields: [string, string][] = basicOnly
    ? stayFields
    : [
        ["تاريخ الميلاد", formatDate(resident.birthDate)],
        ["الرقم القومي", displayValue(resident.nationalId ?? "")],
        ["رقم الهاتف", displayValue(resident.phone)],
        ["الحالة الاجتماعية", displayValue(resident.maritalStatus ?? "")],
        ["المؤهل الدراسي", displayValue(resident.qualification ?? "")],
        ["الخبرات السابقة", displayValue(resident.previousExperience ?? "")],
        ["أماكن العمل السابقة", displayValue(resident.previousWorkplaces ?? "")],
        ["العنوان", displayValue(resident.address)],
        ["المحافظة / المنطقة", displayValue(resident.district)],
        ["جهة اتصال للطوارئ", displayValue(resident.emergencyContact)],
        ["هاتف جهة الاتصال", displayValue(resident.emergencyPhone)],
        ["صلة القرابة", displayValue(resident.relationship)],
        ["صلة القرابة (الدرجة)", displayValue(resident.relationshipDegree ?? "")],
        ...stayFields,
        ["ساعة الدخول", displayValue(resident.entryTime ?? "")],
        ["طريقة الدخول", displayValue(resident.residentEntry ?? "")],
        ["طريقة الخروج", displayValue(resident.exitMethod ?? "")],
        ["رقم الطبيب المعالج", displayValue(resident.treatingDoctorNumber ?? "")],
        ["عنوان الطبيب المعالج", displayValue(resident.treatingDoctorAddress ?? "")],
        ["فريق التأهيل والإرشاد", displayValue(resident.rehabilitationTeam ?? "")],
        ["مرحلة التأهيل والتعافي", displayValue(resident.rehabilitationStage ?? "")],
        ["المدرب", displayValue(resident.trainer ?? "")],
        ["المشرف", displayValue(resident.supervisor ?? "")],
        ["المحاضر", displayValue(resident.lecturer ?? "")],
      ];

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resident-details-title"
      >
        <div className="modal-header">
          <div>
            <h3 id="resident-details-title">ملف النزيل</h3>
            <p>{persistent ? "تفاصيل سجل محفوظ" : "تفاصيل سجل تجريبي"}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
        <div className="modal-content">
          <div className="detail-person" style={{ display: "flex", gap: "14px", alignItems: "center" }}>
            {resident.imagePath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resident.imagePath}
                alt={resident.name}
                style={{
                  width: "58px",
                  height: "58px",
                  borderRadius: "14px",
                  objectFit: "cover",
                  border: "2px solid #0f766e",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <span className="person-avatar" aria-hidden="true">
                {initials(resident.name)}
              </span>
            )}
            <div>
              <h4>{resident.name}</h4>
              <p>
                {resident.fileNumber} · <StatusPill resident={resident} />
              </p>
            </div>
          </div>
          <div className="detail-grid">
            {fields.map(([label, value]) => (
              <div className="detail-item" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
        {canEdit ? (
          <div className="modal-actions">
            <button
              className="danger-button"
              type="button"
              onClick={onToggleArchive}
            >
              <Icon
                name={resident.archived ? "restore" : "archive"}
                size={15}
              />
              {resident.archived ? "استعادة من الأرشيف" : "نقل إلى الأرشيف"}
            </button>
            <div className="action-group">
              <button
                className="secondary-button"
                type="button"
                onClick={onPrintProfile}
                style={{
                  backgroundColor: "rgba(37, 99, 235, 0.12)",
                  color: "#1d4ed8",
                  fontWeight: 700,
                }}
              >
                <span>🖨️</span>
                طباعة الملف (A4 / PDF)
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={onOpenStatement}
                style={{
                  backgroundColor: "rgba(20, 89, 66, 0.12)",
                  color: "var(--green-dark, #10513c)",
                  fontWeight: 600,
                }}
              >
                <Icon name="box" size={15} />
                كشف الحساب المالي (360°)
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={onToggleStay}
                disabled={resident.archived}
              >
                <Icon name="door" size={15} />
                {resident.status === "current" ? "تسجيل مغادرة" : "تسجيل دخول"}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={onEdit}
              >
                <Icon name="edit" size={15} />
                تعديل البيانات
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 22px", borderTop: "1px solid var(--line)" }}>
            <p className="read-only-note" style={{ margin: 0 }}>
              {persistent
                ? "حسابك للقراءة فقط. اطلب من المسؤول منحك صلاحية التعديل عند الحاجة."
                : "حساب العرض التجريبي هذا للقراءة فقط. لا توجد صلاحيات حقيقية مفعّلة."}
            </p>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                className="secondary-button"
                type="button"
                onClick={onPrintProfile}
                style={{
                  backgroundColor: "rgba(37, 99, 235, 0.12)",
                  color: "#1d4ed8",
                  fontWeight: 700,
                }}
              >
                <span>🖨️</span>
                طباعة الملف (PDF)
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={onOpenStatement}
                style={{
                  backgroundColor: "rgba(20, 89, 66, 0.12)",
                  color: "var(--green-dark, #10513c)",
                  fontWeight: 600,
                }}
              >
                <Icon name="box" size={15} />
                كشف الحساب المالي (360°)
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function StaffAccountForm({
  onCreated,
  onCancel,
}: {
  onCreated: (user: DemoUser) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await createStaffAccountAction({ name, email, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.user);
    } catch {
      setError("تعذر إنشاء الحساب. تحقق من البريد وحاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="staff-account-form" onSubmit={submit}>
      <label className="form-field">
        اسم الموظف
        <input
          required
          maxLength={200}
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="form-field">
        البريد الإلكتروني
        <input
          required
          type="email"
          maxLength={254}
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="form-field">
        كلمة المرور الأولية
        <input
          required
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <p className="access-note">
        الحساب الجديد للقراءة فقط. شارك كلمة المرور الأولية بشكل آمن واطلب من
        الموظف تغييرها بعد تسجيل الدخول.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="action-group">
        <button
          className="secondary-button"
          type="button"
          disabled={submitting}
          onClick={onCancel}
        >
          إلغاء
        </button>
        <button className="primary-button" disabled={submitting}>
          {submitting ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
        </button>
      </div>
    </form>
  );
}

function PasswordChangeDialog({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        setError("تعذر تغيير كلمة المرور. تحقق من الحالية وحاول مرة أخرى.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setSuccess("تم تغيير كلمة المرور وإغلاق الجلسات الأخرى.");
    } catch {
      setError("تعذر الاتصال بخدمة الحسابات. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal password-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-title"
      >
        <div className="modal-header">
          <div>
            <h3 id="password-title">تغيير كلمة المرور</h3>
            <p>استخدم كلمة مرور جديدة لا تقل عن 12 حرفًا.</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
        <form className="password-form" onSubmit={submit}>
          <label className="form-field">
            كلمة المرور الحالية
            <input
              required
              autoComplete="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label className="form-field">
            كلمة المرور الجديدة
            <input
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="form-success" role="status">
              {success}
            </p>
          )}
          <div className="action-group">
            <button
              className="secondary-button"
              type="button"
              disabled={submitting}
              onClick={onClose}
            >
              إغلاق
            </button>
            <button className="primary-button" disabled={submitting}>
              {submitting ? "جارٍ التغيير..." : "تغيير كلمة المرور"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
