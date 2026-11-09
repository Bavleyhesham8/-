"use server";

import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  inventoryCategories,
  residents,
  residentStays,
  user,
  userCanteenAccess,
  userInventoryCategories,
  villaNumbers,
} from "@/db/schema";
import {
  requireAdministrator,
  requireResidentEditor,
} from "@/lib/auth-session";
import { getAuth } from "@/lib/auth";
import { getResidentRecord } from "@/lib/resident-data";
import type { DemoUser, Resident } from "@/lib/demo-data";
import { DASHBOARD_SCREENS } from "@/lib/access-control";

const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

const residentBaseDraftSchema = z
  .object({
    fileNumber: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    admissionDate: dateValue,
    exitDate: z.union([z.literal(""), dateValue]),
    villa: z.string().trim().max(64),
    room: z.string().trim().max(64),
    status: z.enum(["current", "departed"]),
  })
  .strict();
const residentAdminDraftSchema = residentBaseDraftSchema.extend({
  birthDate: z.union([z.literal(""), dateValue]),
  phone: z.string().trim().max(64),
  address: z.string().trim().max(500),
  district: z.string().trim().max(200),
  emergencyContact: z.string().trim().max(200),
  emergencyPhone: z.string().trim().max(64),
  relationship: z.string().trim().max(100),
  nationalId: z.string().trim().max(64).default(""),
  maritalStatus: z.string().trim().max(64).default(""),
  qualification: z.string().trim().max(200).default(""),
  previousExperience: z.string().trim().max(500).default(""),
  previousWorkplaces: z.string().trim().max(500).default(""),
  residentEntry: z.string().trim().max(200).default(""),
  relationshipDegree: z.string().trim().max(100).default(""),
  entryTime: z.string().trim().max(64).default(""),
  exitMethod: z.string().trim().max(200).default(""),
  treatingDoctorNumber: z.string().trim().max(64).default(""),
  treatingDoctorAddress: z.string().trim().max(500).default(""),
  rehabilitationTeam: z.string().trim().max(200).default(""),
  rehabilitationStage: z.string().trim().max(200).default(""),
  trainer: z.string().trim().max(200).default(""),
  supervisor: z.string().trim().max(200).default(""),
  lecturer: z.string().trim().max(200).default(""),
  imagePath: z.string().trim().default(""),
  governorate: z.string().trim().max(100).default(""),
  residentNumber: z.string().trim().max(64).default(""),
  incompleteStay: z.boolean().default(false),
  followUp: z.boolean().default(false),
  graduated: z.boolean().default(false),
});

const idSchema = z.string().uuid();

type ResidentDraft = z.infer<typeof residentAdminDraftSchema>;
type ResidentBaseDraft = z.infer<typeof residentBaseDraftSchema>;
type Database = ReturnType<typeof getDatabase>;
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

async function saveStay(
  transaction: DatabaseTransaction,
  residentId: string,
  draft: ResidentBaseDraft,
  userId: string,
) {
  const [latestStay] = await transaction
    .select()
    .from(residentStays)
    .where(eq(residentStays.residentId, residentId))
    .orderBy(desc(residentStays.admissionDate), desc(residentStays.createdAt))
    .limit(1)
    .for("update");

  const exitDate = draft.status === "departed" ? draft.exitDate : "";
  const stayValues = {
    admissionDate: draft.admissionDate,
    exitDate: exitDate || null,
    villa: draft.villa,
    room: draft.room,
  };

  if (!latestStay || (latestStay.exitDate && draft.status === "current")) {
    await transaction.insert(residentStays).values({
      residentId,
      ...stayValues,
      exitDate: draft.status === "current" ? null : exitDate || null,
      createdBy: userId,
    });
    return;
  }

  await transaction
    .update(residentStays)
    .set(stayValues)
    .where(eq(residentStays.id, latestStay.id));
}

