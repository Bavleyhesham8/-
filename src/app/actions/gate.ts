"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db";
import {
  gateVisitors,
  gateVisits,
  residents,
  staffEmployees,
} from "@/db/schema";
import { requireStaffPermission } from "@/lib/auth-session";
import { recordAuditEvent } from "@/lib/audit-log";
import type { GateVisit } from "@/lib/gate-types";

const isoDateTime = z.string().datetime({ offset: true });
const visitIdSchema = z.string().uuid();

const createVisitSchema = z
  .object({
    personKind: z.enum(["resident", "employee", "visitor"]),
    personId: z.string().trim().min(1).max(200).nullable().optional(),
    visitorName: z.string().trim().min(1).max(200).optional(),
    nationalId: z.string().trim().max(64).optional(),
    phone: z.string().trim().max(64).optional(),
    entryAt: isoDateTime,
    exitAt: z.union([z.literal(""), isoDateTime]).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

const exitVisitSchema = z
  .object({
    id: visitIdSchema,
    exitAt: isoDateTime.optional(),
  })
  .strict();

const updateVisitSchema = z
  .object({
    id: visitIdSchema,
    entryAt: isoDateTime,
    exitAt: z.union([z.literal(""), isoDateTime]),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

function toVisit(row: {
  id: string;
  personKind: string;
  residentId: string | null;
  employeeNumber: number | null;
  visitorId: string | null;
  personName: string;
  nationalId: string;
  entryAt: Date;
  exitAt: Date | null;
  notes: string;
  createdAt: Date;
}): GateVisit {
  return {
    id: row.id,
    personKind:
      row.personKind === "employee" || row.personKind === "visitor"
        ? row.personKind
        : "resident",
    personId:
      row.residentId ??
      (row.employeeNumber === null ? null : String(row.employeeNumber)) ??
      row.visitorId,
    personName: row.personName,
    nationalId: row.nationalId,
    entryAt: row.entryAt.toISOString(),
    exitAt: row.exitAt ? row.exitAt.toISOString() : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createGateVisitAction(
  input: unknown,
): Promise<{ ok: true; visit: GateVisit } | { ok: false; error: string }> {
  const session = await requireStaffPermission("canManageGate");
  const parsed = createVisitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع بيانات الزيارة وحاول مرة أخرى." };
  }
  const data = parsed.data;
  const entryAt = new Date(data.entryAt);
  const exitAt = data.exitAt ? new Date(data.exitAt) : null;
  if (exitAt && exitAt <= entryAt) {
    return {
      ok: false,
      error: "وقت الخروج يجب أن يكون بعد وقت الدخول.",
    };
  }

  try {
    const visit = await getDatabase().transaction(async (transaction) => {
      let personName = "";
      let nationalId = data.nationalId ?? "";
      let residentId: string | null = null;
      let employeeNumber: number | null = null;
      let visitorId: string | null = null;

      if (data.personKind === "resident") {
        const residentIdParsed = visitIdSchema.safeParse(data.personId);
        if (!residentIdParsed.success) return null;
        const [resident] = await transaction
          .select({
            id: residents.id,
            name: residents.name,
            nationalId: residents.nationalId,
          })
          .from(residents)
          .where(eq(residents.id, residentIdParsed.data))
          .limit(1);
        if (!resident) return null;
        residentId = resident.id;
        personName = resident.name;
        nationalId = resident.nationalId ?? nationalId;

        const [openVisit] = await transaction
          .select({ id: gateVisits.id })
          .from(gateVisits)
          .where(
            and(
              eq(gateVisits.residentId, residentId),
              isNull(gateVisits.exitAt),
            ),
          )
          .limit(1);
        if (openVisit) return "open";
      } else if (data.personKind === "employee") {
        const employeeNumberParsed = z
          .coerce.number()
          .int()
          .positive()
          .safeParse(data.personId);
        if (!employeeNumberParsed.success) return null;
        const [employee] = await transaction
          .select({
            employeeNumber: staffEmployees.employeeNumber,
            employeeName: staffEmployees.employeeName,
          })
          .from(staffEmployees)
          .where(
            eq(
              staffEmployees.employeeNumber,
              employeeNumberParsed.data,
            ),
          )
          .limit(1);
        if (!employee) return null;
        employeeNumber = employee.employeeNumber;
        personName = employee.employeeName;

        const [openVisit] = await transaction
          .select({ id: gateVisits.id })
          .from(gateVisits)
          .where(
            and(
              eq(gateVisits.employeeNumber, employeeNumber),
              isNull(gateVisits.exitAt),
            ),
          )
          .limit(1);
        if (openVisit) return "open";
      } else {
        if (data.personId) {
          const visitorIdParsed = visitIdSchema.safeParse(data.personId);
          if (!visitorIdParsed.success) return null;
          const [visitor] = await transaction
            .select({
              id: gateVisitors.id,
              name: gateVisitors.name,
              nationalId: gateVisitors.nationalId,
            })
            .from(gateVisitors)
            .where(eq(gateVisitors.id, visitorIdParsed.data))
            .limit(1);
          if (!visitor) return null;
          visitorId = visitor.id;
          personName = visitor.name;
          nationalId = visitor.nationalId || nationalId;
        } else {
          const visitorName = data.visitorName?.trim();
          if (!visitorName) return null;

          if (nationalId) {
            const [existing] = await transaction
              .select({
                id: gateVisitors.id,
                name: gateVisitors.name,
                nationalId: gateVisitors.nationalId,
              })
              .from(gateVisitors)
              .where(eq(gateVisitors.nationalId, nationalId))
              .limit(1);
            if (existing) {
              visitorId = existing.id;
              personName = existing.name;
              nationalId = existing.nationalId;
            }
          }

          if (!visitorId) {
            const [created] = await transaction
              .insert(gateVisitors)
              .values({
                name: visitorName,
                nationalId,
                phone: data.phone ?? "",
                notes: data.notes ?? "",
                createdBy: session.user.id,
              })
              .returning({
                id: gateVisitors.id,
                name: gateVisitors.name,
                nationalId: gateVisitors.nationalId,
              });
            if (!created) return null;
            visitorId = created.id;
            personName = created.name;
            nationalId = created.nationalId;
          }
        }

        const [openVisit] = await transaction
          .select({ id: gateVisits.id })
          .from(gateVisits)
          .where(
            and(
              eq(gateVisits.visitorId, visitorId),
              isNull(gateVisits.exitAt),
            ),
          )
          .limit(1);
        if (openVisit) return "open";
      }

      const [created] = await transaction
        .insert(gateVisits)
        .values({
          personKind: data.personKind,
          residentId,
          employeeNumber,
          visitorId,
          personName,
          nationalId,
          entryAt,
          exitAt,
          notes: data.notes ?? "",
          createdBy: session.user.id,
        })
        .returning();
      return created ?? null;
    });

    if (visit === "open") {
      return {
        ok: false,
        error: "هذا الشخص لديه زيارة مفتوحة بالفعل. سجّل خروجه أولًا.",
      };
    }
    if (!visit) {
      return { ok: false, error: "تعذر العثور على بيانات الشخص المحدد." };
    }

    await recordAuditEvent({
      actorUserId: session.user.id,
      action: "gate-in",
      entity: "gate_visits",
      entityId: visit.id,
      metadata: { personKind: visit.personKind },
    });
    return { ok: true, visit: toVisit(visit) };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return {
        ok: false,
        error: "الرقم القومي مسجل بالفعل لزائر آخر. ابحث عنه واختره.",
      };
    }
    throw error;
  }
}

export async function recordGateExitAction(
  input: unknown,
): Promise<{ ok: true; visit: GateVisit } | { ok: false; error: string }> {
  const session = await requireStaffPermission("canManageGate");
  const parsed = exitVisitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "بيانات تسجيل الخروج غير صحيحة." };
  }

  const result = await getDatabase().transaction(async (transaction) => {
    const [visit] = await transaction
      .select()
      .from(gateVisits)
      .where(eq(gateVisits.id, parsed.data.id))
      .limit(1)
      .for("update");
    if (!visit) return null;
    if (visit.exitAt) return "already";

    const exitAt = parsed.data.exitAt
      ? new Date(parsed.data.exitAt)
      : new Date();
    if (exitAt < visit.entryAt) return "before";

    const [updated] = await transaction
      .update(gateVisits)
      .set({ exitAt, updatedAt: new Date() })
      .where(eq(gateVisits.id, visit.id))
      .returning();
    return updated ?? null;
  });

  if (result === "already") {
    return { ok: false, error: "تم تسجيل خروج هذه الزيارة بالفعل." };
  }
  if (result === "before") {
    return {
      ok: false,
      error: "وقت الخروج يجب أن يكون بعد وقت الدخول.",
    };
  }
  if (!result) {
    return { ok: false, error: "لم يتم العثور على الزيارة." };
  }

  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "gate-out",
    entity: "gate_visits",
    entityId: result.id,
  });
  return { ok: true, visit: toVisit(result) };
}

