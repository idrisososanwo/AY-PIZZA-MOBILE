/**
 * Audit Logging Service
 * Records sensitive administrative, payment, inventory, and lifecycle events.
 */

import { AuditAction, AuditRecord } from '../../types/audit';

export function createAuditRecord(params: {
  action: AuditAction;
  performedBy?: string | null;
  targetType: AuditRecord['targetType'];
  targetId: string;
  details: Record<string, unknown>;
  ipAddress?: string | null;
}): AuditRecord {
  if (!params.action) {
    throw new Error('Audit record requires an action type.');
  }
  if (!params.targetId) {
    throw new Error('Audit record requires a target ID.');
  }

  return {
    action: params.action,
    performedBy: params.performedBy || 'system',
    targetType: params.targetType,
    targetId: params.targetId,
    details: {
      ...params.details,
      timestamp: new Date().toISOString(),
    },
    ipAddress: params.ipAddress || null,
    createdAt: new Date().toISOString(),
  };
}
