"use server";

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  churchLookup,
  governorateLookup,
  staffAccountLinks,
  staffEmployees,
  staffLeaveEntries,
  staffProfiles,
  user,
} from "@/db/schema";
import { requireAdministrator } from "@/lib/auth-session";
import { toStaffProfile } from "@/lib/staff-data";
import type {
  StaffAccountLink,
  StaffEmployee,
  StaffLeaveEntry,
  StaffProfile,
} from "@/lib/staff-types";

const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });
const optionalDateInput = z.union([z.literal(""), dateInput]);
const sourceText = z.string().trim().max(2000);

const staffProfileSchema = z.object({
  profileNumber: z.number().int().positive().nullable(),
  employeeId: sourceText.max(100),
  firstName: sourceText.min(1).max(255),
  thirdName: sourceText.max(255),
  nationalId: sourceText.max(100),
  address: sourceText,
  governorate: sourceText.max(255),
  district: sourceText.max(255),
  birthDate: optionalDateInput,
  maritalStatus: sourceText.max(255),
  qualification: sourceText.max(255),
  employmentStartDate: optionalDateInput,
  mobile: sourceText.max(100),
  church: sourceText.max(255),
  confessor: sourceText.max(255),
  confessorPhone: sourceText.max(100),
  denomination: sourceText.max(255),
  previousWorkplaces: sourceText,
  computerPrograms: sourceText,
  jobSpecialty: sourceText.max(255),
  employmentOffice: sourceText.max(255),
  photo: sourceText.max(2000),
  notes: sourceText,
  imagePath: sourceText.max(2000),
});

const employeeSchema = z.object({
  id: z.number().int().positive().max(2_147_483_647).nullable(),
  employeeNumber: z.number().int().positive().max(2_147_483_647),
  employeeName: z.string().trim().min(1).max(255),
});

const leaveSchema = z
  .object({
    employeeNumber: z.number().int().positive().max(2_147_483_647),
    leaveDate: dateInput,
    returnDate: dateInput,
    leaveType: z.string().trim().min(1).max(255),
    notes: sourceText,
  })
  .refine((value) => value.returnDate >= value.leaveDate, {
    path: ["returnDate"],
  });

const accountLinkSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  profileNumber: z.number().int().positive(),
  employeeNumber: z.number().int().positive(),
});

function blankToNull(value: string) {
  return value === "" ? null : value;
}

