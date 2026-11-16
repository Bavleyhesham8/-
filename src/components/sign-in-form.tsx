"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Mode = "persistent" | "demo";

const DEMO_USERS = [
  { id: "admin-demo", label: "المدير العام", email: "admin@demo.qithara", password: "demo-admin", role: "مدير النظام — صلاحيات كاملة" },
  { id: "staff-demo-1", label: "موظف (تعديل)", email: "staff@demo.qithara", password: "demo-staff", role: "موظف — صلاحية تعديل سجلات النزلاء" },
  { id: "viewer-demo-1", label: "زائر بيانات", email: "viewer@demo.qithara", password: "demo-viewer", role: "زائر — عرض وتصدير فقط" },
];

function setDemoCookie(userId: string) {
  // وضع العرض التجريبي فقط: يحدد الحساب التجريبي الذي سيفتحه التطبيق.
  document.cookie = `qithara-demo-session=${encodeURIComponent(userId)}; path=/; max-age=86400; SameSite=Lax`;
}

export default function SignInForm({ mode = "persistent" }: { mode?: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handlePersistentLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
        callbackURL: "/",
      });
      if (result.error) {
        setError("تعذر تسجيل الدخول. تأكد من صحة البريد الإلكتروني وكلمة المرور.");
        return;
      }
      router.replace("/");
    } catch {
      setError("تعذر الاتصال بخدمة تسجيل الدخول. يرجى المحاولة مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDemoLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("ادخل اسم المستخدم وكلمة المرور.");
      return;
    }
    const demoUser = DEMO_USERS.find(
      (user) => user.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!demoUser) {
      setError(
        "في وضع العرض التجريبي استخدم أحد الحسابات المعروضة أدناه فقط.",
      );
      return;
    }
    setDemoCookie(demoUser.id);
    router.replace("/");
  }

  const submit = mode === "demo" ? handleDemoLogin : handlePersistentLogin;

  return (
    <main
      className="sign-in-background relative flex min-h-screen items-center justify-center p-4 sm:p-8"
      dir="rtl"
    >
      {/* طبقة تدرج شفافة تبرز مارمرقس في اليمين وتوفر تبايناً للكارد في الشمال */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to left, rgba(5,20,14,0.12) 0%, rgba(5,20,14,0.35) 45%, rgba(5,20,14,0.78) 100%)",
        }}
      />

      {/* بطاقة تسجيل الدخول الزجاجية */}
      <section
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: "440px",
          borderRadius: "24px",
          border: "1px solid rgba(255,255,255,0.28)",
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.30), 0 0 0 1px rgba(255,255,255,0.15)",
          padding: "40px 36px 32px",
        }}
      >
        {/* شارة الهوية */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div
            style={{
              width: "104px",
              height: "104px",
              margin: "0 auto 14px",
              borderRadius: "22px",
              border: "1px solid rgba(9,58,40,0.12)",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(9,58,40,0.18)",
            }}
          >
            <Image
              src="/david-lyre-logo-v2.svg"
              alt="شعار مركز قيثارة داود"
              width={88}
              height={88}
              priority
              style={{ width: "88px", height: "88px" }}
            />
          </div>
          <h1
            style={{
              margin: "0 0 4px",
              fontSize: "22px",
              fontWeight: 900,
              color: "#071510",
              letterSpacing: "-0.3px",
            }}
          >
            مركز قيثارة داود
          </h1>
          <p style={{ margin: 0, fontSize: "12px", color: "#2d4438", fontWeight: 500 }}>
            نظام الإدارة الشاملة والرعاية
          </p>

          {mode === "demo" && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                marginTop: "10px",
                padding: "4px 12px",
                borderRadius: "20px",
                background: "rgba(201,122,26,0.12)",
                border: "1px solid rgba(201,122,26,0.30)",
                fontSize: "10px",
                fontWeight: 700,
                color: "#7a4a08",
              }}
            >
              <span>⚡</span>
              <span>وضع العرض التجريبي</span>
            </div>
          )}

          {mode !== "demo" && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                marginTop: "10px",
                padding: "4px 12px",
                borderRadius: "20px",
                background: "rgba(18,87,61,0.10)",
                border: "1px solid rgba(18,87,61,0.22)",
                fontSize: "10px",
                fontWeight: 700,
                color: "#093a28",
              }}
            >
              <span>🛡️</span>
              <span>بوابة الدخول الآمنة</span>
            </div>
          )}
        </div>

        {/* نموذج تسجيل الدخول */}
        <form onSubmit={submit} style={{ display: "grid", gap: "14px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#071510" }}>
              {mode === "demo" ? "اسم المستخدم" : "البريد الإلكتروني"}
            </span>
            <input
              autoComplete="username"
              type={mode === "demo" ? "text" : "email"}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                mode === "demo" ? "أدخل أي اسم أو بريد..." : "admin@qithara.center"
              }
              style={{
                width: "100%",
                borderRadius: "12px",
                border: "1.5px solid rgba(14,68,45,0.22)",
                background: "#fff",
                padding: "10px 14px",
                fontSize: "13px",
                color: "#071510",
                outline: "none",
                transition: "border-color 150ms, box-shadow 150ms",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#12573d";
                e.target.style.boxShadow = "0 0 0 3px rgba(18,87,61,0.12)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(14,68,45,0.22)";
                e.target.style.boxShadow = "none";
              }}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#071510" }}>
              كلمة المرور
            </span>
            <div style={{ position: "relative" }}>
              <input
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  width: "100%",
                  borderRadius: "12px",
                  border: "1.5px solid rgba(14,68,45,0.22)",
                  background: "#fff",
                  padding: "10px 14px",
                  paddingLeft: "56px",
                  fontSize: "13px",
                  color: "#071510",
                  outline: "none",
                  transition: "border-color 150ms, box-shadow 150ms",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#12573d";
                  e.target.style.boxShadow = "0 0 0 3px rgba(18,87,61,0.12)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(14,68,45,0.22)";
                  e.target.style.boxShadow = "none";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: 0,
                  background: "transparent",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#2d4438",
                  cursor: "pointer",
                  padding: "2px 4px",
                }}
              >
                {showPassword ? "إخفاء" : "إظهار"}
              </button>
            </div>
          </label>

          {error && (
            <div
              style={{
                borderRadius: "10px",
                border: "1px solid rgba(158,31,31,0.25)",
                background: "#fee2e2",
                padding: "10px 14px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#7a1414",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              borderRadius: "12px",
              border: 0,
              background: "linear-gradient(135deg, #093a28 0%, #12573d 100%)",
              color: "#fff",
              padding: "12px",
              fontSize: "14px",
              fontWeight: 800,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1,
              boxShadow: "0 4px 16px rgba(9,58,40,0.30)",
              transition: "opacity 150ms, transform 100ms",
              marginTop: "4px",
            }}
          >
            {submitting ? "جاري التحقق..." : "تسجيل الدخول للنظام"}
          </button>
        </form>

        {/* Demo shortcuts */}
        {mode === "demo" && (
          <div
            style={{
              marginTop: "18px",
              borderRadius: "14px",
              border: "1px solid rgba(14,68,45,0.14)",
              background: "rgba(18,87,61,0.05)",
              padding: "14px",
            }}
          >
            <p
              style={{
                margin: "0 0 10px",
                fontSize: "11px",
                fontWeight: 700,
                color: "#071510",
              }}
            >
              حسابات العرض التجريبي:
            </p>
            <div style={{ display: "grid", gap: "6px" }}>
              {DEMO_USERS.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => {
                    setEmail(u.email);
                    setPassword(u.password);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    border: "1px solid rgba(14,68,45,0.18)",
                    borderRadius: "10px",
                    background: "#fff",
                    padding: "8px 11px",
                    cursor: "pointer",
                    textAlign: "right",
                    gap: "8px",
                    transition: "background 150ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(18,87,61,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "#fff";
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#071510" }}>
                    {u.label}
                  </span>
                  <span style={{ fontSize: "10px", color: "#2d4438" }}>{u.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* توضيح الصلاحيات */}
        {mode !== "demo" && (
          <div
            style={{
              marginTop: "16px",
              borderRadius: "12px",
              border: "1px solid rgba(14,68,45,0.14)",
              background: "rgba(18,87,61,0.04)",
              padding: "12px 14px",
            }}
          >
            <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700, color: "#071510" }}>
              صلاحيات الحسابات المعرفة بالنظام:
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "5px" }}>
              <li style={{ fontSize: "11px", color: "#2d4438" }}>
                •{" "}
                <strong style={{ color: "#071510" }}>المدير العام:</strong>{" "}
                تحكم كامل واعتماد وتعيين الصلاحيات.
              </li>
              <li style={{ fontSize: "11px", color: "#2d4438" }}>
                •{" "}
                <strong style={{ color: "#071510" }}>الموظفون:</strong>{" "}
                صلاحيات تشغيلية مخصصة يحددها الأدمن.
              </li>
              <li style={{ fontSize: "11px", color: "#2d4438" }}>
                •{" "}
                <strong style={{ color: "#071510" }}>زوار البيانات:</strong>{" "}
                استعراض وتصدير التقارير فقط.
              </li>
            </ul>
          </div>
        )}

        <p
          style={{
            marginTop: "14px",
            textAlign: "center",
            fontSize: "10px",
            color: "#3d5447",
          }}
        >
          جميع الحسابات مُدارة مركزياً من قبل مسؤول النظام.
        </p>
      </section>
    </main>
  );
}
