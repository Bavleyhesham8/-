"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  createCustodyIssueAction,
  returnCustodyItemAction,
  transferCustodyItemAction,
  voidCustodyAction,
} from "@/app/actions/custody";
import PrintBrand from "@/components/print-brand";
import { createDemoId } from "@/lib/inventory-demo-data";
import { formatDate, localDateValue } from "@/lib/date-format";
import type {
  CustodyBundle,
  CustodyEvent,
  CustodyRecord,
} from "@/lib/custody-types";

type Props = {
  bundle: CustodyBundle;
  persistent: boolean;
  canManage: boolean;
  currentEmployeeNumber: number | null;
  onBundleChange: (
    update: (current: CustodyBundle) => CustodyBundle,
  ) => void;
};

type DraftLine = {
  itemName: string;
  unit: string;
  quantity: string;
  notes: string;
};

type ActionTarget =
  | {
      kind: "return" | "transfer";
      custodyNumber: number;
      detailId: string;
      itemName: string;
      outstandingQuantity: number;
    }
  | { kind: "void"; custodyNumber: number };

const numberFormatter = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 2,
});

function eventLabel(event: CustodyEvent) {
  if (event.kind === "return") return "مرتجع";
  if (event.kind === "void") return "إلغاء";
  return "نقل";
}

const emptyDraftLine = (): DraftLine => ({
  itemName: "",
  unit: "",
  quantity: "1",
  notes: "",
});

