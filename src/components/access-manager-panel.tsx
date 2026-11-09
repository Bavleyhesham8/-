"use client";

import { useState } from "react";
import type { DemoUser } from "@/lib/demo-data";
import type { InventoryBundle } from "@/lib/inventory-types";
import { updateUserRoleAndPermissionsAction } from "@/app/actions/residents";
import { grantStaffCanteenAccessAction } from "@/app/actions/canteen";
import { updateStaffInventoryAccessAction } from "@/app/actions/inventory";

type Props = {
  users: DemoUser[];
  inventory: InventoryBundle;
  persistent: boolean;
  onUsersChange: (users: DemoUser[]) => void;
  onAddingStaffToggle: () => void;
  addingStaff: boolean;
};

const AVAILABLE_SCREENS = [
  { id: "overview", label: "الرئيسية" },
  { id: "residents", label: "النزلاء" },
  { id: "resident-reports", label: "تقرير النزلاء" },
  { id: "resident-stay-reports", label: "الفترة الزمنية" },
  { id: "resident-search", label: "بحث النزلاء" },
  { id: "rooms", label: "السكن والغرف" },
  { id: "treatment", label: "العلاج" },
  { id: "canteen", label: "الكانتين" },
  { id: "sales", label: "فواتير الكانتين" },
  { id: "custody", label: "مخزن العهدة" },
  { id: "meat-sales", label: "الثلاجة" },
  { id: "inventory", label: "مخزن الأغذية" },
  { id: "resident-finance", label: "أمانات النزلاء" },
  { id: "canteen-reports", label: "أرصدة الكانتين والمنصرف" },
  { id: "invoice-reports", label: "مشتريات النزلاء" },
  { id: "tracking", label: "دفتر اليومية والحركات" },
  { id: "staff", label: "الموظفون" },
  { id: "lookups", label: "البيانات المرجعية" },
];

