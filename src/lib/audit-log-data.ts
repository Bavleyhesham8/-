import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { auditLogs, user } from "@/db/schema";
import { requireAdministrator } from "@/lib/auth-session";
import type { AuditLogEntry } from "@/lib/audit-log-types";

export async function listAuditLogsForAdministrator(): Promise<AuditLogEntry[]> {
  await requireAdministrator();
  const rows = await getDatabase()
    .select({
      id: auditLogs.id,
      actorName: user.name,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      occurredAt: auditLogs.occurredAt,
    })
    .from(auditLogs)
    .leftJoin(user, eq(user.id, auditLogs.actorUserId))
    .orderBy(desc(auditLogs.occurredAt))
    .limit(200);

  return rows.map((row) => ({
    ...row,
    occurredAt: row.occurredAt.toISOString(),
  })) satisfies AuditLogEntry[];
}