export async function saveStaffProfileAction(
  input: unknown,
): Promise<{ ok: true; profile: StaffProfile } | { ok: false; error: string }> {
  const session = await requireAdministrator();
  const parsed = staffProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع الاسم والتواريخ والحقول المدخلة." };
  }

  const { profileNumber, ...profile } = parsed.data;
  const values = {
    employeeId: blankToNull(profile.employeeId),
    firstName: profile.firstName,
    thirdName: blankToNull(profile.thirdName),
    nationalId: blankToNull(profile.nationalId),
    address: blankToNull(profile.address),
    governorate: blankToNull(profile.governorate),
    district: blankToNull(profile.district),
    birthDate: blankToNull(profile.birthDate),
    maritalStatus: blankToNull(profile.maritalStatus),
    qualification: blankToNull(profile.qualification),
    employmentStartDate: blankToNull(profile.employmentStartDate),
    mobile: blankToNull(profile.mobile),
    church: blankToNull(profile.church),
    confessor: blankToNull(profile.confessor),
    confessorPhone: blankToNull(profile.confessorPhone),
    denomination: blankToNull(profile.denomination),
    previousWorkplaces: blankToNull(profile.previousWorkplaces),
    computerPrograms: blankToNull(profile.computerPrograms),
    jobSpecialty: blankToNull(profile.jobSpecialty),
    employmentOffice: blankToNull(profile.employmentOffice),
    photo: blankToNull(profile.photo),
    notes: blankToNull(profile.notes),
    imagePath: blankToNull(profile.imagePath),
    updatedAt: new Date(),
  };
  const database = getDatabase();
  const result = await database.transaction(async (transaction): Promise<
    | { ok: true; profile: StaffProfile }
    | { ok: false; error: string }
  > => {
    const [existingProfile] = profileNumber
      ? await transaction
        .select()
        .from(staffProfiles)
        .where(eq(staffProfiles.profileNumber, profileNumber))
      : [];
    if (profileNumber && !existingProfile) {
      return {
        ok: false,
        error: "لم يتم العثور على سجل الموظف المطلوب.",
      };
    }

    const currentChurch = existingProfile?.church ?? "";
    if (profile.church && profile.church !== currentChurch) {
      const matchingChurches = await transaction
        .select({ id: churchLookup.id })
        .from(churchLookup)
        .where(eq(churchLookup.name, profile.church))
        .for("update");
      if (!matchingChurches.length) {
        return {
          ok: false,
          error: "اختر كنيسة مسجلة في قائمة البيانات المرجعية.",
        };
      }
    }

    const currentGovernorate = existingProfile?.governorate ?? "";
    const currentDistrict = existingProfile?.district ?? "";
    const locationUnchanged =
      profile.governorate === currentGovernorate &&
      profile.district === currentDistrict;
    if (
      (profile.governorate || profile.district) &&
      !locationUnchanged
    ) {
      if (!profile.governorate || !profile.district) {
        return { ok: false, error: "اختر المحافظة والمركز / الحي معًا." };
      }
      const matchingLocations = await transaction
        .select({ id: governorateLookup.id })
        .from(governorateLookup)
        .where(
          and(
            eq(governorateLookup.governorate, profile.governorate),
            eq(governorateLookup.district, profile.district),
          ),
        )
        .for("update");
      if (!matchingLocations.length) {
        return {
          ok: false,
          error: "اختر محافظة ومركزًا مسجلين في قائمة البيانات المرجعية.",
        };
      }
    }

    if (profileNumber) {
      const [lockedProfile] = await transaction
        .select()
        .from(staffProfiles)
        .where(eq(staffProfiles.profileNumber, profileNumber))
        .for("update");
      if (
        !lockedProfile ||
        lockedProfile.church !== existingProfile?.church ||
        lockedProfile.governorate !== existingProfile?.governorate ||
        lockedProfile.district !== existingProfile?.district
      ) {
        return {
          ok: false,
          error: "تغيرت بيانات الموظف أثناء التعديل. أعد تحميل الصفحة.",
        };
      }
    }

    const [savedProfile] = profileNumber
      ? await transaction
          .update(staffProfiles)
          .set(values)
          .where(eq(staffProfiles.profileNumber, profileNumber))
          .returning()
      : await transaction
          .insert(staffProfiles)
          .values({ ...values, createdBy: session.user.id })
          .returning();

    if (!savedProfile) {
      return { ok: false, error: "تعذر حفظ ملف الموظف." };
    }
    return { ok: true, profile: toStaffProfile(savedProfile) };
  });

  return result;
}

export async function saveStaffEmployeeAction(
  input: unknown,
): Promise<{ ok: true; employee: StaffEmployee } | { ok: false; error: string }> {
  await requireAdministrator();
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "أدخل رقم الموظف واسمه بصورة صحيحة." };
  }

  const [employee] = await getDatabase()
    .insert(staffEmployees)
    .values(parsed.data)
    .onConflictDoUpdate({
      target: staffEmployees.employeeNumber,
      set: { id: parsed.data.id, employeeName: parsed.data.employeeName },
    })
    .returning();
  if (!employee) {
    return { ok: false, error: "تعذر حفظ سجل الموظف." };
  }
  return { ok: true, employee };
}

export async function recordStaffLeaveAction(
  input: unknown,
): Promise<
  { ok: true; leaveEntry: StaffLeaveEntry }
  | { ok: false; error: string }