export async function saveResidentAction(
  idInput: string | null,
  draftInput: unknown,
): Promise<{ ok: true; resident: Resident } | { ok: false; error: string }> {
  const currentSession = await requireResidentEditor();
  const isAdministrator = currentSession.user.role === "admin";
  let draft: ResidentDraft;
  if (isAdministrator) {
    const parsedDraft = residentAdminDraftSchema.safeParse(draftInput);
    if (!parsedDraft.success) {
      return { ok: false, error: "راجع البيانات المدخلة وحاول مرة أخرى." };
    }
    draft = parsedDraft.data;
  } else {
    const parsedDraft = residentBaseDraftSchema.safeParse(draftInput);
    if (!parsedDraft.success) {
      return { ok: false, error: "راجع البيانات المدخلة وحاول مرة أخرى." };
    }
    draft = {
      ...parsedDraft.data,
      birthDate: "",
      phone: "",
      address: "",
      district: "",
      emergencyContact: "",
      emergencyPhone: "",
      relationship: "",
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
  }

  if (
    (draft.status === "current" && draft.exitDate) ||
    (draft.status === "departed" && !draft.exitDate) ||
    (draft.exitDate && draft.exitDate < draft.admissionDate)
  ) {
    return {
      ok: false,
      error: "تأكد من توافق حالة الإقامة وتواريخ الدخول والمغادرة.",
    };
  }

  const id = idInput ? idSchema.safeParse(idInput) : null;
  if (idInput && !id?.success) {
    return { ok: false, error: "معرّف السجل غير صالح." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [existing] = id?.success
      ? await transaction
          .select({ id: residents.id })
          .from(residents)
          .where(eq(residents.id, id.data))
          .limit(1)
          .for("update")
      : [];

    if (id?.success && !existing) {
      return { error: "لم يتم العثور على سجل النزيل." } as const;
    }

    const [existingStay] = existing
      ? await transaction
          .select({
            villa: residentStays.villa,
            exitDate: residentStays.exitDate,
          })
          .from(residentStays)
          .where(eq(residentStays.residentId, existing.id))
          .orderBy(
            desc(residentStays.admissionDate),
            desc(residentStays.createdAt),
          )
          .limit(1)
          .for("update")
      : [];
    const createsNewStay =
      !existingStay || (!!existingStay.exitDate && draft.status === "current");
    if (
      draft.villa &&
      (createsNewStay || draft.villa !== existingStay?.villa)
    ) {
      const [villa] = await transaction
        .select({ id: villaNumbers.id })
        .from(villaNumbers)
        .where(eq(villaNumbers.villaNumber, draft.villa.normalize("NFC")))
        .limit(1)
        .for("update");
      if (!villa) {
        return {
          error: "اختر رقم فيلا مسجلًا في البيانات المرجعية.",
        } as const;
      }
    }

    const residentValues = {
      fileNumber: draft.fileNumber.normalize("NFC").toLocaleUpperCase("en-US"),
      name: draft.name,
      updatedAt: new Date(),
    };

    const [duplicateFileNumber] = await transaction
      .select({ id: residents.id })
      .from(residents)
      .where(eq(residents.fileNumber, residentValues.fileNumber))
      .limit(1)
      .for("update");
    if (duplicateFileNumber && duplicateFileNumber.id !== existing?.id) {
      return {
        error: "رقم الملف مستخدم بالفعل لسجل نزيل آخر.",
      } as const;
    }

    const profileValues = isAdministrator
      ? {
          birthDate: draft.birthDate || null,
          phone: draft.phone,
          address: draft.address,
          district: draft.district,
          emergencyContact: draft.emergencyContact,
          emergencyPhone: draft.emergencyPhone,
          relationship: draft.relationship,
          nationalId: draft.nationalId || "",
          maritalStatus: draft.maritalStatus || "",
          qualification: draft.qualification || "",
          previousExperience: draft.previousExperience || "",
          previousWorkplaces: draft.previousWorkplaces || "",
          residentEntry: draft.residentEntry || "",
          relationshipDegree: draft.relationshipDegree || "",
          entryTime: draft.entryTime || "",
          exitMethod: draft.exitMethod || "",
          treatingDoctorNumber: draft.treatingDoctorNumber || "",
          treatingDoctorAddress: draft.treatingDoctorAddress || "",
          rehabilitationTeam: draft.rehabilitationTeam || "",
          rehabilitationStage: draft.rehabilitationStage || "",
          trainer: draft.trainer || "",
          supervisor: draft.supervisor || "",
          lecturer: draft.lecturer || "",
          imagePath: draft.imagePath || "",
          governorate: draft.governorate || "",
          residentNumber: draft.residentNumber || "",
          incompleteStay: draft.incompleteStay || false,
          followUp: draft.followUp || false,
          graduated: draft.graduated || false,
        }
      : undefined;

    const [savedResident] = existing
      ? await transaction
          .update(residents)
          .set({ ...residentValues, ...profileValues })
          .where(eq(residents.id, existing.id))
          .returning({ id: residents.id })
      : await transaction
          .insert(residents)
          .values({
            ...residentValues,
            birthDate: profileValues?.birthDate ?? null,
            phone: profileValues?.phone ?? "",
            address: profileValues?.address ?? "",
            district: profileValues?.district ?? "",
            emergencyContact: profileValues?.emergencyContact ?? "",
            emergencyPhone: profileValues?.emergencyPhone ?? "",
            relationship: profileValues?.relationship ?? "",
            nationalId: profileValues?.nationalId ?? "",
            maritalStatus: profileValues?.maritalStatus ?? "",
            qualification: profileValues?.qualification ?? "",
            previousExperience: profileValues?.previousExperience ?? "",
            previousWorkplaces: profileValues?.previousWorkplaces ?? "",
            residentEntry: profileValues?.residentEntry ?? "",
            relationshipDegree: profileValues?.relationshipDegree ?? "",
            entryTime: profileValues?.entryTime ?? "",
            exitMethod: profileValues?.exitMethod ?? "",
            treatingDoctorNumber: profileValues?.treatingDoctorNumber ?? "",
            treatingDoctorAddress: profileValues?.treatingDoctorAddress ?? "",
            rehabilitationTeam: profileValues?.rehabilitationTeam ?? "",
            rehabilitationStage: profileValues?.rehabilitationStage ?? "",
            trainer: profileValues?.trainer ?? "",
            supervisor: profileValues?.supervisor ?? "",
            lecturer: profileValues?.lecturer ?? "",
            imagePath: profileValues?.imagePath ?? "",
            governorate: profileValues?.governorate ?? "",
            residentNumber: profileValues?.residentNumber ?? "",
            incompleteStay: profileValues?.incompleteStay ?? false,
            followUp: profileValues?.followUp ?? false,
            graduated: profileValues?.graduated ?? false,
            createdBy: currentSession.user.id,
          })
          .returning({ id: residents.id });

    const savedResidentId = savedResident?.id;
    if (!savedResidentId) {
      return {
        error: "تعذر حفظ سجل النزيل ورقم الملف؛ تحقق من عدم تكراره.",
      } as const;
    }

    await saveStay(
      transaction,
      savedResidentId,
      draft,
      currentSession.user.id,
    );
    return { residentId: savedResidentId } as const;
  }).catch((error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return {
        error: "رقم الملف مستخدم بالفعل لسجل نزيل آخر.",
      } as const;
    }
    throw error;
  });

  if (!("residentId" in result)) {
    return {
      ok: false,
      error: result.error ?? "تعذر حفظ سجل النزيل.",
    };
  }

  if (!result.residentId) throw new Error("Saved resident ID is missing.");
  const resident = await getResidentRecord(result.residentId);
  if (!resident) throw new Error("Saved resident could not be reloaded.");
  return { ok: true, resident };
}

