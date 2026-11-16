import "server-only";

import { getDatabase } from "@/db";
import { auditLogs } from "@/db/schema";

type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "permission-change"
  | "clock-in"
  | "clock-out";

export async function recordAuditEvent({
  actorUserId,
  action,
  entity,
  entityId,
  metadata,
}: {
  actorUserId: string;
  action: AuditAction;
  entity: string;
  entityId?: string | number | null;
  metadata?: Record<string, string>;
}) {
  await getDatabase()
    .insert(auditLogs)
    .values({
      actorUserId,
      action,
      entity,
      entityId: entityId == null ? null : String(entityId),
      metadata,
    });
}