export default function CustodyPanel({
  bundle,
  persistent,
  canManage,
  currentEmployeeNumber,
  onBundleChange,
}: Props) {
  const [issueDate, setIssueDate] = useState(localDateValue());
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([emptyDraftLine()]);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [actionDate, setActionDate] = useState(localDateValue());
  const [actionQuantity, setActionQuantity] = useState("");
  const [targetEmployeeNumber, setTargetEmployeeNumber] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [printingCustodyNumber, setPrintingCustodyNumber] = useState<
    number | null
  >(null);
  const [recordSearch, setRecordSearch] = useState("");
  const [recordStartDate, setRecordStartDate] = useState("");
  const [recordEndDate, setRecordEndDate] = useState("");

  const preparedLines = draftLines.map((line) => ({
    ...line,
    quantityValue: Number(line.quantity),
    valid:
      !!line.itemName.trim() &&
      Number.isFinite(Number(line.quantity)) &&
      Number(line.quantity) > 0,
  }));
  const canSaveIssue =
    !!bundle.employees.length &&
    !!employeeNumber &&
    preparedLines.every((line) => line.valid);
  const visibleRecords = useMemo(() => {
    const search = recordSearch.trim().toLocaleLowerCase();
    return bundle.records.filter(
      (record) =>
        (!search ||
          record.recipientName.toLocaleLowerCase().includes(search) ||
          record.details.some(
            (detail) =>
              detail.currentEmployeeName
                ?.toLocaleLowerCase()
                .includes(search) ||
              detail.itemName.toLocaleLowerCase().includes(search),
          )) &&
        (!recordStartDate || record.custodyDate >= recordStartDate) &&
        (!recordEndDate || record.custodyDate <= recordEndDate),
    );
  }, [bundle.records, recordSearch, recordStartDate, recordEndDate]);
  const availableQuantity = actionTarget
    ? actionTarget.kind === "void"
      ? 0
      : actionTarget.outstandingQuantity
    : 0;

  function setSuccess(text: string) {
    setError("");
    setMessage(text);
  }

  function printCustodyReceipt(custodyNumber?: number) {
    document.body.classList.remove("print-single-custody");
    setPrintingCustodyNumber(custodyNumber ?? null);
    requestAnimationFrame(() => {
      if (custodyNumber !== undefined) {
        document.body.classList.add("print-single-custody");
      }
      window.print();
      window.setTimeout(() => {
        document.body.classList.remove("print-single-custody");
        setPrintingCustodyNumber(null);
      }, 500);
    });
  }

  function updateDraft(index: number, patch: Partial<DraftLine>) {
    setDraftLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function openAction(target: ActionTarget) {
    setError("");
    setMessage("");
    setActionDate(localDateValue());
    setActionQuantity(
      target.kind === "return" ? String(target.outstandingQuantity) : "",
    );
    setTargetEmployeeNumber("");
    setVoidReason("");
    setActionTarget(target);
  }

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!canSaveIssue || !issueDate) {
      setError("أدخل الموظف والتاريخ وبندًا صالحًا على الأقل.");
      return;
    }
    const employee = bundle.employees.find(
      (candidate) => candidate.employeeNumber === Number(employeeNumber),
    );
    if (!employee) {
      setError("اختر موظفًا مسجلًا في دليل الموظفين.");
      return;
    }
    const lines = preparedLines.map((line) => ({
      itemName: line.itemName.trim(),
      unit: line.unit.trim(),
      quantity: line.quantityValue,
      notes: line.notes.trim(),
    }));
    setSaving(true);
    try {
      if (persistent) {
        const result = await createCustodyIssueAction({
          custodyDate: issueDate,
          employeeNumber: employee.employeeNumber,
          items: lines,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onBundleChange(() => result.bundle);
      } else {
        onBundleChange((current) => {
          const record: CustodyRecord = {
            custodyNumber:
              Math.max(
                0,
                ...current.records.map((entry) => entry.custodyNumber),
              ) + 1,
            custodyDate: issueDate,
            recipientEmployeeNumber: employee.employeeNumber,
            recipientName: employee.employeeName,
            voided: false,
            voidReason: "",
            details: lines.map((line) => ({
              id: createDemoId(),
              itemName: line.itemName,
              unit: line.unit,
              notes: line.notes,
              quantity: line.quantity,
              issueDate,
              currentEmployeeNumber: employee.employeeNumber,
              currentEmployeeName: employee.employeeName,
              returnedQuantity: 0,
              outstandingQuantity: line.quantity,
              events: [],
            })),
          };
          return { ...current, records: [record, ...current.records] };
        });
      }
      setDraftLines([emptyDraftLine()]);
      setEmployeeNumber("");
      setSuccess("تم تسجيل إيصال عهدة الموظف.");
    } finally {
      setSaving(false);
    }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!actionTarget || !actionDate) {
      setError("أدخل تاريخ الحركة.");
      return;
    }

    if (actionTarget.kind === "return") {
      const quantity = Number(actionQuantity);
      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        quantity > actionTarget.outstandingQuantity + 1e-9
      ) {
        setError("أدخل كمية مرتجعة لا تتجاوز المتبقي.");
        return;
      }
    }
    if (actionTarget.kind === "transfer" && !targetEmployeeNumber) {
      setError("اختر الموظف الجديد.");
      return;
    }
    if (actionTarget.kind === "void" && !voidReason.trim()) {
      setError("سبب الإلغاء مطلوب.");
      return;
    }

    setSaving(true);
    try {
      if (persistent) {
        const result =
          actionTarget.kind === "return"
            ? await returnCustodyItemAction({
                detailId: actionTarget.detailId,
                quantity: Number(actionQuantity),
                eventDate: actionDate,
              })
            : actionTarget.kind === "transfer"
              ? await transferCustodyItemAction({
                  detailId: actionTarget.detailId,
                  employeeNumber: Number(targetEmployeeNumber),
                  eventDate: actionDate,
                })
              : await voidCustodyAction({
                  custodyNumber: actionTarget.custodyNumber,
                  reason: voidReason,
                  eventDate: actionDate,
                });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onBundleChange(() => result.bundle);
      } else if (actionTarget.kind === "return") {
        const quantity = Number(actionQuantity);
        const record = bundle.records.find(
          (entry) => entry.custodyNumber === actionTarget.custodyNumber,
        );
        const detail = record?.details.find(
          (entry) => entry.id === actionTarget.detailId,
        );
        if (!record || !detail || detail.currentEmployeeNumber === null) {
          setError("لا يمكن استلام بند مغلق.");
          return;
        }
        const employee = bundle.employees.find(
          (entry) => entry.employeeNumber === detail.currentEmployeeNumber,
        );
        onBundleChange((current) => {
          const fullReturn =
            Math.abs(quantity - actionTarget.outstandingQuantity) <= 1e-9;
          const event: CustodyEvent = {
            id: createDemoId(),
            kind: "return",
            quantity,
            eventDate: actionDate,
            fromEmployeeNumber: detail.currentEmployeeNumber,
            fromEmployeeName: employee?.employeeName ?? null,
            toEmployeeNumber: null,
            toEmployeeName: null,
            reason: "",
          };
          return {
            ...current,
            records: current.records.map((entry) =>
              entry.custodyNumber !== record.custodyNumber
                ? entry
                : {
                    ...entry,
                    details: entry.details.map((line) =>
                      line.id !== detail.id
                        ? line
                        : {
                            ...line,
                            returnedQuantity: line.returnedQuantity + quantity,
                            outstandingQuantity: Math.max(
                              0,
                              line.outstandingQuantity - quantity,
                            ),
                            currentEmployeeNumber: fullReturn
                              ? null
                              : line.currentEmployeeNumber,
                            currentEmployeeName: fullReturn
                              ? null
                              : line.currentEmployeeName,
                            events: [...line.events, event],
                          },
                    ),
                  },
            ),
          };
        });
        setActionTarget(null);
        setSuccess("تم استلام المرتجع وتحديث العهدة.");
        return;
      } else if (actionTarget.kind === "transfer") {
        const record = bundle.records.find(
          (entry) => entry.custodyNumber === actionTarget.custodyNumber,
        );
        const detail = record?.details.find(
          (entry) => entry.id === actionTarget.detailId,
        );
        const employee = bundle.employees.find(
          (entry) => entry.employeeNumber === Number(targetEmployeeNumber),
        );
        if (
          !record ||
          !detail ||
          detail.currentEmployeeNumber === null ||
          !employee ||
          employee.employeeNumber === detail.currentEmployeeNumber
        ) {
          setError("اختر موظفًا مختلفًا وبند عهدة نشطًا.");
          return;
        }
        const fromEmployee = bundle.employees.find(
          (entry) => entry.employeeNumber === detail.currentEmployeeNumber,
        );
        const event: CustodyEvent = {
          id: createDemoId(),
          kind: "transfer",
          quantity: actionTarget.outstandingQuantity,
          eventDate: actionDate,
          fromEmployeeNumber: detail.currentEmployeeNumber,
          fromEmployeeName: fromEmployee?.employeeName ?? null,
          toEmployeeNumber: employee.employeeNumber,
          toEmployeeName: employee.employeeName,
          reason: "",
        };
        onBundleChange((current) => ({
          ...current,
          records: current.records.map((entry) =>
            entry.custodyNumber !== record.custodyNumber
              ? entry
              : {
                  ...entry,
                  details: entry.details.map((line) =>
                    line.id !== detail.id
                      ? line
                      : {
                          ...line,
                          currentEmployeeNumber: employee.employeeNumber,
                          currentEmployeeName: employee.employeeName,
                          events: [...line.events, event],
                        },
                  ),
                },
          ),
        }));
      } else {
        const record = bundle.records.find(
          (entry) => entry.custodyNumber === actionTarget.custodyNumber,
        );
        if (!record || record.voided) {
          setError("سجل العهدة غير متاح للإلغاء.");
          return;
        }
        onBundleChange((current) => {
          const details = record.details.map((detail) => {
            if (detail.outstandingQuantity <= 1e-9) return detail;
            const employee = current.employees.find(
              (entry) =>
                entry.employeeNumber === detail.currentEmployeeNumber,
            );
            const event: CustodyEvent = {
              id: createDemoId(),
              kind: "void",
              quantity: detail.outstandingQuantity,
              eventDate: actionDate,
              fromEmployeeNumber: detail.currentEmployeeNumber,
              fromEmployeeName: employee?.employeeName ?? null,
              toEmployeeNumber: null,
              toEmployeeName: null,
              reason: voidReason.trim(),
            };
            return {
              ...detail,
              returnedQuantity:
                detail.returnedQuantity + detail.outstandingQuantity,
              outstandingQuantity: 0,
              currentEmployeeNumber: null,
              currentEmployeeName: null,
              events: [...detail.events, event],
            };
          });
          return {
            ...current,
            records: current.records.map((entry) =>
              entry.custodyNumber === record.custodyNumber
                ? {
                    ...entry,
                    voided: true,
                    voidReason: voidReason.trim(),
                    details,
                  }
                : entry,
            ),
          };
        });
      }

      setActionTarget(null);
      setSuccess(
        actionTarget.kind === "return"
          ? "تم استلام المرتجع وتحديث العهدة."
          : actionTarget.kind === "transfer"
            ? "تم نقل العهدة للموظف الجديد."
            : "تم إلغاء العهدة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="custody-panel content-panel">
      <div className="panel-heading">
        <div>
          <h3>عهد الموظفين</h3>
          <p>
            تسجيل إيصالات العهدة الإدارية للموظفين. كل إيصال مستقل ويتضمن
            البيان والوحدة والكمية والملاحظات، ولا يمس مخزون الأغذية أو
            الكانتين أو الثلاجة.
          </p>
        </div>
        <span className="panel-role">
          {canManage ? "إدارة المسؤول" : "عرض عهدتي فقط"}
        </span>
      </div>

      {error && (
        <p className="form-message form-message-error no-print" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="form-message form-message-success no-print" role="status">
          {message}
        </p>
      )}

      {!canManage && currentEmployeeNumber === null && (
        <div className="empty-state" role="status">
          حسابك غير مرتبط بموظف في دليل الموظفين. اطلب من المسؤول ربط الحساب
          بسجل الموظف لعرض عهدتك.
        </div>
      )}

      {canManage ? (
        <form className="custody-issue-form no-print" onSubmit={submitIssue}>
          <div className="custody-section-heading">
            <div>
              <h4>تسجيل عهدة جديدة</h4>
              <p>
                هذا الإيصال إداري مستقل ولا يخصم من مخزون الأغذية أو الكانتين
                أو الثلاجة.
              </p>
            </div>
          </div>
          <div className="custody-issue-fields">
            <label>
              <span>الموظف المستلم</span>
              <select
                value={employeeNumber}
                onChange={(event) => setEmployeeNumber(event.target.value)}
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
            <label>
              <span>تاريخ العهدة</span>
              <input
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
                required
              />
            </label>
          </div>

          <div className="custody-line-list">
            {draftLines.map((line, index) => (
              <div className="custody-draft-line" key={index}>
                <label>
                  <span>البيان</span>
                  <input
                    maxLength={255}
                    value={line.itemName}
                    onChange={(event) =>
                      updateDraft(index, { itemName: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  <span>الوحدة</span>
                  <input
                    maxLength={80}
                    value={line.unit}
                    onChange={(event) =>
                      updateDraft(index, { unit: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>الكمية</span>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={line.quantity}
                    onChange={(event) =>
                      updateDraft(index, { quantity: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  <span>ملاحظات</span>
                  <input
                    maxLength={1000}
                    value={line.notes}
                    onChange={(event) =>
                      updateDraft(index, { notes: event.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label="حذف بند"
                  disabled={draftLines.length === 1}
                  onClick={() =>
                    setDraftLines((current) =>
                      current.filter(
                        (_, lineIndex) => lineIndex !== index,
                      ),
                    )
                  }
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
          <div className="custody-form-footer">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setDraftLines((current) => [
                  ...current,
                  emptyDraftLine(),
                ])
              }
              disabled={saving}
            >
              إضافة بند
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!canSaveIssue || saving}
            >
              {saving ? "جارٍ الحفظ..." : "تسجيل إيصال العهدة"}
            </button>
          </div>
        </form>
      ) : (
        <p className="custody-readonly-note">
          هذه القائمة للعرض فقط. سجلات الموظفين الآخرين غير ظاهرة.
        </p>
      )}

      {actionTarget && (
        <form className="custody-action-form no-print" onSubmit={submitAction}>
          <div className="custody-section-heading">
            <div>
              <h4>
                {actionTarget.kind === "return"
                  ? "استلام مرتجع"
                  : actionTarget.kind === "transfer"
                    ? "نقل العهدة"
                    : "إلغاء سجل العهدة"}
              </h4>
              <p>
                {actionTarget.kind === "void"
                  ? `العهدة رقم ${actionTarget.custodyNumber}`
                  : `${actionTarget.itemName} — المتبقي ${numberFormatter.format(availableQuantity)}`}
              </p>
            </div>
          </div>
          <div className="custody-issue-fields">
            <label>
              <span>تاريخ الحركة</span>
              <input
                type="date"
                value={actionDate}
                onChange={(event) => setActionDate(event.target.value)}
                required
              />
            </label>
            {actionTarget.kind === "return" && (
              <label>
                <span>الكمية المرتجعة</span>
                <input
                  type="number"
                  min="0.01"
                  max={actionTarget.outstandingQuantity}
                  step="any"
                  value={actionQuantity}
                  onChange={(event) =>
                    setActionQuantity(event.target.value)
                  }
                  required
                />
              </label>
            )}
            {actionTarget.kind === "transfer" && (
              <label>
                <span>الموظف الجديد</span>
                <select
                  value={targetEmployeeNumber}
                  onChange={(event) =>
                    setTargetEmployeeNumber(event.target.value)
                  }
                  required
                >
                  <option value="">اختر الموظف</option>
                  {bundle.employees
                    .filter(
                      (employee) =>
                        employee.employeeNumber !==
                        bundle.records
                          .find(
                            (record) =>
                              record.custodyNumber ===
                              actionTarget.custodyNumber,
                          )
                          ?.details.find(
                            (detail) =>
                              detail.id === actionTarget.detailId,
                          )?.currentEmployeeNumber,
                    )
                    .map((employee) => (
                      <option
                        key={employee.employeeNumber}
                        value={employee.employeeNumber}
                      >
                        {employee.employeeName}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {actionTarget.kind === "void" && (
              <label className="custody-wide-field">
                <span>سبب الإلغاء</span>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                  required
                />
              </label>
            )}
          </div>
          <div className="custody-form-footer">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setActionTarget(null)}
              disabled={saving}
            >
              إغلاق
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving ? "جارٍ الحفظ..." : "تأكيد الحركة"}
            </button>
          </div>
        </form>
      )}

      <div className="custody-section-heading">
        <div>
          <h4>سجل إيصالات العهدة</h4>
        </div>
        <button
          type="button"
          className="secondary-button no-print"
          onClick={() => printCustodyReceipt()}
        >
          طباعة كل الإيصالات
        </button>
      </div>
      <div className="filter-list no-print">
        <label className="form-field">
          الموظف
          <input
            value={recordSearch}
            onChange={(event) => setRecordSearch(event.target.value)}
            placeholder="ابحث باسم الموظف أو البيان"
          />
        </label>
        <label className="form-field">
          من تاريخ
          <input
            type="date"
            value={recordStartDate}
            onChange={(event) => setRecordStartDate(event.target.value)}
          />
        </label>
        <label className="form-field">
          إلى تاريخ
          <input
            type="date"
            value={recordEndDate}
            onChange={(event) => setRecordEndDate(event.target.value)}
          />
        </label>
      </div>
      <div className="custody-record-list">
        {!canManage && currentEmployeeNumber === null ? null : visibleRecords.length ? (
          visibleRecords.map((record) => {
            const outstanding = record.details.reduce(
              (total, detail) => total + detail.outstandingQuantity,
              0,
            );
            const status = record.voided
              ? "ملغاة"
              : outstanding > 1e-9
                ? "نشطة"
                : "مكتملة";
            return (
              <article
                className="custody-record"
                key={record.custodyNumber}
                data-custody-print-target={
                  printingCustodyNumber === record.custodyNumber
                }
              >
                <PrintBrand
                  title={`إيصال عهدة موظف رقم ${record.custodyNumber}`}
                  subtitle={record.recipientName}
                  meta={[
                    {
                      label: "التاريخ",
                      value: formatDate(record.custodyDate),
                    },
                    { label: "الحالة", value: status },
                  ]}
                />
                <div className="custody-record-heading">
                  <div>
                    <h4>عهدة رقم {record.custodyNumber}</h4>
                    <p>
                      {formatDate(record.custodyDate)} · المستلم الأصلي:{" "}
                      {record.recipientName}
                    </p>
                  </div>
                  <div className="custody-record-actions">
                    <button
                      type="button"
                      className="secondary-button no-print"
                      onClick={() =>
                        printCustodyReceipt(record.custodyNumber)
                      }
                    >
                      طباعة الإيصال
                    </button>
                    <span
                      className={`custody-status ${record.voided ? "voided" : ""}`}
                    >
                      {status}
                    </span>
                    {canManage && !record.voided && (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() =>
                          openAction({
                            kind: "void",
                            custodyNumber: record.custodyNumber,
                          })
                        }
                      >
                        إلغاء العهدة
                      </button>
                    )}
                  </div>
                </div>

                {record.voided && (
                  <p className="custody-void-reason">
                    سبب الإلغاء: {record.voidReason}
                  </p>
                )}

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>البيان</th>
                        <th>الوحدة</th>
                        <th>الكمية</th>
                        <th>ملاحظات</th>
                        <th>المرتجع</th>
                        <th>المتبقي</th>
                        <th>الموظف الحالي</th>
                        {canManage && <th>الإجراءات</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {record.details.map((detail) => (
                        <tr key={detail.id}>
                          <td>{detail.itemName}</td>
                          <td>{detail.unit || "—"}</td>
                          <td>
                            {numberFormatter.format(detail.quantity ?? 0)}
                          </td>
                          <td>{detail.notes || "—"}</td>
                          <td>
                            {numberFormatter.format(
                              detail.returnedQuantity,
                            )}
                          </td>
                          <td>
                            {numberFormatter.format(
                              detail.outstandingQuantity,
                            )}
                          </td>
                          <td>{detail.currentEmployeeName ?? "—"}</td>
                          {canManage && (
                            <td>
                              {detail.outstandingQuantity > 1e-9 &&
                                !record.voided && (
                                  <div className="custody-row-actions">
                                    <button
                                      type="button"
                                      className="secondary-button"
                                      onClick={() =>
                                        openAction({
                                          kind: "return",
                                          custodyNumber:
                                            record.custodyNumber,
                                          detailId: detail.id,
                                          itemName: detail.itemName,
                                          outstandingQuantity:
                                            detail.outstandingQuantity,
                                        })
                                      }
                                    >
                                      مرتجع
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary-button"
                                      onClick={() =>
                                        openAction({
                                          kind: "transfer",
                                          custodyNumber:
                                            record.custodyNumber,
                                          detailId: detail.id,
                                          itemName: detail.itemName,
                                          outstandingQuantity:
                                            detail.outstandingQuantity,
                                        })
                                      }
                                    >
                                      نقل
                                    </button>
                                  </div>
                                )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {record.details.some(
                  (detail) => detail.events.length,
                ) && (
                  <div className="custody-event-history">
                    {record.details.map((detail) =>
                      detail.events.length ? (
                        <details key={detail.id}>
                          <summary>
                            حركات {detail.itemName} (
                            {detail.events.length})
                          </summary>
                          <ul>
                            {detail.events.map((event) => (
                              <li key={event.id}>
                                {eventLabel(event)} ·{" "}
                                {numberFormatter.format(event.quantity)} ·{" "}
                                {formatDate(event.eventDate)}
                                {event.fromEmployeeName
                                  ? ` · من ${event.fromEmployeeName}`
                                  : ""}
                                {event.toEmployeeName
                                  ? ` · إلى ${event.toEmployeeName}`
                                  : ""}
                                {event.reason
                                  ? ` · ${event.reason}`
                                  : ""}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null,
                    )}
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className="empty-state">لا توجد سجلات عهدة لعرضها.</div>
        )}
      </div>
    </section>
  );
}