export async function updateResidentArchiveAction(
  idInput: string,
  archived: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireResidentEditor();
  const id = idSchema.safeParse(idInput);
  if (!id.success) return { ok: false, error: "معرّف السجل غير صالح." };

  const updated = await getDatabase()
    .update(residents)
    .set({ archived, updatedAt: new Date() })
    .where(eq(residents.id, id.data))
    .returning({ id: residents.id });

  return updated.length
    ? { ok: true }
    : { ok: false, error: "لم يتم العثور على سجل النزيل." };
}

export async function checkOutResidentAction(
  idInput: string,
  exitDateInput: string,
): Promise<{ ok: true; resident: Resident } | { ok: false; error: string }> {
  await requireResidentEditor();
  const id = idSchema.safeParse(idInput);
  const exitDate = dateValue.safeParse(exitDateInput);
  if (!id.success || !exitDate.success) {
    return { ok: false, error: "معرّف السجل أو تاريخ المغادرة غير صالح." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [resident] = await transaction
      .select({ id: residents.id, archived: residents.archived })
      .from(residents)
      .where(eq(residents.id, id.data))
      .limit(1)
      .for("update");
    if (!resident || resident.archived) return false;

    const [stay] = await transaction
      .select()
      .from(residentStays)
      .where(eq(residentStays.residentId, id.data))
      .orderBy(desc(residentStays.admissionDate), desc(residentStays.createdAt))
      .limit(1)
      .for("update");

    if (!stay || stay.exitDate || exitDate.data < stay.admissionDate) {
      return false;
    }

    await transaction
      .update(residentStays)
      .set({ exitDate: exitDate.data })
      .where(eq(residentStays.id, stay.id));
    return true;
  });

  if (!result) {
    return {
      ok: false,
      error: "تعذر تسجيل المغادرة. تحقق من حالة الإقامة وتاريخها.",
    };
  }

  const resident = await getResidentRecord(id.data);
  if (!resident) throw new Error("Checked-out resident could not be reloaded.");
  return { ok: true, resident };
}

