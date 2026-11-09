"use client";

import type { Resident } from "@/lib/demo-data";
import { formatDate } from "@/lib/date-format";
import PrintBrand from "@/components/print-brand";
import { printDocument } from "@/lib/print";

type Props = {
  resident: Resident;
  onClose: () => void;
};

function displayValue(val?: string | null) {
  return val && val.trim() ? val.trim() : "—";
}

function calculateAge(birthDateStr?: string) {
  if (!birthDateStr) return "—";
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return "—";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age > 0 ? `${age} سنة` : "—";
}

function calculateStayDuration(admissionStr?: string, exitStr?: string) {
  if (!admissionStr) return "—";
  const start = new Date(admissionStr);
  const end = exitStr ? new Date(exitStr) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "—";
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return `${diffDays} يوم`;
}

export default function ResidentProfilePrintModal({ resident, onClose }: Props) {
  function handlePrint() {
    printDocument();
  }

  return (
    <div
      className="modal-backdrop resident-profile-print-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(15, 23, 42, 0.8)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        overflowY: "auto",
      }}
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div
        className="modal-container no-print-wrapper"
        style={{
          width: "100%",
          maxWidth: "860px",
          maxHeight: "94vh",
          backgroundColor: "#ffffff",
          borderRadius: "20px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        {/* شريط أدوات الطباعة العلوي (لا يظهر في الطباعة) */}
        <div
          className="no-print"
          style={{
            padding: "16px 24px",
            background: "linear-gradient(135deg, #093a28 0%, #12573d 100%)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>📄</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>
                استمارة قيد وبيانات نزيل رسمية (جاهزة للطباعة / PDF)
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#d1fae5" }}>
                مجهزة بقياس A4 مع مكان الختم الرسمي للمركز وتوقيعات الإدارة
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 18px",
                borderRadius: "10px",
                border: 0,
                background: "#f59e0b",
                color: "#78350f",
                fontSize: "13px",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(245,158,11,0.3)",
              }}
            >
              <span>🖨️</span>
              <span>طباعة الملف الآن (A4 / PDF)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.1)",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              إغلاق
            </button>
          </div>
        </div>

        {/* جسم الوثيقة الرسمية القابلة للطباعة */}
        <div
          className="printable-document-content"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "36px 44px",
            background: "#ffffff",
            color: "#0f172a",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {/* ترويسة المركز الرسمية */}
          <PrintBrand
            title="استمارة قيد وبيانات نزيل"
            subtitle="وثيقة رسمية معتمدة"
            meta={[
              { label: "رقم الملف", value: resident.fileNumber },
              {
                label: "الحالة",
                value:
                  resident.status === "current"
                    ? "مقيم حاليًا بالمركز"
                    : "غادر المركز",
              },
            ]}
          />

          {/* بطاقة الهوية والصورة الشخصية الرئيسية */}
          <div
            style={{
              display: "flex",
              gap: "20px",
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: "14px",
              padding: "16px",
              marginBottom: "20px",
            }}
          >
            {/* الصورة الشخصية للنزيل */}
            <div
              style={{
                width: "115px",
                height: "135px",
                borderRadius: "10px",
                border: "2px solid #0f766e",
                background: "#ffffff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {resident.imagePath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resident.imagePath}
                  alt={resident.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div style={{ textAlign: "center", color: "#94a3b8" }}>
                  <span style={{ fontSize: "36px", display: "block" }}>👤</span>
                  <span style={{ fontSize: "10px", fontWeight: 600 }}>صورة شخصية</span>
                </div>
              )}
            </div>

            {/* ملخص الهوية */}
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
              <div style={{ gridColumn: "1 / -1", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>
                <span style={{ fontSize: "11px", color: "#64748b" }}>الاسم الكامل للنزيل:</span>
                <div style={{ fontSize: "18px", fontWeight: 900, color: "#0f172a" }}>
                  {resident.name}
                </div>
              </div>

              <div>
                <span style={{ fontSize: "11px", color: "#64748b" }}>الرقم القومي:</span>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f766e" }}>
                  {displayValue(resident.nationalId)}
                </div>
              </div>

              <div>
                <span style={{ fontSize: "11px", color: "#64748b" }}>تاريخ الميلاد / السن:</span>
                <div style={{ fontSize: "13px", fontWeight: 700 }}>
                  {formatDate(resident.birthDate)} ({calculateAge(resident.birthDate)})
                </div>
              </div>

              <div>
                <span style={{ fontSize: "11px", color: "#64748b" }}>محل الإقامة بالمركز:</span>
                <div style={{ fontSize: "13px", fontWeight: 700 }}>
                  {resident.villa ? `فيلا ${resident.villa}` : "بدون فيلا"}
                  {resident.room ? ` · غرفة ${resident.room}` : ""}
                </div>
              </div>

              <div>
                <span style={{ fontSize: "11px", color: "#64748b" }}>رقم الهاتف الشخصي:</span>
                <div style={{ fontSize: "13px", fontWeight: 700 }}>
                  {displayValue(resident.phone)}
                </div>
              </div>
            </div>
          </div>

          {/* الجداول التفصيلية الخمسة */}
          <div style={{ display: "grid", gap: "16px" }}>
            {/* 1. البيانات الشخصية والمدنية */}
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#0f766e",
                  background: "#f0fdfa",
                  padding: "4px 10px",
                  borderRight: "4px solid #0f766e",
                  marginBottom: "6px",
                }}
              >
                أولاً: البيانات الشخصية والمدنية والمهنية
              </div>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "11.5px",
                  textAlign: "right",
                  border: "1px solid #cbd5e1",
                }}
              >
                <tbody>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "20%" }}>
                      الحالة الاجتماعية
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "30%" }}>
                      {displayValue(resident.maritalStatus)}
                    </td>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "20%" }}>
                      المؤهل الدراسي
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "30%" }}>
                      {displayValue(resident.qualification)}
                    </td>
                  </tr>
                  <tr>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      الخبرات السابقة
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {displayValue(resident.previousExperience)}
                    </td>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      أماكن العمل السابقة
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {displayValue(resident.previousWorkplaces)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 2. بيانات العنوان والتواصل والطوارئ */}
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#0f766e",
                  background: "#f0fdfa",
                  padding: "4px 10px",
                  borderRight: "4px solid #0f766e",
                  marginBottom: "6px",
                }}
              >
                ثانياً: بيانات العنوان والتواصل والاتصال بالطوارئ
              </div>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "11.5px",
                  textAlign: "right",
                  border: "1px solid #cbd5e1",
                }}
              >
                <tbody>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "20%" }}>
                      العنوان بالتفصيل
                    </th>
                    <td
                      colSpan={3}
                      style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "80%" }}
                    >
                      {displayValue(resident.address)}
                    </td>
                  </tr>
                  <tr>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      المحافظة / المنطقة
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {displayValue(resident.district)}
                    </td>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      الكنيسة التابع لها
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {displayValue(resident.church)}
                    </td>
                  </tr>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      جهة اتصال الطوارئ
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {displayValue(resident.emergencyContact)}{" "}
                      {resident.relationship ? `(${resident.relationship})` : ""}
                    </td>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      هاتف الطوارئ
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {displayValue(resident.emergencyPhone)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 3. بيانات الإقامة والتحركات بالمركز */}
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#0f766e",
                  background: "#f0fdfa",
                  padding: "4px 10px",
                  borderRight: "4px solid #0f766e",
                  marginBottom: "6px",
                }}
              >
                ثالثاً: بيانات الإقامة والتحركات بالمركز
              </div>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "11.5px",
                  textAlign: "right",
                  border: "1px solid #cbd5e1",
                }}
              >
                <tbody>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "20%" }}>
                      تاريخ وساعة الدخول
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "30%" }}>
                      {formatDate(resident.admissionDate)}{" "}
                      {resident.entryTime ? `· ${resident.entryTime}` : ""}
                    </td>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "20%" }}>
                      طريقة الدخول
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "30%" }}>
                      {displayValue(resident.residentEntry)}
                    </td>
                  </tr>
                  <tr>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      تاريخ وطريقة المغادرة
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {resident.exitDate ? formatDate(resident.exitDate) : "مستمر بالإقامة"}{" "}
                      {resident.exitMethod ? `· (${resident.exitMethod})` : ""}
                    </td>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      مدة الإقامة بالمركز
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {calculateStayDuration(resident.admissionDate, resident.exitDate)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 4. المتابعة الطبية والتأهيل والتعافي */}
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#0f766e",
                  background: "#f0fdfa",
                  padding: "4px 10px",
                  borderRight: "4px solid #0f766e",
                  marginBottom: "6px",
                }}
              >
                رابعاً: المتابعة الطبية وفريق التأهيل والإرشاد
              </div>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "11.5px",
                  textAlign: "right",
                  border: "1px solid #cbd5e1",
                }}
              >
                <tbody>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "20%" }}>
                      الطبيب المعالج
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "30%" }}>
                      {displayValue(resident.treatingDoctorNumber)}
                    </td>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "20%" }}>
                      عيادة / عنوان الطبيب
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1", width: "30%" }}>
                      {displayValue(resident.treatingDoctorAddress)}
                    </td>
                  </tr>
                  <tr>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      فريق التأهيل والإرشاد
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {displayValue(resident.rehabilitationTeam)}
                    </td>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      مرحلة التعافي الحالية
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {displayValue(resident.rehabilitationStage)}
                    </td>
                  </tr>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      المدرب والمشرف
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {resident.trainer || resident.supervisor
                        ? [resident.trainer && `المدرب: ${resident.trainer}`, resident.supervisor && `المشرف: ${resident.supervisor}`]
                            .filter(Boolean)
                            .join(" · ")
                        : "—"}
                    </td>
                    <th style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      المحاضر
                    </th>
                    <td style={{ padding: "6px 10px", border: "1px solid #cbd5e1" }}>
                      {displayValue(resident.lecturer)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* خانة التوقيعات والختم الرسمي المعتمد */}
          <div
            style={{
              marginTop: "30px",
              paddingTop: "16px",
              borderTop: "2px solid #0f766e",
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "12px",
              textAlign: "center",
            }}
          >
            {/* توقيع المشرف */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 6px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#334155" }}>
                الأخصائي / المشرف المسئول
              </div>
              <div style={{ height: "45px" }} />
              <div style={{ borderTop: "1px dashed #cbd5e1", fontSize: "10px", color: "#64748b", paddingTop: "4px" }}>
                التوقيع: .....................
              </div>
            </div>

            {/* توقيع الطبيب */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 6px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#334155" }}>
                الطبيب المعالج
              </div>
              <div style={{ height: "45px" }} />
              <div style={{ borderTop: "1px dashed #cbd5e1", fontSize: "10px", color: "#64748b", paddingTop: "4px" }}>
                التوقيع: .....................
              </div>
            </div>

            {/* توقيع مدير المركز */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px 6px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#334155" }}>
                مدير المركز
              </div>
              <div style={{ height: "45px" }} />
              <div style={{ borderTop: "1px dashed #cbd5e1", fontSize: "10px", color: "#64748b", paddingTop: "4px" }}>
                التوقيع: .....................
              </div>
            </div>

            {/* مكان الختم الرسمي للمركز */}
            <div
              style={{
                border: "2px dashed #0f766e",
                borderRadius: "8px",
                padding: "8px 6px",
                background: "#f0fdfa",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 900, color: "#0f766e" }}>
                مكان الختم الرسمي
              </div>
              <div
                style={{
                  width: "55px",
                  height: "55px",
                  borderRadius: "50%",
                  border: "1.5px solid #0d9488",
                  margin: "4px 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "9px",
                  fontWeight: 800,
                  color: "#0f766e",
                  textAlign: "center",
                  lineHeight: "1.2",
                }}
              >
                ختم الإدارة
                <br />
                المعتمد
              </div>
              <div style={{ fontSize: "9px", color: "#64748b" }}>
                يعتمد بخاتم المركز
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

