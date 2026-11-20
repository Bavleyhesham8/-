"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  createGateVisitAction,
  deleteGateVisitAction,
  recordGateExitAction,
  updateGateVisitAction,
} from "@/app/actions/gate";
import type {
  GateBundle,
  GatePersonKind,
  GatePersonOption,
  GateVisit,
  GateVisitorProfile,
} from "@/lib/gate-types";

type Props = {
  bundle: GateBundle;
  persistent: boolean;
  canManage: boolean;
};

const kindLabels: Record<GatePersonKind, string> = {
  resident: "نزيل",
  employee: "موظف",
  visitor: "زائر",
};

const kindClasses: Record<GatePersonKind, string> = {
  resident: "bg-emerald-50 text-emerald-800 border-emerald-200",
  employee: "bg-sky-50 text-sky-800 border-sky-200",
  visitor: "bg-amber-50 text-amber-800 border-amber-200",
};

const dateTimeFormatter = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Cairo",
});

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

function durationLabel(entryAt: string, exitAt: string | null) {
  if (!exitAt) return "داخل الآن";
  const minutes = Math.max(
    0,
    Math.floor((Date.parse(exitAt) - Date.parse(entryAt)) / 60_000),
  );
  const hours = Math.floor(minutes / 60);
  return `${hours} س ${minutes % 60} د`;
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nowLocalInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function makeLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `gate-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function personKey(person: GatePersonOption) {
  return `${person.kind}:${person.id}`;
}

export default function GatePanel({ bundle, persistent, canManage }: Props) {
  const [visits, setVisits] = useState(bundle.visits);
  const [visitors, setVisitors] = useState(bundle.visitors);
  const [personQuery, setPersonQuery] = useState("");
  const [selectedPerson, setSelectedPerson] =
    useState<GatePersonOption | null>(null);
  const [addingVisitor, setAddingVisitor] = useState(false);
  const [visitorName, setVisitorName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [entryAt, setEntryAt] = useState(nowLocalInput);
  const [exitAt, setExitAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyKind, setHistoryKind] = useState<"all" | GatePersonKind>("all");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [editingVisit, setEditingVisit] = useState<GateVisit | null>(null);
  const [editEntryAt, setEditEntryAt] = useState("");
  const [editExitAt, setEditExitAt] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const visitorOptions = useMemo<GatePersonOption[]>(
    () =>
      visitors.map((visitor) => ({
        kind: "visitor",
        id: visitor.id,
        name: visitor.name,
        nationalId: visitor.nationalId,
        meta: visitor.phone
          ? `زائر · ${visitor.phone}`
          : `زائر · ${visitor.visitCount} زيارة`,
      })),
    [visitors],
  );

  const allPeople = useMemo(
    () => [...bundle.residents, ...bundle.employees, ...visitorOptions],
    [bundle.employees, bundle.residents, visitorOptions],
  );

  const filteredPeople = useMemo(() => {
    const query = personQuery.trim().toLocaleLowerCase("ar");
    if (!query) return allPeople.slice(0, 10);
    return allPeople
      .filter((person) =>
        [person.name, person.nationalId, person.meta]
          .join(" ")
          .toLocaleLowerCase("ar")
          .includes(query),
      )
      .slice(0, 10);
  }, [allPeople, personQuery]);

  const openVisits = useMemo(
    () => visits.filter((visit) => !visit.exitAt),
    [visits],
  );

  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  }, []);

  function isToday(value: string) {
    const date = new Date(value);
    return (
      Number.isFinite(date.getTime()) &&
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` === todayKey
    );
  }

  const todayEntries = visits.filter((visit) => isToday(visit.entryAt)).length;
  const todayExits = visits.filter(
    (visit) => visit.exitAt && isToday(visit.exitAt),
  ).length;

  const historyRows = useMemo(() => {
    const query = historySearch.trim().toLocaleLowerCase("ar");
    return visits.filter((visit) => {
      const entryDate = visit.entryAt.slice(0, 10);
      if (historyKind !== "all" && visit.personKind !== historyKind) return false;
      if (historyFrom && entryDate < historyFrom) return false;
      if (historyTo && entryDate > historyTo) return false;
      if (
        query &&
        ![visit.personName, visit.nationalId, visit.notes]
          .join(" ")
          .toLocaleLowerCase("ar")
          .includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [historyFrom, historyKind, historySearch, historyTo, visits]);

  function resetCheckInForm() {
    setSelectedPerson(null);
    setAddingVisitor(false);
    setPersonQuery("");
    setVisitorName("");
    setNationalId("");
    setPhone("");
    setEntryAt(nowLocalInput());
    setExitAt("");
    setNotes("");
  }

  function selectPerson(person: GatePersonOption) {
    setSelectedPerson(person);
    setAddingVisitor(false);
    setPersonQuery("");
    setVisitorName(person.name);
    setNationalId(person.nationalId);
    setPhone("");
  }

  function showMessage(text: string, isError = false) {
    setMessage(text);
    setMessageIsError(isError);
  }

  function updateVisitorAfterVisit(visit: GateVisit) {
    if (visit.personKind !== "visitor" || !visit.personId) return;
    setVisitors((current) => {
      const existing = current.find((visitor) => visitor.id === visit.personId);
      if (!existing) {
        return [
          {
            id: visit.personId!,
            name: visit.personName,
            nationalId: visit.nationalId,
            phone: "",
            notes: visit.notes,
            visitCount: 1,
            lastVisitAt: visit.entryAt,
          },
          ...current,
        ];
      }
      return current.map((visitor) =>
        visitor.id === visit.personId
          ? {
              ...visitor,
              visitCount: visitor.visitCount + 1,
              lastVisitAt: visit.entryAt,
            }
          : visitor,
      );
    });
  }

  async function submitCheckIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || saving) return;
    if (!addingVisitor && !selectedPerson) {
      showMessage("اختر شخصًا من القائمة أو أضف زائرًا جديدًا.", true);
      return;
    }
    if (addingVisitor && !visitorName.trim()) {
      showMessage("أدخل اسم الزائر الجديد.", true);
      return;
    }
    if (!entryAt) {
      showMessage("أدخل وقت الدخول.", true);
      return;
    }

    const entryIso = new Date(entryAt).toISOString();
    const exitIso = exitAt ? new Date(exitAt).toISOString() : "";
    if (exitIso && exitIso <= entryIso) {
      showMessage("وقت الخروج يجب أن يكون بعد وقت الدخول.", true);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      if (!persistent) {
        const visit: GateVisit = {
          id: makeLocalId(),
          personKind: addingVisitor ? "visitor" : selectedPerson!.kind,
          personId: addingVisitor ? makeLocalId() : selectedPerson!.id,
          personName: addingVisitor ? visitorName.trim() : selectedPerson!.name,
          nationalId: addingVisitor
            ? nationalId.trim()
            : selectedPerson!.nationalId,
          entryAt: entryIso,
          exitAt: exitIso || null,
          notes: notes.trim(),
          createdAt: new Date().toISOString(),
        };
        setVisits((current) => [visit, ...current]);
        updateVisitorAfterVisit(visit);
        showMessage("تم تسجيل الزيارة في العرض التجريبي.");
        resetCheckInForm();
        return;
      }

      const result = await createGateVisitAction(
        addingVisitor
          ? {
              personKind: "visitor",
              visitorName: visitorName.trim(),
              nationalId: nationalId.trim(),
              phone: phone.trim(),
              entryAt: entryIso,
              exitAt: exitIso,
              notes: notes.trim(),
            }
          : {
              personKind: selectedPerson!.kind,
              personId: selectedPerson!.id,
              entryAt: entryIso,
              exitAt: exitIso,
              notes: notes.trim(),
            },
      );
      if (!result.ok) {
        showMessage(result.error, true);
        return;
      }
      setVisits((current) => [result.visit, ...current]);
      updateVisitorAfterVisit(result.visit);
      showMessage("تم تسجيل الدخول بنجاح.");
      resetCheckInForm();
    } catch {
      showMessage("تعذر تسجيل الزيارة. حاول مرة أخرى.", true);
    } finally {
      setSaving(false);
    }
  }

  async function recordExit(visit: GateVisit) {
    if (!canManage || saving) return;
    setSaving(true);
    setMessage("");
    try {
      if (!persistent) {
        const exitIso = new Date().toISOString();
        setVisits((current) =>
          current.map((item) =>
            item.id === visit.id ? { ...item, exitAt: exitIso } : item,
          ),
        );
        showMessage("تم تسجيل الخروج في العرض التجريبي.");
        return;
      }
      const result = await recordGateExitAction({ id: visit.id });
      if (!result.ok) {
        showMessage(result.error, true);
        return;
      }
      setVisits((current) =>
        current.map((item) =>
          item.id === result.visit.id ? result.visit : item,
        ),
      );
      showMessage("تم تسجيل الخروج بنجاح.");
    } catch {
      showMessage("تعذر تسجيل الخروج. حاول مرة أخرى.", true);
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(visit: GateVisit) {
    setEditingVisit(visit);
    setEditEntryAt(toLocalInput(visit.entryAt));
    setEditExitAt(toLocalInput(visit.exitAt));
    setEditNotes(visit.notes);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !editingVisit || saving) return;
    const entryIso = new Date(editEntryAt).toISOString();
    const exitIso = editExitAt ? new Date(editExitAt).toISOString() : "";
    if (exitIso && exitIso <= entryIso) {
      showMessage("وقت الخروج يجب أن يكون بعد وقت الدخول.", true);
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      if (!persistent) {
        setVisits((current) =>
          current.map((item) =>
            item.id === editingVisit.id
              ? {
                  ...item,
                  entryAt: entryIso,
                  exitAt: exitIso || null,
                  notes: editNotes.trim(),
                }
              : item,
          ),
        );
        setEditingVisit(null);
        showMessage("تم تعديل الزيارة في العرض التجريبي.");
        return;
      }
      const result = await updateGateVisitAction({
        id: editingVisit.id,
        entryAt: entryIso,
        exitAt: exitIso,
        notes: editNotes.trim(),
      });
      if (!result.ok) {
        showMessage(result.error, true);
        return;
      }
      setVisits((current) =>
        current.map((item) =>
          item.id === result.visit.id ? result.visit : item,
        ),
      );
      setEditingVisit(null);
      showMessage("تم تعديل الزيارة بنجاح.");
    } catch {
      showMessage("تعذر تعديل الزيارة. حاول مرة أخرى.", true);
    } finally {
      setSaving(false);
    }
  }

  async function deleteVisit(visit: GateVisit) {
    if (!canManage || saving) return;
    if (!window.confirm(`حذف زيارة ${visit.personName}؟`)) return;
    setSaving(true);
    setMessage("");
    try {
      if (!persistent) {
        setVisits((current) => current.filter((item) => item.id !== visit.id));
        showMessage("تم حذف الزيارة في العرض التجريبي.");
        return;
      }
      const result = await deleteGateVisitAction(visit.id);
      if (!result.ok) {
        showMessage(result.error, true);
        return;
      }
      setVisits((current) => current.filter((item) => item.id !== visit.id));
      showMessage("تم حذف الزيارة.");
    } catch {
      showMessage("تعذر حذف الزيارة. حاول مرة أخرى.", true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5" dir="rtl">
      {!persistent && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900"
          role="status"
        >
          هذه بيانات تجريبية؛ تسجيل الزيارات الفعلي يحتاج تشغيل وضع قاعدة
          البيانات الدائمة.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="الموجودون الآن" value={openVisits.length} tone="emerald" />
        <StatCard label="دخول اليوم" value={todayEntries} tone="sky" />
        <StatCard label="خروج اليوم" value={todayExits} tone="amber" />
        <StatCard label="ملفات الزوار" value={visitors.length} tone="slate" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <form
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          onSubmit={submitCheckIn}
        >
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                تسجيل دخول جديد
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                اختر نزيلًا أو موظفًا من الموجودين، أو أضف زائرًا جديدًا بملف
                دائم.
              </p>
            </div>
            <span
              className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-bold ${
                canManage
                  ? "border-teal-200 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {canManage ? "مسموح بالتسجيل" : "عرض فقط"}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            <div className="relative">
              <label className="mb-1.5 block text-sm font-bold text-slate-700">
                البحث عن شخص
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100"
                type="search"
                placeholder="اكتب الاسم أو الرقم القومي أو رقم الملف..."
                value={personQuery}
                onChange={(event) => setPersonQuery(event.target.value)}
                disabled={!canManage || addingVisitor}
              />
              {selectedPerson && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2">
                  <span className="text-sm font-bold text-teal-900">
                    {selectedPerson.name}
                  </span>
                  <span className="text-xs text-teal-700">
                    {selectedPerson.meta}
                  </span>
                  <button
                    className="ms-auto text-xs font-bold text-teal-800 underline"
                    type="button"
                    onClick={resetCheckInForm}
                    disabled={!canManage}
                  >
                    تغيير
                  </button>
                </div>
              )}
              {!selectedPerson && !addingVisitor && personQuery && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                  {filteredPeople.map((person) => (
                    <button
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-right transition hover:bg-slate-50"
                      key={personKey(person)}
                      type="button"
                      onClick={() => selectPerson(person)}
                    >
                      <span>
                        <span className="block text-sm font-bold text-slate-800">
                          {person.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {person.meta}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${kindClasses[person.kind]}`}
                      >
                        {kindLabels[person.kind]}
                      </span>
                    </button>
                  ))}
                  {filteredPeople.length === 0 && (
                    <p className="px-3 py-3 text-sm text-slate-500">
                      لا توجد نتائج مطابقة. يمكنك إضافة زائر جديد.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                  addingVisitor
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                type="button"
                onClick={() => {
                  setAddingVisitor(true);
                  setSelectedPerson(null);
                  setPersonQuery("");
                  setVisitorName("");
                  setNationalId("");
                  setPhone("");
                  setEntryAt(nowLocalInput());
                }}
                disabled={!canManage}
              >
                + زائر جديد
              </button>
              {allPeople.length === 0 && (
                <span className="self-center text-xs text-slate-500">
                  لا توجد أسماء مسجلة بعد؛ ابدأ بإضافة زائر جديد.
                </span>
              )}
            </div>

            {addingVisitor && (
              <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                  اسم الزائر *
                  <input
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                    value={visitorName}
                    onChange={(event) => setVisitorName(event.target.value)}
                    placeholder="الاسم بالكامل"
                    disabled={!canManage}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                  الرقم القومي
                  <input
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                    value={nationalId}
                    onChange={(event) => setNationalId(event.target.value)}
                    placeholder="14 رقمًا"
                    inputMode="numeric"
                    disabled={!canManage}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                  رقم الهاتف
                  <input
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2.5"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="اختياري"
                    disabled={!canManage}
                  />
                </label>
                <p className="self-end rounded-lg bg-white/70 px-3 py-2 text-xs leading-5 text-slate-600">
                  يُحفظ ملف الزائر تلقائيًا، وعند زيارته التالية ابحث عنه بالاسم
                  أو الرقم القومي.
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                وقت الدخول *
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2.5"
                  type="datetime-local"
                  value={entryAt}
                  onChange={(event) => setEntryAt(event.target.value)}
                  disabled={!canManage}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                وقت الخروج (اختياري)
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2.5"
                  type="datetime-local"
                  value={exitAt}
                  onChange={(event) => setExitAt(event.target.value)}
                  disabled={!canManage}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              ملاحظات
              <textarea
                className="min-h-20 rounded-lg border border-slate-300 px-3 py-2.5"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="سبب الزيارة أو أي ملاحظات..."
                disabled={!canManage}
              />
            </label>

            <button
              className="min-h-12 w-full rounded-xl bg-teal-700 px-5 py-3 text-base font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              type="submit"
              disabled={!canManage || saving}
            >
              {saving ? "جارٍ التسجيل..." : "تسجيل الدخول"}
            </button>

            {message && (
              <p
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  messageIsError
                    ? "bg-rose-50 text-rose-800"
                    : "bg-emerald-50 text-emerald-800"
                }`}
                role={messageIsError ? "alert" : "status"}
              >
                {message}
              </p>
            )}
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                الموجودون الآن
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                زيارات لم يُسجَّل خروجها بعد.
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              {openVisits.length}
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {openVisits.map((visit) => (
              <div
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                key={visit.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">
                      {visit.personName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {kindLabels[visit.personKind]} · دخل{" "}
                      {formatDateTime(visit.entryAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${kindClasses[visit.personKind]}`}
                  >
                    {kindLabels[visit.personKind]}
                  </span>
                </div>
                {canManage && (
                  <button
                    className="mt-2 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                    type="button"
                    onClick={() => void recordExit(visit)}
                    disabled={saving}
                  >
                    تسجيل الخروج
                  </button>
                )}
              </div>
            ))}
            {openVisits.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                لا يوجد أحد داخل المركز الآن.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div>
            <h3 className="font-bold text-slate-900">سجل الزيارات</h3>
            <p className="mt-1 text-sm text-slate-500">
              كل عمليات الدخول والخروج مع إمكانية البحث والتصفية.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="search"
              placeholder="بحث بالاسم أو الرقم القومي..."
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
            />
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={historyKind}
              onChange={(event) =>
                setHistoryKind(event.target.value as "all" | GatePersonKind)
              }
            >
              <option value="all">كل الأنواع</option>
              <option value="resident">النزلاء</option>
              <option value="employee">الموظفون</option>
              <option value="visitor">الزوار</option>
            </select>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="date"
              value={historyFrom}
              onChange={(event) => setHistoryFrom(event.target.value)}
              aria-label="من تاريخ"
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="date"
              value={historyTo}
              onChange={(event) => setHistoryTo(event.target.value)}
              aria-label="إلى تاريخ"
            />
          </div>
        </div>

        <div className="table-scroll">
          <table className="min-w-[900px] w-full text-right text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3">الشخص</th>
                <th className="px-4 py-3">النوع</th>
                <th className="px-4 py-3">الرقم القومي</th>
                <th className="px-4 py-3">الدخول</th>
                <th className="px-4 py-3">الخروج</th>
                <th className="px-4 py-3">المدة</th>
                <th className="px-4 py-3">ملاحظات</th>
                {canManage && <th className="px-4 py-3">الإجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {historyRows.map((visit) => (
                <tr key={visit.id}>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {visit.personName}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${kindClasses[visit.personKind]}`}
                    >
                      {kindLabels[visit.personKind]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {visit.nationalId || "—"}
                  </td>
                  <td className="px-4 py-3">{formatDateTime(visit.entryAt)}</td>
                  <td className="px-4 py-3">{formatDateTime(visit.exitAt)}</td>
                  <td className="px-4 py-3">
                    {durationLabel(visit.entryAt, visit.exitAt)}
                  </td>
                  <td className="max-w-56 truncate px-4 py-3 text-slate-600">
                    {visit.notes || "—"}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          className="table-action"
                          type="button"
                          onClick={() => beginEdit(visit)}
                          disabled={saving}
                        >
                          تعديل
                        </button>
                        {!visit.exitAt && (
                          <button
                            className="table-action"
                            type="button"
                            onClick={() => void recordExit(visit)}
                            disabled={saving}
                          >
                            خروج
                          </button>
                        )}
                        <button
                          className="table-action danger"
                          type="button"
                          onClick={() => void deleteVisit(visit)}
                          disabled={saving}
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {historyRows.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-slate-500"
                    colSpan={canManage ? 8 : 7}
                  >
                    لا توجد زيارات مطابقة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingVisit && canManage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingVisit(null);
          }}
        >
          <form
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
            onSubmit={saveEdit}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">
                تعديل زيارة {editingVisit.personName}
              </h3>
              <button
                className="rounded-lg px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
                type="button"
                onClick={() => setEditingVisit(null)}
              >
                إغلاق
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                وقت الدخول
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2.5"
                  type="datetime-local"
                  value={editEntryAt}
                  onChange={(event) => setEditEntryAt(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                وقت الخروج
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2.5"
                  type="datetime-local"
                  value={editExitAt}
                  onChange={(event) => setEditExitAt(event.target.value)}
                />
              </label>
            </div>
            <label className="mt-3 flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
              ملاحظات
              <textarea
                className="min-h-20 rounded-lg border border-slate-300 px-3 py-2.5"
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:bg-slate-300"
                type="submit"
                disabled={saving}
              >
                {saving ? "جارٍ الحفظ..." : "حفظ التعديل"}
              </button>
              <button
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={() => setEditingVisit(null)}
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "sky" | "amber" | "slate";
}) {
  const toneClasses = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClasses}`}>
      <p className="text-xs font-bold opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-black">{value.toLocaleString("ar-EG")}</p>
    </div>
  );
}