export async function updateStaffPermissionAction(
  userIdInput: string,
  canEditInput: boolean,
): Promise<
  { ok: true; user: DemoUser } | { ok: false; error: string }
> {
  await requireAdministrator();
  const id = z.string().min(1).max(200).safeParse(userIdInput);
  const canEdit = z.boolean().safeParse(canEditInput);
  if (!id.success || !canEdit.success) {
    return { ok: false, error: "بيانات الصلاحية غير صالحة." };
  }

  const [updatedUser] = await getDatabase()
    .update(user)
    .set({ canEditResidents: canEdit.data, updatedAt: new Date() })
    .where(and(eq(user.id, id.data), ne(user.role, "admin")))
    .returning({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      canEdit: user.canEditResidents,
      canAccessClinic: user.canAccessClinic,
      canManageCanteen: user.canManageCanteen,
      canIssueInvoices: user.canIssueInvoices,
      canManageWarehouse: user.canManageWarehouse,
      canManageCustody: user.canManageCustody,
      canManageMeatSales: user.canManageMeatSales,
      allowedScreens: user.allowedScreens,
    });

  if (!updatedUser) {
    return { ok: false, error: "لم يتم العثور على حساب الموظف." };
  }

  return {
    ok: true,
    user: {
      ...updatedUser,
      role: (updatedUser.role === "admin" || updatedUser.role === "viewer" ? updatedUser.role : "staff") as "admin" | "staff" | "viewer",
      allowedScreens: updatedUser.allowedScreens ? updatedUser.allowedScreens.split(",").filter(Boolean) : [],
    },
  };
}

export async function updateUserRoleAndPermissionsAction(
  input: unknown,
): Promise<
  { ok: true; user: DemoUser } | { ok: false; error: string }
