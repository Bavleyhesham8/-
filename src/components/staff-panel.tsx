"use client";

import { useState, type FormEvent } from "react";
import {
  linkStaffAccountAction,
  recordStaffLeaveAction,
  saveStaffEmployeeAction,
  saveStaffProfileAction,
} from "@/app/actions/staff";
import { localDateValue } from "@/lib/date-format";
import type { DemoUser } from "@/lib/demo-data";
import type {
  StaffAccountLink,
  StaffBundle,
  StaffEmployee,
  StaffLeaveEntry,
  StaffProfile,
} from "@/lib/staff-types";
import type { LookupData } from "@/lib/lookup-types";

type Props = {
  bundle: StaffBundle;
  users: DemoUser[];
  currentUser: DemoUser;
  persistent: boolean;
  lookups: LookupData;
  onBundleChange: (update: (current: StaffBundle) => StaffBundle) => void;
};

type ProfileDraft = Omit<StaffProfile, "profileNumber">;
type Section = "profile" | "employees" | "leave" | "links";

const emptyProfile: ProfileDraft = {
  employeeId: "",
  firstName: "",
  thirdName: "",
  nationalId: "",
  address: "",
  governorate: "",
  district: "",
  birthDate: "",
  maritalStatus: "",
  qualification: "",
  employmentStartDate: "",
  mobile: "",
  church: "",
  confessor: "",
  confessorPhone: "",
  denomination: "",
  previousWorkplaces: "",
  computerPrograms: "",
  jobSpecialty: "",
  employmentOffice: "",
  photo: "",
  notes: "",
  imagePath: "",
};

const profileFields: {
  key: keyof ProfileDraft;
  label: string;
  type?: "date";
  multiline?: boolean;
}[] = [
  { key: "employeeId", label: "ID" },
  { key: "firstName", label: "الاسم الاول" },
  { key: "thirdName", label: "الاسم الثالث" },
  { key: "nationalId", label: "الرقم القومى" },
  { key: "address", label: "العنوان" },
  { key: "governorate", label: "المحافظة" },
  { key: "district", label: "المركز / الحى" },
  { key: "birthDate", label: "تاريخ الميلاد", type: "date" },
  { key: "maritalStatus", label: "الحالة الاجتماعية" },
  { key: "qualification", label: "الموهل الدراسى" },
  {
    key: "employmentStartDate",
    label: "تاريخ الالتحاق بالعمل",
    type: "date",
  },
  { key: "mobile", label: "الموبايل" },
  { key: "church", label: "الكنيسة التابع لها" },
  { key: "confessor", label: "أب الاعتراف" },
  { key: "confessorPhone", label: "رقم اب الاعتراف" },
  { key: "denomination", label: "الطائفة" },
  { key: "previousWorkplaces", label: "اماكن العمل السابقة", multiline: true },
  { key: "computerPrograms", label: "برامج الكمبيوتر", multiline: true },
  { key: "jobSpecialty", label: "تخصص العمل" },
  { key: "employmentOffice", label: "مكتب التوظيف" },
  { key: "photo", label: "صورة (مسار نصي)", multiline: true },
  { key: "notes", label: "ملاحظات", multiline: true },
  { key: "imagePath", label: "ImagePath (مسار نصي)", multiline: true },
];

function displayName(profile: StaffProfile) {
  return [profile.firstName, profile.thirdName].filter(Boolean).join(" ");
}

function nextProfileNumber(profiles: StaffProfile[]) {
  return Math.max(0, ...profiles.map((profile) => profile.profileNumber)) + 1;
}

