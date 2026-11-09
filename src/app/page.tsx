import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getPersistentConfigurationError,
  isDevelopmentDemoMode,
} from "@/lib/app-config";
import { getCurrentSession } from "@/lib/auth-session";
import { demoUsers } from "@/lib/demo-data";
import {
  listResidentsForCurrentUser,
  listStaffForAdministrator,
} from "@/lib/resident-data";
import { listInventoryForCurrentUser } from "@/lib/inventory-data";
import { listCanteenForCurrentUser } from "@/lib/canteen-data";
import { listCanteenSalesForAdministrator } from "@/lib/canteen-sales-data";
import { listMeatSalesForAdministrator } from "@/lib/meat-sales-data";
import { listCustodyDataForCurrentUser } from "@/lib/custody-data";
import { listStaffDataForCurrentUser } from "@/lib/staff-data";
import { listLookupDataForCurrentUser } from "@/lib/lookup-data";
import { listResidentFinanceForAdministrator } from "@/lib/resident-finance-data";
import { listTreatmentForAdministrator } from "@/lib/treatment-data";
import CenterDashboard from "@/components/center-dashboard";
import SetupRequired from "@/app/setup-required";

export default function Home() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardPage />
    </Suspense>
  );
}

async function DashboardPage() {
  await connection();
  const configurationError = getPersistentConfigurationError();

  if (configurationError) {
    if (!isDevelopmentDemoMode()) {
      return <SetupRequired />;
    }
    const cookieStore = await cookies();
    const demoSession = cookieStore.get("qithara-demo-session")?.value;
    if (!demoSession) {
      redirect("/sign-in");
    }
    const demoUser =
      demoUsers.find((user) => user.id === demoSession) ??
      (demoSession === "1" ? demoUsers[0] : undefined);
    if (!demoUser) {
      redirect("/sign-in");
    }
    return (
      <CenterDashboard
        currentUser={demoUser}
        initialUsers={demoUsers}
      />
    );
  }

  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");

  const userRole = session.user.role;
  const role: "admin" | "staff" | "viewer" =
    userRole === "admin" ? "admin" : userRole === "viewer" ? "viewer" : "staff";
  const canAccessClinic =
    role === "admin" || session.user.canAccessClinic === true;
  const canManageCanteen =
    role === "admin" || session.user.canManageCanteen === true;
  const canIssueInvoices =
    role === "admin" || session.user.canIssueInvoices === true;
  const canManageWarehouse =
    role === "admin" || session.user.canManageWarehouse === true;
  const canManageCustody =
    role === "admin" || session.user.canManageCustody === true;
  const canManageMeatSales =
    role === "admin" || session.user.canManageMeatSales === true;
  const [
    residents,
    staffAccessUsers,
    inventory,
    canteen,
    sales,
    meatSales,
    custody,
    staffData,
    lookups,
    residentFinance,
    treatment,
  ] =
    await Promise.all([
      listResidentsForCurrentUser(),
      role === "admin" ? listStaffForAdministrator() : Promise.resolve([]),
      listInventoryForCurrentUser(),
      listCanteenForCurrentUser(),
      canIssueInvoices
        ? listCanteenSalesForAdministrator()
        : Promise.resolve(undefined),
      canManageMeatSales
        ? listMeatSalesForAdministrator()
        : Promise.resolve(undefined),
      listCustodyDataForCurrentUser(),
      listStaffDataForCurrentUser(),
      listLookupDataForCurrentUser(),
      role === "admin"
        ? listResidentFinanceForAdministrator()
        : Promise.resolve(undefined),
      canAccessClinic
        ? listTreatmentForAdministrator()
        : Promise.resolve(undefined),
    ]);

  return (
    <CenterDashboard
      persistent
      initialResidents={residents}
      initialUsers={staffAccessUsers}
      initialInventory={inventory}
      currentUser={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role,
        canEdit:
          role === "admin" ||
          (role === "staff" && session.user.canEditResidents === true),
        inventoryCategoryIds: inventory.categories.map(
          (category) => category.id,
        ),
        canteenAccess: role === "admin" || canteen.hasAccess,
        canAccessClinic,
        canManageCanteen,
        canIssueInvoices,
        canManageWarehouse,
        canManageCustody,
        canManageMeatSales,
        allowedScreens: session.user.allowedScreens
          ? session.user.allowedScreens.split(",").filter(Boolean)
          : [],
      }}
      initialCanteen={canteen.bundle}
      initialSales={sales}
      initialMeatSales={meatSales}
      initialCustody={custody}
      initialStaffData={staffData}
      initialLookups={lookups}
      initialResidentFinance={residentFinance}
      initialTreatment={treatment}
    />
  );
}

function DashboardLoading() {
  return (
    <main className="setup-page" dir="rtl" aria-busy="true">
      <section className="setup-card">
        <p>جارٍ تحميل التطبيق...</p>
      </section>
    </main>
  );
}