> {
  const currentSession = await requireAdministrator();
  const schema = z.object({
    userId: z.string().min(1).max(200),
    role: z.enum(["admin", "staff", "viewer"]),
    canEditResidents: z.boolean().default(false),
    canAccessClinic: z.boolean().default(false),
    canManageCanteen: z.boolean().default(false),
    canIssueInvoices: z.boolean().default(false),
    canManageWarehouse: z.boolean().default(false),
    canManageCustody: z.boolean().default(false),
    canManageMeatSales: z.boolean().default(false),
    allowedScreens: z
      .array(z.enum(DASHBOARD_SCREENS))
      .max(DASHBOARD_SCREENS.length)
      .default([])
      .transform((screens) => [...new Set(screens)]),
    inventoryCategoryIds: z.array(z.string().uuid()).max(100).default([]),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "بيانات الصلاحيات غير صحيحة." };
  }

  const {
    userId,
    role,
    allowedScreens,
    inventoryCategoryIds,
    ...perms
  } = parsed.data;
  const database = getDatabase();
  const updated = await database.transaction(async (transaction) => {
    const [targetUser] = await transaction
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .for("update");
    if (!targetUser) {
      return { ok: false as const, error: "لم يتم العثور على المستخدم المطلوب." };
    }

    if (targetUser.role === "admin" && role !== "admin") {
      if (userId === currentSession.user.id) {
        return {
          ok: false as const,
          error: "لا يمكنك إزالة صلاحية المدير عن حسابك الحالي.",
        };
      }
      const [adminCount] = await transaction
        .select({ value: count() })
        .from(user)
        .where(eq(user.role, "admin"));
      if (Number(adminCount?.value ?? 0) <= 1) {
        return {
          ok: false as const,
          error: "لا يمكن إزالة صلاحية آخر مدير في النظام.",
        };
      }
    }

    if (inventoryCategoryIds.length) {
      const validCategories = await transaction
        .select({ id: inventoryCategories.id })
        .from(inventoryCategories)
        .where(
          and(
            inArray(inventoryCategories.id, inventoryCategoryIds),
            eq(inventoryCategories.active, true),
          ),
        );
      if (validCategories.length !== inventoryCategoryIds.length) {
        return {
          ok: false as const,
          error: "تحتوي صلاحيات المخزون على فئة غير متاحة.",
        };
      }
    }

    const [updatedUser] = await transaction
      .update(user)
      .set({
        role,
        canEditResidents: perms.canEditResidents,
        canAccessClinic: perms.canAccessClinic,
        canManageCanteen: perms.canManageCanteen,
        canIssueInvoices: perms.canIssueInvoices,
        canManageWarehouse: perms.canManageWarehouse,
        canManageCustody: perms.canManageCustody,
        canManageMeatSales: perms.canManageMeatSales,
        allowedScreens: allowedScreens.join(","),
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId))
      .returning({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        canEdit: user.canEditResidents,
        canAccessClinic: user.canAccessClinic,
        canManageCanteen: user.canManageCanteen,
        canIssueInvoices: user.canIssueInvoices,
        canManageWarehouse: user.canManageWarehouse,
        canManageCustody: user.canManageCustody,
        canManageMeatSales: user.canManageMeatSales,
        allowedScreens: user.allowedScreens,
      });
    if (!updatedUser) {
      return { ok: false as const, error: "لم يتم العثور على المستخدم المطلوب." };
    }

    await transaction
      .delete(userInventoryCategories)
      .where(eq(userInventoryCategories.userId, userId));
    if (inventoryCategoryIds.length) {
      await transaction.insert(userInventoryCategories).values(
        inventoryCategoryIds.map((categoryId) => ({
          userId,
          categoryId,
          grantedBy: currentSession.user.id,
        })),
      );
    }

    if (role !== "admin" && perms.canManageCanteen) {
      await transaction
        .insert(userCanteenAccess)
        .values({ userId, grantedBy: currentSession.user.id })
        .onConflictDoNothing();
    } else {
      await transaction
        .delete(userCanteenAccess)
        .where(eq(userCanteenAccess.userId, userId));
    }

    return { ok: true as const, user: updatedUser };
  });

  if (!updated.ok) return updated;
  const savedUser = updated.user;

  return {
    ok: true,
    user: {
      ...savedUser,
      role: (savedUser.role === "admin" || savedUser.role === "viewer" ? savedUser.role : "staff") as "admin" | "staff" | "viewer",
      allowedScreens: savedUser.allowedScreens ? savedUser.allowedScreens.split(",").filter(Boolean) : [],
      inventoryCategoryIds,
    },
  };
}

const newStaffSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

export async function createStaffAccountAction(
  input: unknown,
): Promise<
  | { ok: true; user: DemoUser }
  | { ok: false; error: string }
> {
  await requireAdministrator();
  const parsed = newStaffSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "أدخل اسمًا وبريدًا صحيحًا وكلمة مرور من 12 حرفًا على الأقل.",
    };
  }

  const created = await getAuth().api.createUser({
    headers: await headers(),
    body: {
      ...parsed.data,
      role: "staff",
    },
  });

  return {
    ok: true,
    user: {
      id: created.user.id,
      name: created.user.name,
      email: created.user.email,
      role: "staff",
      canEdit: false,
    },
  };
}
