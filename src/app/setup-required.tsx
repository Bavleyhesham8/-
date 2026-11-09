import { getPersistentConfigurationError } from "@/lib/app-config";

export default function SetupRequired() {
  const error =
    getPersistentConfigurationError() ??
    "Persistent mode is not available in this environment.";

  return (
    <main className="setup-page" dir="rtl">
      <section className="setup-card">
        <div className="brand-mark" aria-hidden="true">
          ق
        </div>
        <h1>إعداد قاعدة البيانات مطلوب</h1>
        <p>
          لم يتم تشغيل التطبيق ببيانات وهمية أو حفظ حقيقي. لإكمال الإعداد، اربط
          قاعدة Neon من Vercel Marketplace، ثم أضف أسرار تسجيل الدخول في متغيرات
          البيئة الخاصة بالمشروع.
        </p>
        <code>{error}</code>
        <p className="setup-footnote">
          لا تدخل بيانات حقيقية قبل اعتماد منطقة الاستضافة وسياسة الخصوصية.
        </p>
      </section>
    </main>
  );
}
