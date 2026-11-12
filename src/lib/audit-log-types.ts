export type AuditLogEntry = {
  id: number;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, string> | null;
  occurredAt: string;
};
