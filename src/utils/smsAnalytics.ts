import type { Agreement, NotificationRecord, Tenant, Unit } from '../types/rental';
import { normalizeNigerianPhoneForBulkSms } from './bulksmslive';
import { calculateSmsSegments } from './messaging';

export interface SmsRecipientCostSummary {
  key: string;
  recipientName: string;
  recipientContact: string;
  recipientRole: string;
  tenantId?: string;
  unitCode?: string;
  totalMessages: number;
  deliveredCount: number;
  sentCount: number;
  queuedCount: number;
  failedCount: number;
  billableUnits: number;
  totalCostNaira: number;
  lastActivityAt: string;
}

export interface SmsPortfolioMetrics {
  totalRecords: number;
  dispatchedCount: number;
  deliveredCount: number;
  queuedCount: number;
  failedCount: number;
  deliveryRatePct: number;
  totalUnitsConsumed: number;
  totalCostNaira: number;
  uniqueRecipientCount: number;
}

export function getSmsRecordUnits(
  record: Pick<NotificationRecord, 'smsUnits' | 'messageBody' | 'status'>
): { segmentCount: number; billableUnits: number } {
  const segmentCount = Math.max(1, calculateSmsSegments(record.messageBody || '').segments);
  const isCharged =
    record.status === 'Delivered' || record.status === 'Sent';
  const rawUnits =
    typeof record.smsUnits === 'number' && Number.isFinite(record.smsUnits) && record.smsUnits > 0
      ? record.smsUnits
      : segmentCount;

  return {
    segmentCount,
    billableUnits: isCharged ? rawUnits : 0,
  };
}

export function getSmsRecordCostNaira(
  record: Pick<NotificationRecord, 'smsUnits' | 'smsCostNaira' | 'messageBody' | 'status'>,
  unitCostNaira: number
): number {
  const isCharged = record.status === 'Delivered' || record.status === 'Sent';
  if (!isCharged) return 0;
  if (
    typeof record.smsCostNaira === 'number' &&
    Number.isFinite(record.smsCostNaira) &&
    record.smsCostNaira >= 0
  ) {
    return Math.round(record.smsCostNaira * 100) / 100;
  }
  const { billableUnits } = getSmsRecordUnits(record);
  const safeRate = Number.isFinite(unitCostNaira) && unitCostNaira >= 0 ? unitCostNaira : 0;
  return Math.round(billableUnits * safeRate * 100) / 100;
}