export default function AccessManagerPanel({
  users,
  inventory,
  persistent,
  onUsersChange,
  onAddingStaffToggle,
  addingStaff,
}: Props) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function handleUpdateUser(userToUpdate: DemoUser, updates: Partial<DemoUser>) {
    const updated: DemoUser = { ...userToUpdate, ...updates };

    // تحديث فوري بالواجهة
    const nextUsers = users.map((u) => (u.id === userToUpdate.id ? updated : u));
    onUsersChange(nextUsers);

    if (persistent) {
      setSavingId(userToUpdate.id);
      try {
        const result = await updateUserRoleAndPermissionsAction({
          userId: updated.id,
          role: updated.role,
          canEditResidents: updated.canEdit,
          canAccessClinic: updated.canAccessClinic ?? false,
          canManageCanteen: updated.canManageCanteen ?? false,
          canIssueInvoices: updated.canIssueInvoices ?? false,
          canManageWarehouse: updated.canManageWarehouse ?? false,
          canManageCustody: updated.canManageCustody ?? false,
          canManageMeatSales: updated.canManageMeatSales ?? false,
          allowedScreens: updated.allowedScreens ?? [],
        });

        if (!result.ok) {
          setFeedback({ type: "error", msg: result.error });
          return;
        }

        if (updates.canManageCanteen !== undefined) {
          const canteenResult = await grantStaffCanteenAccessAction(
            userToUpdate.id,
            updates.canManageCanteen,
          );
          if (!canteenResult.ok) {
            setFeedback({ type: "error", msg: canteenResult.error });
            return;
          }
        }

        if (updates.inventoryCategoryIds !== undefined) {
          const inventoryResult = await updateStaffInventoryAccessAction(
            userToUpdate.id,
            updates.inventoryCategoryIds,
          );
          if (!inventoryResult.ok) {
            setFeedback({ type: "error", msg: inventoryResult.error });
            return;
          }
        }

        setFeedback({ type: "success", msg: `تم تحديث صلاحيات ${updated.name} بنجاح.` });
      } catch {
        setFeedback({ type: "error", msg: "تعذر حفظ الصلاحيات. حاول مرة أخرى." });
      } finally {
        setSavingId(null);
      }
    }
  }

  function toggleViewerScreen(user: DemoUser, screenId: string) {
    const currentScreens = user.allowedScreens ?? [];
    const nextScreens = currentScreens.includes(screenId)
      ? currentScreens.filter((s) => s !== screenId)
      : [...currentScreens, screenId];
    handleUpdateUser(user, { allowedScreens: nextScreens });
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* رأس اللوحة الإدارية */}
      <div className="rounded-2xl border border-white/60 bg-white/85 p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-800">
              <span>🛡️</span>
              <span>مصفوفة الصلاحيات الثلاثية</span>
            </div>
            <h2 className="mt-2 text-2xl font-bold text-slate-800">
              إدارة صلاحيات المستخدمين والوصول
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              التحكم في رتب المستخدمين (مدير · موظف تشغيلي · زائر بيانات) وتحديد الصلاحيات الفردية لكل شخص على حدة.
            </p>
          </div>

          <button
            onClick={onAddingStaffToggle}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700"
          >
            <span>➕</span>
            <span>{addingStaff ? "إلغاء الإضافة" : "إضافة حساب جديد"}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border p-4 text-sm font-medium ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.type === "success" ? "✓ " : "⚠️ "} {feedback.msg}
        </div>
      )}

      {/* قائمة بطاقات المستخدمين وصلاحياتهم */}
      <div className="space-y-4">
        {users.map((user) => (
          <div
            key={user.id}
            className="overflow-hidden rounded-2xl border border-white/60 bg-white/85 p-6 shadow-sm backdrop-blur-md transition"
          >
            {/* شريط معلومات المستخدم والرتبة */}
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-lg font-bold text-teal-800">
                  {user.name.trim().slice(0, 1)}
                </span>
                <div>
                  <h4 className="text-base font-bold text-slate-800">{user.name}</h4>
                  <p className="text-xs text-slate-500">{user.email || "حساب محلي"}</p>
                </div>
              </div>

              {/* محدد الرتبة الثلاثية */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">الرتبة:</span>
                <select
                  value={user.role}
                  onChange={(e) =>
                    handleUpdateUser(user, {
                      role: e.target.value as DemoUser["role"],
                    })
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-teal-500 focus:outline-hidden"
                >
                  <option value="admin">👑 مدير عام (Admin)</option>
                  <option value="staff">💼 موظف تشغيلي (Staff)</option>
                  <option value="viewer">👁️ زائر ومستعرض بيانات (Viewer)</option>
                </select>
                {savingId === user.id && (
                  <span className="text-xs text-teal-600 animate-pulse font-medium">جاري الحفظ...</span>
                )}
              </div>
            </div>

            {/* تفاصيل الصلاحيات حسب الرتبة */}
            <div className="pt-4">
              {user.role === "admin" ? (
                <div className="rounded-xl bg-teal-50/70 p-3 text-xs font-semibold text-teal-900 border border-teal-200/50">
                  👑 يمتلك هذا الحساب صلاحيات المدير العام الكاملة على جميع الأقسام، والسجلات، واعتماد أو إلغاء الحركات، وإدارة الحسابات.
                </div>
              ) : user.role === "staff" ? (
                /* صلاحيات الموظف التشغيلية الفردية */
                <div className="space-y-4">
                  <p className="text-xs font-bold text-slate-700">الصلاحيات التشغيلية الممنوحة لهذا الموظف:</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs font-semibold text-slate-800 hover:bg-slate-100/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={user.canEdit}
                        onChange={(e) => handleUpdateUser(user, { canEdit: e.target.checked })}
                        className="h-4 w-4 rounded-sm text-teal-600 focus:ring-teal-500"
                      />
                      <span>تعديل وإدارة النزلاء والإقامة</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs font-semibold text-slate-800 hover:bg-slate-100/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={user.canAccessClinic ?? false}
                        onChange={(e) => handleUpdateUser(user, { canAccessClinic: e.target.checked })}
                        className="h-4 w-4 rounded-sm text-teal-600 focus:ring-teal-500"
                      />
                      <span>العيادة وصرف الأدوية</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs font-semibold text-slate-800 hover:bg-slate-100/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={user.canManageCanteen ?? false}
                        onChange={(e) => handleUpdateUser(user, { canManageCanteen: e.target.checked, canteenAccess: e.target.checked })}
                        className="h-4 w-4 rounded-sm text-teal-600 focus:ring-teal-500"
                      />
                      <span>مخزون الكانتين وأذون الصرف</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs font-semibold text-slate-800 hover:bg-slate-100/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={user.canIssueInvoices ?? false}
                        onChange={(e) => handleUpdateUser(user, { canIssueInvoices: e.target.checked })}
                        className="h-4 w-4 rounded-sm text-teal-600 focus:ring-teal-500"
                      />
                      <span>تسجيل فواتير ومبيعات الكانتين</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs font-semibold text-slate-800 hover:bg-slate-100/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={user.canManageWarehouse ?? false}
                        onChange={(e) => handleUpdateUser(user, { canManageWarehouse: e.target.checked })}
                        className="h-4 w-4 rounded-sm text-teal-600 focus:ring-teal-500"
                      />
                      <span>إدارة مخزن الأدوات والأصول</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs font-semibold text-slate-800 hover:bg-slate-100/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={user.canManageCustody ?? false}
                        onChange={(e) => handleUpdateUser(user, { canManageCustody: e.target.checked })}
                        className="h-4 w-4 rounded-sm text-teal-600 focus:ring-teal-500"
                      />
                      <span>تسليم واسترجاع العهد</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs font-semibold text-slate-800 hover:bg-slate-100/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={user.canManageMeatSales ?? false}
                        onChange={(e) => handleUpdateUser(user, { canManageMeatSales: e.target.checked })}
                        className="h-4 w-4 rounded-sm text-teal-600 focus:ring-teal-500"
                      />
                      <span>مبيعات اللحوم والثلاجة</span>
                    </label>
                  </div>

                  {inventory.categories.length > 0 && (
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                      <p className="mb-2 text-xs font-bold text-slate-700">
                        فئات المخزون المسموح بها:
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                        {inventory.categories.map((category) => {
                          const granted = (user.inventoryCategoryIds ?? []).includes(
                            category.id,
                          );
                          return (
                            <label
                              key={category.id}
                              className="flex items-center gap-2 text-xs font-medium text-slate-700"
                            >
                              <input
                                type="checkbox"
                                checked={granted}
                                onChange={(e) => {
                                  const current = user.inventoryCategoryIds ?? [];
                                  const next = e.target.checked
                                    ? [...current, category.id]
                                    : current.filter((id) => id !== category.id);
                                  void handleUpdateUser(user, {
                                    inventoryCategoryIds: next,
                                  });
                                }}
                                className="h-3.5 w-3.5 rounded-sm text-teal-600 focus:ring-teal-500"
                              />
                              <span>{category.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* صلاحيات زائر ومستعرض البيانات (قراءة وتصدير فقط) */
                <div className="space-y-4">
                  <div className="rounded-xl bg-amber-50/70 p-3 text-xs font-semibold text-amber-900 border border-amber-200/50">
                    👁️ حساب مستعرض بيانات (Read-Only & Export): يمكنه فقط قراءة وتصدير وطباعة الشاشات المحددة له أدناه دون أي قدرة على التعديل أو الحذف.
                  </div>
                  <p className="text-xs font-bold text-slate-700">حدد الشاشات المصرح لهذا المستعرض برؤيتها:</p>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                    {AVAILABLE_SCREENS.map((screen) => {
                      const isChecked = (user.allowedScreens ?? []).includes(screen.id);
                      return (
                        <label
                          key={screen.id}
                          className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-medium cursor-pointer transition ${
                            isChecked
                              ? "border-teal-500 bg-teal-50/80 text-teal-900 font-bold"
                              : "border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleViewerScreen(user, screen.id)}
                            className="h-3.5 w-3.5 rounded-sm text-teal-600 focus:ring-teal-500"
                          />
                          <span>{screen.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

