import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getPersistentConfigurationError,
  isDevelopmentDemoMode,
} from "@/lib/app-config";
import { getCurrentSession } from "@/lib/auth-session";
import SignInForm from "@/components/sign-in-form";
import SetupRequired from "@/app/setup-required";

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInLoading />}>
      <SignInContent />
    </Suspense>
  );
}

async function SignInContent() {
  await connection();
  const configurationError = getPersistentConfigurationError();

  if (configurationError) {
    if (!isDevelopmentDemoMode()) return <SetupRequired />;

    const cookieStore = await cookies();
    if (cookieStore.get("qithara-demo-session")?.value) {
      redirect("/");
    }
    return <SignInForm mode="demo" />;
  }

  if (await getCurrentSession()) redirect("/");

  return <SignInForm mode="persistent" />;
}

function SignInLoading() {
  return (
    <main className="setup-page" dir="rtl" aria-busy="true">
      <section className="setup-card">
        <p>جارٍ التحقق من إعداد تسجيل الدخول...</p>
      </section>
    </main>
  );
}