export function buildSmsRecipientCostSummaries(params: {
  notifications: NotificationRecord[];
  tenants: Tenant[];
  agreements: Agreement[];
  units: Unit[];
  unitCostNaira: number;
}): {
  metrics: SmsPortfolioMetrics;
  summaries: SmsRecipientCostSummary[];
} {
  const smsRecords = params.notifications.filter((n) => n.channel === 'SMS');
  const map = new Map<string, SmsRecipientCostSummary>();

  let dispatchedCount = 0;
  let deliveredCount = 0;
  let queuedCount = 0;
  let failedCount = 0;
  let totalUnitsConsumed = 0;
  let totalCostNaira = 0;

  for (const n of smsRecords) {
    const normalizedPhone = normalizeNigerianPhoneForBulkSms(n.recipientContact) || n.recipientContact.trim();
    const key = n.tenantId ? `ten:${n.tenantId}` : `ph:${normalizedPhone || n.recipientName}`;
    const { billableUnits } = getSmsRecordUnits(n);
    const cost = getSmsRecordCostNaira(n, params.unitCostNaira);

    const isDelivered = n.status === 'Delivered';
    const isSent = n.status === 'Sent';
    const isQueued = n.status === 'Queued';
    const isFailed =
      n.status === 'Failed' ||
      n.status === 'Retry Pending' ||
      n.status === 'Exhausted / Action Required';

    if (isDelivered) {
      deliveredCount++;
      dispatchedCount++;
    } else if (isSent) {
      dispatchedCount++;
    } else if (isQueued) {
      queuedCount++;
    } else if (isFailed) {
      failedCount++;
    }

    totalUnitsConsumed += billableUnits;
    totalCostNaira = Math.round((totalCostNaira + cost) * 100) / 100;

    let unitCode: string | undefined;
    if (n.tenantId) {
      const ag =
        params.agreements.find((a) => a.tenantId === n.tenantId && a.status === 'Active') ||
        params.agreements.find((a) => a.tenantId === n.tenantId);
      const u = ag ? params.units.find((item) => item.id === ag.unitId) : undefined;
      unitCode = u?.code;
    }

    const existing = map.get(key);
    const activityAt = n.attemptedAt || n.scheduledAt;

    if (!existing) {
      map.set(key, {
        key,
        recipientName: n.recipientName,
        recipientContact: n.recipientContact,
        recipientRole: n.recipientRole,
        tenantId: n.tenantId,
        unitCode,
        totalMessages: 1,
        deliveredCount: isDelivered ? 1 : 0,
        sentCount: isSent ? 1 : 0,
        queuedCount: isQueued ? 1 : 0,
        failedCount: isFailed ? 1 : 0,
        billableUnits,
        totalCostNaira: cost,
        lastActivityAt: activityAt,
      });
    } else {
      existing.totalMessages += 1;
      if (isDelivered) existing.deliveredCount += 1;
      if (isSent) existing.sentCount += 1;
      if (isQueued) existing.queuedCount += 1;
      if (isFailed) existing.failedCount += 1;
      existing.billableUnits += billableUnits;
      existing.totalCostNaira = Math.round((existing.totalCostNaira + cost) * 100) / 100;
      if (activityAt > existing.lastActivityAt) {
        existing.lastActivityAt = activityAt;
      }
    }
  }

  const summaries = Array.from(map.values()).sort(
    (a, b) =>
      b.totalCostNaira - a.totalCostNaira ||
      b.totalMessages - a.totalMessages ||
      b.lastActivityAt.localeCompare(a.lastActivityAt)
  );

  const resolvedAttempts = dispatchedCount + failedCount;
  const deliveryRatePct =
    resolvedAttempts > 0 ? Math.round((dispatchedCount / resolvedAttempts) * 1000) / 10 : 0;

  return {
    metrics: {
      totalRecords: smsRecords.length,
      dispatchedCount,
      deliveredCount,
      queuedCount,
      failedCount,
      deliveryRatePct,
      totalUnitsConsumed,
      totalCostNaira,
      uniqueRecipientCount: summaries.length,
    },
    summaries,
  };
}

export function extractBulkSmsDlrMatch(
  reportsPayload: unknown,
  externalMessageId?: string
): {
  nextStatus: NotificationRecord['status'] | null;
  rawLabel: string;
} {
  const list = Array.isArray(reportsPayload)
    ? (reportsPayload as Array<Record<string, unknown>>)
    : reportsPayload && typeof reportsPayload === 'object'
    ? [reportsPayload as Record<string, unknown>]
    : [];

  if (list.length === 0) {
    return { nextStatus: null, rawLabel: 'Pending / No DLR returned yet' };
  }

  const matched =
    (externalMessageId
      ? list.find(
          (row) =>
            String(row.msgid ?? row.Msgid ?? row.message_id ?? row.id ?? '') ===
            String(externalMessageId)
        )
      : undefined) || list[0];

  const statusRaw = String(
    matched.status ?? matched.dlr ?? matched.delivery_status ?? matched.report ?? 'Checked'
  ).trim();

  if (/fail|reject|undeliv|expir|error|bounce/i.test(statusRaw)) {
    return { nextStatus: 'Failed', rawLabel: statusRaw };
  }
  if (/deliv|success/i.test(statusRaw)) {
    return { nextStatus: 'Delivered', rawLabel: statusRaw };
  }
  if (/sent|submit|accept|queue|pend/i.test(statusRaw)) {
    return { nextStatus: 'Sent', rawLabel: statusRaw };
  }
  return { nextStatus: null, rawLabel: statusRaw };
}