export async function updateGateVisitAction(
  input: unknown,
): Promise<{ ok: true; visit: GateVisit } | { ok: false; error: string }> {
  const session = await requireStaffPermission("canManageGate");
  const parsed = updateVisitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "راجع بيانات الزيارة وحاول مرة أخرى." };
  }
  const entryAt = new Date(parsed.data.entryAt);
  const exitAt = parsed.data.exitAt ? new Date(parsed.data.exitAt) : null;
  if (exitAt && exitAt <= entryAt) {
    return {
      ok: false,
      error: "وقت الخروج يجب أن يكون بعد وقت الدخول.",
    };
  }

  const [updated] = await getDatabase()
    .update(gateVisits)
    .set({
      entryAt,
      exitAt,
      notes: parsed.data.notes ?? "",
      updatedAt: new Date(),
    })
    .where(eq(gateVisits.id, parsed.data.id))
    .returning();
  if (!updated) {
    return { ok: false, error: "لم يتم العثور على الزيارة." };
  }

  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "update",
    entity: "gate_visits",
    entityId: updated.id,
    metadata: { fields: "entryAt,exitAt,notes" },
  });
  return { ok: true, visit: toVisit(updated) };
}

export async function deleteGateVisitAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireStaffPermission("canManageGate");
  const parsed = visitIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "معرّف الزيارة غير صالح." };
  }

  const [deleted] = await getDatabase()
    .delete(gateVisits)
    .where(eq(gateVisits.id, parsed.data))
    .returning({ id: gateVisits.id });
  if (!deleted) {
    return { ok: false, error: "لم يتم العثور على الزيارة." };
  }

  await recordAuditEvent({
    actorUserId: session.user.id,
    action: "delete",
    entity: "gate_visits",
    entityId: deleted.id,
  });
  return { ok: true };
}
