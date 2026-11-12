"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import { staffAccountLinks, staffAttendance } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit-log";
import { requireAdministrator, requireScreenAccess } from "@/lib/auth-session";

const employeeNumberSchema = z
  .number()
  .int()
  .positive()
  .max(2_147_483_647);

const editSchema = z.object({
  id: z.number().int().positive(),
  clockInAt: z.string().datetime({ offset: true }),
  clockOutAt: z.string().datetime({ offset: true }).nullable(),
});

export async function editStaffAttendanceAction(input: unknown) {
  const session = await requireAdministrator();
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "تحقق من أوقات الحضور والانصراف." };
  }
  const clockInAt = new Date(parsed.data.clockInAt);
  const clockOutAt = parsed.data.clockOutAt
    ? new Date(parsed.data.clockOutAt)
    : null;
  const now = Date.now();
  if (clockInAt.getTime() > now || (clockOutAt && clockOutAt.getTime() > now)) {
    return { ok: false as const, error: "لا يمكن تسجيل وقت حضور أو انصراف في المستقبل." };
  }
  if (clockOutAt && clockOutAt <= clockInAt) {
    return { ok: false as const, error: "وقت الانصراف يجب أن يكون بعد الحضور." };
  }

  const updated = await getDatabase().transaction(async (transaction) => {
    const [entry] = await transaction
      .select({ id: staffAttendance.id, employeeNumber: staffAttendance.employeeNumber })
      .from(staffAttendance)
      .where(eq(staffAttendance.id, parsed.data.id))
      .for("update");
    if (!entry) return null;

    if (!clockOutAt) {
      const [otherOpenEntry] = await transaction
        .select({ id: staffAttendance.id })
        .from(staffAttendance)
        .where(and(
          eq(staffAttendance.employeeNumber, entry.employeeNumber),
          isNull(staffAttendance.clockOutAt),
          ne(staffAttendance.id, entry.id),
        ))
        .limit(1);
      if (otherOpenEntry) return false;
    }

    const [row] = await transaction
      .update(staffAttendance)
      .set({
        clockInAt,
        clockOutAt,
        clockOutBy: clockOutAt ? session.user.id : null,
      })
      .where(eq(staffAttendance.id, entry.id))
      .returning({ id: staffAttendance.id });
    return row ?? null;
  });

  if (updated === false) {
    return { ok: false as const, error: "للموظف حضور مفتوح آخر؛ أغلقه قبل تعديل السجل." };
  }
  if (!updated) return { ok: false as const, error: "لم يتم العثور على سجل الحضور." };
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "update",
    entity: "staff_attendance",
    entityId: updated.id,
    metadata: { fields: "clockInAt,clockOutAt" },
  });
  return { ok: true as const };
}

export async function deleteStaffAttendanceAction(input: unknown) {
  const session = await requireAdministrator();
  const parsed = z.number().int().positive().safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "معرّف سجل الحضور غير صالح." };
  }
  const [deleted] = await getDatabase()
    .delete(staffAttendance)
    .where(eq(staffAttendance.id, parsed.data))
    .returning({ id: staffAttendance.id });
  if (!deleted) {
    return { ok: false as const, error: "لم يتم العثور على سجل الحضور." };
  }
  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "delete",
    entity: "staff_attendance",
    entityId: deleted.id,
    metadata: { fields: "attendanceRecord" },
  });
  return { ok: true as const };
}

async function getTargetEmployeeNumber(input: unknown) {
  const session = await requireScreenAccess("staff-attendance");
  if (session.user.role === "viewer") {
    return {
      session,
      employeeNumber: null,
      error: "حساب المستعرض لا يمكنه تسجيل الحضور والانصراف.",
    };
  }
  if (session.user.role === "admin") {
    const parsed = employeeNumberSchema.safeParse(
      typeof input === "object" && input !== null && "employeeNumber" in input
        ? input.employeeNumber
        : undefined,
    );
    if (!parsed.success) {
      return { session, employeeNumber: null, error: "اختر الموظف أولًا." };
    }
    return { session, employeeNumber: parsed.data, error: null };
  }

  const [link] = await getDatabase()
    .select({ employeeNumber: staffAccountLinks.employeeNumber })
    .from(staffAccountLinks)
    .where(eq(staffAccountLinks.userId, session.user.id))
    .limit(1);

  if (!link) {
    return {
      session,
      employeeNumber: null,
      error: "يجب ربط حسابك بملف الموظف قبل تسجيل الحضور.",
    };
  }
  return { session, employeeNumber: link.employeeNumber, error: null };
}

export async function clockInStaffAction(input?: unknown) {
  const target = await getTargetEmployeeNumber(input);
  if (target.error || target.employeeNumber === null) {
    return { ok: false as const, error: target.error ?? "تعذر تحديد الموظف." };
  }

  let entry: { id: number } | null;
  try {
    entry = await getDatabase().transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ id: staffAttendance.id })
        .from(staffAttendance)
        .where(
          and(
            eq(staffAttendance.employeeNumber, target.employeeNumber),
            isNull(staffAttendance.clockOutAt),
          ),
        )
        .for("update");
      if (existing) return null;

      const [created] = await transaction
        .insert(staffAttendance)
        .values({
          employeeNumber: target.employeeNumber,
          clockInBy: target.session.user.id,
        })
        .returning({ id: staffAttendance.id });
      return created ?? null;
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return { ok: false as const, error: "يوجد حضور مفتوح بالفعل لهذا الموظف." };
    }
    throw error;
  }
  if (!entry) {
    return { ok: false as const, error: "تم تسجيل الحضور بالفعل لهذا الموظف." };
  }

  await recordAuditEvent({
    actorUserId: target.session.user.id,
    action: "clock-in",
    entity: "staff_attendance",
    entityId: entry.id,
  });

  return { ok: true as const };
}

export async function clockOutStaffAction(input?: unknown) {
  const target = await getTargetEmployeeNumber(input);
  if (target.error || target.employeeNumber === null) {
    return { ok: false as const, error: target.error ?? "تعذر تحديد الموظف." };
  }

  const result = await getDatabase().transaction(async (transaction) => {
    const [openEntry] = await transaction
      .select({ id: staffAttendance.id })
      .from(staffAttendance)
      .where(
        and(
          eq(staffAttendance.employeeNumber, target.employeeNumber),
          isNull(staffAttendance.clockOutAt),
        ),
      )
      .for("update");

    if (!openEntry) return null;

    const [updated] = await transaction
      .update(staffAttendance)
      .set({
        clockOutAt: new Date(),
        clockOutBy: target.session.user.id,
      })
      .where(eq(staffAttendance.id, openEntry.id))
      .returning({ id: staffAttendance.id });
    return updated ?? null;
  });

  if (!result) {
    return { ok: false as const, error: "لا يوجد تسجيل حضور مفتوح لهذا الموظف." };
  }

  await recordAuditEvent({
    actorUserId: target.session.user.id,
    action: "clock-out",
    entity: "staff_attendance",
    entityId: result.id,
  });
  return { ok: true as const };
}