function StaffProfileFields({
  value,
  onChange,
  lookups,
  disabled = false,
}: {
  value: ProfileDraft;
  onChange?: (key: keyof ProfileDraft, nextValue: string) => void;
  lookups: LookupData;
  disabled?: boolean;
}) {
  return (
    <div className="form-grid staff-profile-grid">
      {profileFields.map((field) => (
        <label
          className={`form-field ${field.multiline ? "full" : ""}`}
          key={field.key}
        >
          {field.label}
          {field.multiline ? (
            <textarea
              value={value[field.key]}
              disabled={disabled}
              rows={2}
              onChange={(event) => onChange?.(field.key, event.target.value)}
            />
          ) : field.key === "governorate" ||
            field.key === "district" ||
            field.key === "church" ? (
            <>
              <input
                list={`staff-${field.key}-options`}
                autoComplete="off"
                value={value[field.key]}
                disabled={disabled}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  onChange?.(field.key, nextValue);
                  if (
                    field.key === "governorate" &&
                    !lookups.governorates.some(
                      (entry) =>
                        entry.governorate === nextValue &&
                        entry.district === value.district,
                    )
                  ) {
                    onChange?.("district", "");
                  }
                }}
              />
              <datalist id={`staff-${field.key}-options`}>
              {(() => {
                const choices =
                  field.key === "governorate"
                    ? [
                        ...new Set(
                          lookups.governorates
                            .map((entry) => entry.governorate)
                            .filter((entry): entry is string => !!entry),
                        ),
                      ]
                    : field.key === "district"
                      ? [
                          ...new Set(
                            lookups.governorates
                              .filter(
                                (entry) =>
                                  entry.governorate === value.governorate,
                              )
                              .map((entry) => entry.district)
                              .filter((entry): entry is string => !!entry),
                          ),
                        ]
                      : [
                          ...new Set(
                            lookups.churches
                              .map((entry) => entry.name)
                              .filter((entry): entry is string => !!entry),
                          ),
                        ];
                return choices.map((option) => <option key={option} value={option} />);
              })()}
              </datalist>
            </>
          ) : (
            <input
              type={field.type ?? "text"}
              value={value[field.key]}
              disabled={disabled}
              onChange={(event) => onChange?.(field.key, event.target.value)}
            />
          )}
        </label>
      ))}
      <p className="form-hint full">
        حقلا «صورة» و«ImagePath» يحفظان مسارًا نصيًا فقط؛ لا يتم رفع ملفات أو
        صور إلى التطبيق.
      </p>
    </div>
  );
}