> {
  const session = await requireAdministrator();
  const parsed = leaveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "راجع الموظف ونوع الإجازة وتأكد أن تاريخ العودة لا يسبق بدايتها.",
    };
  }

  const database = getDatabase();
  const [employee] = await database
    .select({
      employeeNumber: staffEmployees.employeeNumber,
      employeeName: staffEmployees.employeeName,
    })
    .from(staffEmployees)
    .where(eq(staffEmployees.employeeNumber, parsed.data.employeeNumber))
    .limit(1);
  if (!employee) return { ok: false, error: "لم يتم العثور على الموظف." };

  const [entry] = await database
    .insert(staffLeaveEntries)
    .values({
      ...parsed.data,
      notes: blankToNull(parsed.data.notes),
      createdBy: session.user.id,
    })
    .returning();
  if (!entry) {
    return { ok: false, error: "تعذر تسجيل الإجازة." };
  }
  return {
    ok: true,
    leaveEntry: {
      id: entry.id,
      leaveDate: entry.leaveDate,
      returnDate: entry.returnDate,
      leaveType: entry.leaveType,
      notes: entry.notes ?? "",
      employeeNumber: employee.employeeNumber,
      employeeName: employee.employeeName,
    },
  };
}

export async function linkStaffAccountAction(
  input: unknown,
): Promise<
  { ok: true; link: StaffAccountLink } | { ok: false; error: string }
> {
  const session = await requireAdministrator();
  const parsed = accountLinkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "اختر الحساب والملف ورقم الموظف." };
  }

  const database = getDatabase();
  const result = await database.transaction(async (transaction) => {
    const [targetUser] = await transaction
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, parsed.data.userId), ne(user.role, "admin")))
      .limit(1);
    if (!targetUser) return { error: "حساب الموظف غير موجود." } as const;

    const [profile] = await transaction
      .select({ profileNumber: staffProfiles.profileNumber })
      .from(staffProfiles)
      .where(eq(staffProfiles.profileNumber, parsed.data.profileNumber))
      .limit(1);
    if (!profile) return { error: "ملف الموظف غير موجود." } as const;

    const [employee] = await transaction
      .select({ employeeNumber: staffEmployees.employeeNumber })
      .from(staffEmployees)
      .where(eq(staffEmployees.employeeNumber, parsed.data.employeeNumber))
      .limit(1);
    if (!employee) return { error: "سجل الموظف غير موجود." } as const;

    const [profileLink] = await transaction
      .select({ userId: staffAccountLinks.userId })
      .from(staffAccountLinks)
      .where(eq(staffAccountLinks.profileNumber, profile.profileNumber))
      .limit(1);
    if (profileLink && profileLink.userId !== targetUser.id) {
      return { error: "ملف الموظف مرتبط بحساب آخر." } as const;
    }

    const [employeeLink] = await transaction
      .select({ userId: staffAccountLinks.userId })
      .from(staffAccountLinks)
      .where(eq(staffAccountLinks.employeeNumber, employee.employeeNumber))
      .limit(1);
    if (employeeLink && employeeLink.userId !== targetUser.id) {
      return { error: "سجل الإجازات مرتبط بحساب آخر." } as const;
    }

    await transaction
      .insert(staffAccountLinks)
      .values({
        userId: targetUser.id,
        profileNumber: profile.profileNumber,
        employeeNumber: employee.employeeNumber,
        linkedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: staffAccountLinks.userId,
        set: {
          profileNumber: profile.profileNumber,
          employeeNumber: employee.employeeNumber,
          linkedAt: new Date(),
          linkedBy: session.user.id,
        },
      });
    return {
      link: {
        userId: targetUser.id,
        profileNumber: profile.profileNumber,
        employeeNumber: employee.employeeNumber,
      },
    } as const;
  });

  if ("error" in result) {
    return {
      ok: false,
      error: result.error ?? "تعذر ربط الحساب ببيانات الموظف.",
    };
  }
  return { ok: true, link: result.link };
}