export default function StaffPanel({
  bundle,
  users,
  currentUser,
  persistent,
  lookups,
  onBundleChange,
}: Props) {
  const isAdministrator = currentUser.role === "admin";
  const canViewAllStaff = isAdministrator || currentUser.role === "viewer";
  const [section, setSection] = useState<Section>("profile");
  const [editingProfileNumber, setEditingProfileNumber] = useState<
    number | null
  >(null);
  const [profileDraft, setProfileDraft] =
    useState<ProfileDraft>(emptyProfile);
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [leaveEmployeeNumber, setLeaveEmployeeNumber] = useState("");
  const [leaveDate, setLeaveDate] = useState(localDateValue());
  const [returnDate, setReturnDate] = useState(localDateValue());
  const [leaveType, setLeaveType] = useState("");
  const [leaveNotes, setLeaveNotes] = useState("");
  const firstStaffUser = users.find((user) => user.role === "staff");
  const initialAccountLink = bundle.accountLinks.find(
    (link) => link.userId === firstStaffUser?.id,
  );
  const [selectedAccountId, setSelectedAccountId] = useState(
    firstStaffUser?.id ?? "",
  );
  const [linkedProfileNumber, setLinkedProfileNumber] = useState(
    initialAccountLink ? String(initialAccountLink.profileNumber) : "",
  );
  const [linkedEmployeeNumber, setLinkedEmployeeNumber] = useState(
    initialAccountLink ? String(initialAccountLink.employeeNumber) : "",
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const activeLink = bundle.accountLinks.find(
    (link) => link.userId === currentUser.id,
  );
  const ownProfile = bundle.profiles.find(
    (profile) => profile.profileNumber === activeLink?.profileNumber,
  );
  const ownEmployeeNumber = activeLink?.employeeNumber;
  const visibleLeaves = canViewAllStaff
    ? bundle.leaveEntries
    : bundle.leaveEntries.filter(
        (entry) => entry.employeeNumber === ownEmployeeNumber,
      );

  function updateProfileDraft(key: keyof ProfileDraft, value: string) {
    setProfileDraft((current) => ({ ...current, [key]: value }));
  }

  function startNewProfile() {
    setEditingProfileNumber(null);
    setProfileDraft(emptyProfile);
    setError("");
    setMessage("");
  }

  function startEditingProfile(profile: StaffProfile) {
    const { profileNumber, ...draft } = profile;
    setEditingProfileNumber(profileNumber);
    setProfileDraft(draft);
    setError("");
    setMessage("");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      let savedProfile: StaffProfile;
      if (persistent) {
        const result = await saveStaffProfileAction({
          ...profileDraft,
          profileNumber: editingProfileNumber,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        savedProfile = result.profile;
      } else {
        savedProfile = {
          ...profileDraft,
          profileNumber:
            editingProfileNumber ?? nextProfileNumber(bundle.profiles),
        };
      }

      onBundleChange((current) => ({
        ...current,
        profiles: editingProfileNumber
          ? current.profiles.map((profile) =>
              profile.profileNumber === editingProfileNumber
                ? savedProfile
                : profile,
            )
          : [...current.profiles, savedProfile],
      }));
      setEditingProfileNumber(null);
      setProfileDraft(emptyProfile);
      setMessage("تم حفظ ملف الموظف.");
    } catch {
      setError("تعذر حفظ ملف الموظف. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsedNumber = Number(employeeNumber);
    if (!Number.isInteger(parsedNumber) || parsedNumber <= 0 || !employeeName.trim()) {
      setError("أدخل رقم موظف صحيحًا واسمه.");
      return;
    }

    setSaving(true);
    try {
      let employee: StaffEmployee;
      if (persistent) {
        const result = await saveStaffEmployeeAction({
          id: employeeId.trim() ? Number(employeeId) : null,
          employeeNumber: parsedNumber,
          employeeName,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        employee = result.employee;
      } else {
        employee = {
          id: employeeId.trim() ? Number(employeeId) : null,
          employeeNumber: parsedNumber,
          employeeName: employeeName.trim(),
        };
      }

      onBundleChange((current) => ({
        ...current,
        employees: [
          ...current.employees.filter(
            (item) => item.employeeNumber !== employee.employeeNumber,
          ),
          employee,
        ].sort((left, right) => left.employeeNumber - right.employeeNumber),
      }));
      setLeaveEmployeeNumber(String(employee.employeeNumber));
      setEmployeeNumber("");
      setEmployeeId("");
      setEmployeeName("");
      setMessage("تم حفظ سجل الموظف.");
    } catch {
      setError("تعذر حفظ سجل الموظف. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function saveLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsedEmployeeNumber = Number(leaveEmployeeNumber);
    if (!parsedEmployeeNumber || !leaveDate || !returnDate || !leaveType.trim()) {
      setError("أكمل الموظف ونوع الإجازة وتاريخيها.");
      return;
    }
    if (returnDate < leaveDate) {
      setError("تاريخ العودة لا يمكن أن يسبق تاريخ بداية الإجازة.");
      return;
    }

    setSaving(true);
    try {
      let entry: StaffLeaveEntry;
      if (persistent) {
        const result = await recordStaffLeaveAction({
          employeeNumber: parsedEmployeeNumber,
          leaveDate,
          returnDate,
          leaveType,
          notes: leaveNotes,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        entry = result.leaveEntry;
      } else {
        const employee = bundle.employees.find(
          (item) => item.employeeNumber === parsedEmployeeNumber,
        );
        if (!employee) {
          setError("اختر موظفًا مسجلًا أولًا.");
          return;
        }
        entry = {
          id: Math.max(0, ...bundle.leaveEntries.map((item) => item.id)) + 1,
          leaveDate,
          returnDate,
          leaveType: leaveType.trim(),
          notes: leaveNotes.trim(),
          employeeNumber: employee.employeeNumber,
          employeeName: employee.employeeName,
        };
      }

      onBundleChange((current) => ({
        ...current,
        leaveEntries: [entry, ...current.leaveEntries],
      }));
      setLeaveType("");
      setLeaveNotes("");
      setMessage("تم تسجيل الإجازة.");
    } catch {
      setError("تعذر تسجيل الإجازة. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAccountLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const profileNumber = Number(linkedProfileNumber);
    const employeeNumber = Number(linkedEmployeeNumber);
    if (!selectedAccountId || !profileNumber || !employeeNumber) {
      setError("اختر الحساب وملف الموظف وسجل الإجازات.");
      return;
    }

    const existingProfileLink = bundle.accountLinks.find(
      (link) =>
        link.profileNumber === profileNumber &&
        link.userId !== selectedAccountId,
    );
    const existingEmployeeLink = bundle.accountLinks.find(
      (link) =>
        link.employeeNumber === employeeNumber &&
        link.userId !== selectedAccountId,
    );
    if (existingProfileLink || existingEmployeeLink) {
      setError("ملف الموظف أو سجل الإجازات مرتبط بحساب آخر.");
      return;
    }

    setSaving(true);
    try {
      let link: StaffAccountLink;
      if (persistent) {
        const result = await linkStaffAccountAction({
          userId: selectedAccountId,
          profileNumber,
          employeeNumber,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        link = result.link;
      } else {
        link = {
          userId: selectedAccountId,
          profileNumber,
          employeeNumber,
        };
      }

      onBundleChange((current) => ({
        ...current,
        accountLinks: [
          ...current.accountLinks.filter(
            (item) => item.userId !== link.userId,
          ),
          link,
        ],
      }));
      setMessage("تم ربط حساب الدخول بالملف وسجل الإجازات.");
    } catch {
      setError("تعذر ربط الحساب. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  function renderLeaveEntries(entries: StaffLeaveEntry[]) {
    if (!entries.length) {
      return <div className="empty-state">لا توجد إجازات مسجلة.</div>;
    }
    return (
      <div className="staff-record-list">
        {entries.map((entry) => (
          <article className="staff-record" key={entry.id}>
            <div>
              <strong>{entry.leaveType}</strong>
              {canViewAllStaff && <span>{entry.employeeName}</span>}
            </div>
            <div className="staff-record-meta">
              <span>
                من {entry.leaveDate} إلى {entry.returnDate}
              </span>
              {entry.notes && <span>{entry.notes}</span>}
            </div>
          </article>
        ))}
      </div>
    );
  }

  const selectedAccountLink = bundle.accountLinks.find(
    (link) => link.userId === selectedAccountId,
  );

  return (
    <section className="content-panel staff-panel">
      <div className="panel-heading">
        <div>
          <h3>ملفات الموظفين والإجازات</h3>
          <p>
            {canViewAllStaff
              ? "إدارة ملفات الموظفين وربط الحسابات وسجل الإجازات."
              : "عرض ملفك الشخصي وسجل إجازاتك فقط."}
          </p>
        </div>
        <span className="status-pill current">
          {isAdministrator ? "إدارة المسؤول" : canViewAllStaff ? "عرض فقط" : "عرض شخصي"}
        </span>
      </div>

      <div className="staff-tabs" role="tablist" aria-label="أقسام الموظفين">
        <button
          type="button"
          className={section === "profile" ? "active" : ""}
          onClick={() => setSection("profile")}
        >
          {canViewAllStaff ? "الملفات الشخصية" : "ملفي الشخصي"}
        </button>
        {canViewAllStaff && (
          <button
            type="button"
            className={section === "employees" ? "active" : ""}
            onClick={() => setSection("employees")}
          >
            دليل الموظفين
          </button>
        )}
        <button
          type="button"
          className={section === "leave" ? "active" : ""}
          onClick={() => setSection("leave")}
        >
          الإجازات
        </button>
        {isAdministrator && (
          <button
            type="button"
            className={section === "links" ? "active" : ""}
            onClick={() => setSection("links")}
          >
            ربط الحسابات
          </button>
        )}
      </div>

      {error && <p className="form-error staff-panel-message">{error}</p>}
      {message && <p className="staff-panel-success">{message}</p>}

      {section === "profile" && canViewAllStaff && (
        <div className="staff-section">
          {isAdministrator && <div className="staff-section-heading">
            <div>
              <h4>{editingProfileNumber ? "تعديل ملف موظف" : "إضافة ملف موظف"}</h4>
              <p>أدخل بيانات الموظف الأساسية وبيانات التواصل.</p>
            </div>
            {editingProfileNumber && (
              <button
                className="secondary-button"
                type="button"
                onClick={startNewProfile}
              >
                إلغاء التعديل
              </button>
            )}
          </div>}
          {isAdministrator && <form className="staff-profile-form" onSubmit={saveProfile}>
            <StaffProfileFields
              value={profileDraft}
              onChange={updateProfileDraft}
              lookups={lookups}
            />
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "جارٍ الحفظ..." : "حفظ ملف الموظف"}
            </button>
          </form>}
          <div className="staff-record-list">
            {bundle.profiles.map((profile) => (
              <article className="staff-record" key={profile.profileNumber}>
                <div>
                  <strong>{displayName(profile) || `ملف ${profile.profileNumber}`}</strong>
                  <span>
                    ID1: {profile.profileNumber}
                    {profile.employeeId ? ` · ID: ${profile.employeeId}` : ""}
                  </span>
                </div>
                {isAdministrator && <button
                  className="secondary-button"
                  type="button"
                  onClick={() => startEditingProfile(profile)}
                >
                  تعديل
                </button>}
              </article>
            ))}
          </div>
        </div>
      )}

      {section === "profile" && !canViewAllStaff && (
        ownProfile ? (
          <div className="staff-section">
            <div className="staff-section-heading">
              <div>
                <h4>{displayName(ownProfile)}</h4>
                <p>الملف مرتبط بحسابك بواسطة مسؤول النظام.</p>
              </div>
            </div>
            <StaffProfileFields value={ownProfile} lookups={lookups} disabled />
          </div>
        ) : (
          <div className="empty-state">
            لم يربط المسؤول حسابك بعد بملف موظف.
          </div>
        )
      )}

      {section === "employees" && canViewAllStaff && (
        <div className="staff-section">
          <div className="staff-section-heading">
            <div>
              <h4>دليل الموظفين</h4>
              <p>يرتبط سجل الإجازة بالموظف المسجل في هذا الدليل.</p>
            </div>
          </div>
          {isAdministrator && <form className="form-grid staff-inline-form" onSubmit={saveEmployee}>
            <label className="form-field">
              ID (اختياري)
              <input
                type="number"
                min="1"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
              />
            </label>
            <label className="form-field">
              رقم الموظف
              <input
                type="number"
                min="1"
                value={employeeNumber}
                onChange={(event) => setEmployeeNumber(event.target.value)}
                required
              />
            </label>
            <label className="form-field">
              اسم الموظف / العامل
              <input
                value={employeeName}
                onChange={(event) => setEmployeeName(event.target.value)}
                required
              />
            </label>
            <button className="primary-button" disabled={saving} type="submit">
              حفظ الموظف
            </button>
          </form>}
          <div className="staff-record-list">
            {bundle.employees.map((employee) => (
              <article className="staff-record" key={employee.employeeNumber}>
                <div>
                  <strong>{employee.employeeName}</strong>
                  <span>
                    ID: {employee.id ?? "—"} · رقم الموظف:{" "}
                    {employee.employeeNumber}
                  </span>
                </div>
                {isAdministrator && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setEmployeeId(employee.id === null ? "" : String(employee.id));
                      setEmployeeNumber(String(employee.employeeNumber));
                      setEmployeeName(employee.employeeName);
                      setSection("employees");
                    }}
                  >
                    تعديل
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {section === "leave" && (
        <div className="staff-section">
          {isAdministrator ? (
            <>
              <div className="staff-section-heading">
                <div>
                  <h4>تسجيل إجازة معتمدة</h4>
                  <p>
                    الإدخال للمسؤول فقط؛ نوع الإجازة نص حر، ولا
                    توجد حالة طلب أو موافقة منفصلة.
                  </p>
                </div>
              </div>
              <form className="form-grid staff-inline-form" onSubmit={saveLeave}>
                <label className="form-field">
                  الموظف
                  <select
                    value={leaveEmployeeNumber}
                    onChange={(event) =>
                      setLeaveEmployeeNumber(event.target.value)
                    }
                    required
                  >
                    <option value="">اختر الموظف</option>
                    {bundle.employees.map((employee) => (
                      <option
                        key={employee.employeeNumber}
                        value={employee.employeeNumber}
                      >
                        {employee.employeeName} — {employee.employeeNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  تاريخ النزول
                  <input
                    type="date"
                    value={leaveDate}
                    onChange={(event) => setLeaveDate(event.target.value)}
                    required
                  />
                </label>
                <label className="form-field">
                  تاريخ العودة
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(event) => setReturnDate(event.target.value)}
                    required
                  />
                </label>
                <label className="form-field">
                  نوع الاجازة
                  <input
                    value={leaveType}
                    onChange={(event) => setLeaveType(event.target.value)}
                    required
                  />
                </label>
                <label className="form-field full">
                  ملاحظات
                  <textarea
                    rows={2}
                    value={leaveNotes}
                    onChange={(event) => setLeaveNotes(event.target.value)}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={saving || bundle.employees.length === 0}
                  type="submit"
                >
                  تسجيل الإجازة
                </button>
              </form>
            </>
          ) : (
            <div className="staff-section-heading">
              <div>
                <h4>سجل إجازاتي</h4>
                <p>الإجازات المعتمدة المرتبطة بحسابك.</p>
              </div>
            </div>
          )}
          {renderLeaveEntries(visibleLeaves)}
        </div>
      )}

      {section === "links" && isAdministrator && (
        <div className="staff-section">
          <div className="staff-section-heading">
            <div>
              <h4>ربط الحساب بملف الموظف</h4>
              <p>
                اربط حساب المستخدم بملف الموظف ورقم الموظف المناسبين لعرض الإجازات.
              </p>
            </div>
          </div>
          <form className="form-grid staff-inline-form" onSubmit={saveAccountLink}>
            <label className="form-field">
              حساب الدخول
              <select
                value={selectedAccountId}
                onChange={(event) => {
                  const userId = event.target.value;
                  const link = bundle.accountLinks.find(
                    (item) => item.userId === userId,
                  );
                  setSelectedAccountId(userId);
                  setLinkedProfileNumber(
                    link ? String(link.profileNumber) : "",
                  );
                  setLinkedEmployeeNumber(
                    link ? String(link.employeeNumber) : "",
                  );
                }}
                required
              >
                <option value="">اختر حساب الموظف</option>
                {users
                  .filter((user) => user.role === "staff")
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} {user.email ? `— ${user.email}` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field">
              ملف «تحديث البيانات»
              <select
                value={linkedProfileNumber}
                onChange={(event) => setLinkedProfileNumber(event.target.value)}
                required
              >
                <option value="">اختر الملف</option>
                {bundle.profiles.map((profile) => (
                  <option
                    key={profile.profileNumber}
                    value={profile.profileNumber}
                  >
                    {displayName(profile) || `ملف ${profile.profileNumber}`}
                    {" — ID1: "}
                    {profile.profileNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              سجل «الموظفين» للإجازات
              <select
                value={linkedEmployeeNumber}
                onChange={(event) =>
                  setLinkedEmployeeNumber(event.target.value)
                }
                required
              >
                <option value="">اختر سجل الموظف</option>
                {bundle.employees.map((employee) => (
                  <option
                    key={employee.employeeNumber}
                    value={employee.employeeNumber}
                  >
                    {employee.employeeName} — {employee.employeeNumber}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              disabled={
                saving ||
                !users.some((user) => user.role === "staff") ||
                !bundle.profiles.length ||
                !bundle.employees.length
              }
              type="submit"
            >
              ربط الحساب
            </button>
          </form>
          <div className="staff-record-list">
            {bundle.accountLinks.map((link) => {
              const account = users.find((user) => user.id === link.userId);
              const profile = bundle.profiles.find(
                (item) => item.profileNumber === link.profileNumber,
              );
              const employee = bundle.employees.find(
                (item) => item.employeeNumber === link.employeeNumber,
              );
              return (
                <article className="staff-record" key={link.userId}>
                  <div>
                    <strong>{account?.name ?? link.userId}</strong>
                    <span>
                      {displayName(profile ?? { ...emptyProfile, profileNumber: 0 })}
                      {" · "}
                      {employee?.employeeName ?? link.employeeNumber}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
          {selectedAccountLink && (
            <p className="form-hint">
              الحساب المحدد مرتبط حاليًا بالملف {selectedAccountLink.profileNumber}
              {" وسجل الموظف "}
              {selectedAccountLink.employeeNumber}.
            </p>
          )}
          {!bundle.accountOptions.length && persistent && (
            <p className="form-hint">
              ستظهر هنا الحسابات التي أنشأها المسؤول من صفحة إدارة الوصول.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
