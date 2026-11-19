import type { PropertyProfile, RentalAppState, SystemSettings } from '../types/rental';

export const WORKSPACE_SUBCOLLECTIONS = [
  'units',
  'tenants',
  'agreements',
  'obligations',
  'payments',
  'receiptRequests',
  'notifications',
  'smsTemplates',
  'commitments',
  'commissions',
  'commissionPayouts',
  'expenses',
  'maintenance',
  'contacts',
  'auditLogs',
] as const;

export type WorkspaceSubcollection = (typeof WORKSPACE_SUBCOLLECTIONS)[number];

export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidFirestoreId(value: unknown): value is string {
  return typeof value === 'string' && VALID_ID_REGEX.test(value);
}

export function truncateString(value: unknown, maxLen: number, fallback = ''): string {
  const str = typeof value === 'string' ? value : value == null ? fallback : String(value);
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

export function sanitizePropertyProfile(property: PropertyProfile): PropertyProfile {
  return {
    id: truncateString(property.id || 'prop-1', 128, 'prop-1') || 'prop-1',
    name: truncateString(property.name || "AgbaSaffy's Court", 160, "AgbaSaffy's Court") || "AgbaSaffy's Court",
    address: truncateString(property.address, 300),
    timezone: truncateString(property.timezone, 60),
    currencySymbol: truncateString(property.currencySymbol || '₦', 12, '₦'),
    managerName: truncateString(property.managerName, 120),
    managerEmail: truncateString(property.managerEmail, 254),
  };
}

export function sanitizeSystemSettings(settings: SystemSettings): SystemSettings {
  const cleaned: SystemSettings = {
    defaultRentCycle: settings.defaultRentCycle,
    securityLevyAmount: Math.max(0, Number(settings.securityLevyAmount) || 0),
    lawyerCommissionRatePercent: Math.min(100, Math.max(0, Number(settings.lawyerCommissionRatePercent) || 0)),
    gracePeriodDays: Math.max(0, Number(settings.gracePeriodDays) || 0),
    receiptSlaHours: Math.max(1, Number(settings.receiptSlaHours) || 1),
    defaultAllocationOrder: settings.defaultAllocationOrder,
    repeatedLateThresholdCycles: Number(settings.repeatedLateThresholdCycles) || 0,
    persistentArrearsDays: Number(settings.persistentArrearsDays) || 0,
    chronicDelinquencyDays: Number(settings.chronicDelinquencyDays) || 0,
    globalNotificationsPaused: Boolean(settings.globalNotificationsPaused),
    quietHoursStart: truncateString(settings.quietHoursStart || '20:00', 10, '20:00'),
    quietHoursEnd: truncateString(settings.quietHoursEnd || '07:00', 10, '07:00'),
    sendTenantPaymentConfirmation: Boolean(settings.sendTenantPaymentConfirmation),
    sendLawyerCommissionAlert: Boolean(settings.sendLawyerCommissionAlert),
    preDueOffsetsDays: Array.isArray(settings.preDueOffsetsDays)
      ? settings.preDueOffsetsDays.slice(0, 20).map((n) => Number(n) || 0)
      : [],
    postDueOffsetsDays: Array.isArray(settings.postDueOffsetsDays)
      ? settings.postDueOffsetsDays.slice(0, 20).map((n) => Number(n) || 0)
      : [],
    post30DayCadenceDays: Number(settings.post30DayCadenceDays) || 14,
    preferredEmailProvider: settings.preferredEmailProvider,
    autoSendPaymentReceipts: Boolean(settings.autoSendPaymentReceipts),
    autoSendScheduledReminders: Boolean(settings.autoSendScheduledReminders),
    autoSendCustomScheduled: Boolean(settings.autoSendCustomScheduled),
    autoSendArrearsEscalations: Boolean(settings.autoSendArrearsEscalations),
    smsUnitCostNaira: Math.max(0, Number(settings.smsUnitCostNaira) || 0),
  };
  if (settings.globalPauseReason !== undefined) {
    cleaned.globalPauseReason = truncateString(settings.globalPauseReason, 300);
  }
  return cleaned;
}

function optStr(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  return truncateString(val, maxLen);
}

export function sanitizeEntityForFirestore<T extends Record<string, unknown>>(
  collectionName: WorkspaceSubcollection,
  rawRecord: T,
  ownerUid: string,
  syncedAtMarker: unknown
): Record<string, unknown> {
  const base = stripUndefined({ ...rawRecord }) as Record<string, unknown>;
  const safeId = truncateString(base.id, 128);

  let doc: Record<string, unknown> = { ...base };

  switch (collectionName) {
    case 'units':
      doc = {
        id: safeId,
        code: truncateString(base.code, 64) || safeId,
        name: truncateString(base.name, 120) || safeId,
        type: base.type,
        floorOrWing: truncateString(base.floorOrWing, 80),
        occupancyStatus: base.occupancyStatus,
        notes: optStr(base.notes, 1000),
      };
      break;
    case 'tenants':
      doc = {
        id: safeId,
        firstName: truncateString(base.firstName, 80) || 'Tenant',
        lastName: truncateString(base.lastName, 80) || '-',
        phone: truncateString(base.phone, 40),
        email: truncateString(base.email, 254),
        archived: Boolean(base.archived),
        notificationsPaused: Boolean(base.notificationsPaused),
        pauseReason: optStr(base.pauseReason, 300),
        behaviourOverride: optStr(base.behaviourOverride, 60),
        behaviourOverrideReason: optStr(base.behaviourOverrideReason, 300),
        historicalLateCycles: Math.max(0, Number(base.historicalLateCycles) || 0),
        createdAt: truncateString(base.createdAt || new Date().toISOString(), 40),
        notes: optStr(base.notes, 1000),
      };
      break;
    case 'agreements':
      doc = {
        id: safeId,
        tenantId: truncateString(base.tenantId, 128),
        unitId: truncateString(base.unitId, 128),
        status: base.status,
        rentCycle: base.rentCycle,
        agreedRent: Math.max(0, Number(base.agreedRent) || 0),
        securityLevy: Math.max(0, Number(base.securityLevy) || 0),
        startDate: truncateString(base.startDate, 20),
        endDate: truncateString(base.endDate, 20),
        dueDate: truncateString(base.dueDate, 20),
        supersededById: optStr(base.supersededById, 128),
        previousAgreementId: optStr(base.previousAgreementId, 128),
        exceptionNote: optStr(base.exceptionNote, 500),
        createdAt: truncateString(base.createdAt || new Date().toISOString(), 40),
      };
      break;
    case 'obligations':
      doc = {
        id: safeId,
        agreementId: truncateString(base.agreementId, 128),
        tenantId: truncateString(base.tenantId, 128),
        unitId: truncateString(base.unitId, 128),
        chargeType: base.chargeType,
        rentalPeriodLabel: truncateString(base.rentalPeriodLabel, 120) || 'Charge',
        originalAmount: Math.max(0, Number(base.originalAmount) || 0),
        dueDate: truncateString(base.dueDate, 20),
        underReview: Boolean(base.underReview),
        reviewReason: optStr(base.reviewReason, 300),
        settledAt: optStr(base.settledAt, 40),
        settledLateDays:
          typeof base.settledLateDays === 'number' ? base.settledLateDays : undefined,
        createdAt: truncateString(base.createdAt || new Date().toISOString(), 40),
      };
      break;
    case 'payments':
      doc = {
        id: safeId,
        systemRef: truncateString(base.systemRef, 64),
        tenantId: truncateString(base.tenantId, 128),
        agreementId: truncateString(base.agreementId, 128),
        unitId: truncateString(base.unitId, 128),
        amount: Math.max(0, Number(base.amount) || 0),
        dateReceived: truncateString(base.dateReceived, 20),
        dateRecorded: truncateString(base.dateRecorded, 40),
        method: base.method,
        bankReference: truncateString(base.bankReference, 120),
        status: base.status,
        allocations: Array.isArray(base.allocations) ? base.allocations.slice(0, 50) : [],
        unappliedAmount: Math.max(0, Number(base.unappliedAmount) || 0),
        notes: truncateString(base.notes, 1000),
        recordedBy: truncateString(base.recordedBy, 120),
        duplicateFlag:
          typeof base.duplicateFlag === 'boolean' ? base.duplicateFlag : undefined,
        reversalReason: optStr(base.reversalReason, 300),
        reversedAt: optStr(base.reversedAt, 40),
        adjustedFromPaymentId: optStr(base.adjustedFromPaymentId, 128),
      };
      break;
    case 'receiptRequests':
      doc = {
        id: safeId,
        paymentId: truncateString(base.paymentId, 128),
        paymentRef: truncateString(base.paymentRef, 64),
        tenantId: truncateString(base.tenantId, 128),
        unitId: truncateString(base.unitId, 128),
        amount: Math.max(0, Number(base.amount) || 0),
        datePaid: truncateString(base.datePaid, 20),
        rentalPeriodCovered: truncateString(base.rentalPeriodCovered, 160),
        securityLevyIncluded: Math.max(0, Number(base.securityLevyIncluded) || 0),
        remainingBalanceAtPayment: Math.max(0, Number(base.remainingBalanceAtPayment) || 0),
        issuerContactId: truncateString(base.issuerContactId, 128),
        status: base.status,
        createdAt: truncateString(base.createdAt || new Date().toISOString(), 40),
        slaDeadlineAt: truncateString(base.slaDeadlineAt, 40),
        acknowledgedAt: optStr(base.acknowledgedAt, 40),
        acknowledgedNote: optStr(base.acknowledgedNote, 300),
        officialReceiptNumber: optStr(base.officialReceiptNumber, 80),
        issuedDate: optStr(base.issuedDate, 20),
        evidenceNote: optStr(base.evidenceNote, 500),
        cancellationReason: optStr(base.cancellationReason, 300),
      };
      break;
    case 'notifications':
      doc = {
        id: safeId,
        eventId: truncateString(base.eventId, 128),
        eventType: truncateString(base.eventType, 80),
        relatedRecordId: truncateString(base.relatedRecordId, 128),
        tenantId: optStr(base.tenantId, 128),
        recipientName: truncateString(base.recipientName, 120),
        recipientRole: truncateString(base.recipientRole, 60),
        recipientContact: truncateString(base.recipientContact, 254),
        channel: base.channel,
        status: base.status,
        subject: optStr(base.subject, 300),
        messageBody: truncateString(base.messageBody, 8000),
        scheduledAt: truncateString(base.scheduledAt, 40),
        attemptedAt: optStr(base.attemptedAt, 40),
        retryCount: Math.max(0, Number(base.retryCount) || 0),
        failureReason: optStr(base.failureReason, 500),
        isCustom: typeof base.isCustom === 'boolean' ? base.isCustom : undefined,
        deliveryProvider: optStr(base.deliveryProvider, 40),
        externalMessageId: optStr(base.externalMessageId, 200),
        smsUnits: typeof base.smsUnits === 'number' ? base.smsUnits : undefined,
        smsCostNaira: typeof base.smsCostNaira === 'number' ? base.smsCostNaira : undefined,
        createdBy: optStr(base.createdBy, 120),
        overrideQuietHours:
          typeof base.overrideQuietHours === 'boolean' ? base.overrideQuietHours : undefined,
        cancelledAt: optStr(base.cancelledAt, 40),
      };
      break;
    case 'smsTemplates':
      doc = {
        id: safeId,
        name: truncateString(base.name, 120) || 'Template',
        category: base.category,
        body: truncateString(base.body, 1600) || ' ',
        updatedAt: truncateString(base.updatedAt || new Date().toISOString(), 40),
      };
      break;
    case 'commitments':
      doc = {
        id: safeId,
        tenantId: truncateString(base.tenantId, 128),
        obligationIds: Array.isArray(base.obligationIds)
          ? base.obligationIds.slice(0, 50).map((id) => truncateString(id, 128))
          : [],
        promisedAmount: Math.max(0, Number(base.promisedAmount) || 0),
        promisedDate: truncateString(base.promisedDate, 20),
        extendedUntilDate: optStr(base.extendedUntilDate, 20),
        instalments: Array.isArray(base.instalments) ? base.instalments.slice(0, 24) : [],
        status: base.status,
        dateRecorded: truncateString(base.dateRecorded, 40),
        recordedBy: truncateString(base.recordedBy, 120),
        notes: truncateString(base.notes, 1000),
        cancellationReason: optStr(base.cancellationReason, 300),
      };
      break;
    case 'commissions':
      doc = {
        id: safeId,
        paymentId: truncateString(base.paymentId, 128),
        agreementId: truncateString(base.agreementId, 128),
        tenantId: truncateString(base.tenantId, 128),
        ratePercent: Number(base.ratePercent) || 0,
        eligibleRentCollected: Number(base.eligibleRentCollected) || 0,
        accruedAmount: Number(base.accruedAmount) || 0,
        createdAt: truncateString(base.createdAt || new Date().toISOString(), 40),
        isReversalAdjustment:
          typeof base.isReversalAdjustment === 'boolean' ? base.isReversalAdjustment : undefined,
        note: truncateString(base.note, 400),
      };
      break;
    case 'commissionPayouts':
      doc = {
        id: safeId,
        lawyerContactId: truncateString(base.lawyerContactId, 128),
        amount: Math.max(0, Number(base.amount) || 0),
        payoutDate: truncateString(base.payoutDate, 20),
        reference: truncateString(base.reference, 120),
        notes: truncateString(base.notes, 600),
        recordedBy: truncateString(base.recordedBy, 120),
        createdAt: truncateString(base.createdAt || new Date().toISOString(), 40),
      };
      break;
    case 'expenses':
      doc = {
        id: safeId,
        date: truncateString(base.date, 20),
        amount: Math.max(0, Number(base.amount) || 0),
        category: base.category,
        description: truncateString(base.description, 300),
        vendor: truncateString(base.vendor, 120),
        paymentMethod: optStr(base.paymentMethod, 40),
        reference: optStr(base.reference, 120),
        notes: optStr(base.notes, 1000),
        createdAt: truncateString(base.createdAt || new Date().toISOString(), 40),
      };
      break;
    case 'maintenance':
      doc = {
        id: safeId,
        unitId: optStr(base.unitId, 128),
        issue: truncateString(base.issue, 300),
        dateReported: truncateString(base.dateReported, 20),
        status: base.status,
        assignedTo: truncateString(base.assignedTo, 120),
        estimatedOrActualCost: Math.max(0, Number(base.estimatedOrActualCost) || 0),
        resolutionDetails: optStr(base.resolutionDetails, 600),
        resolvedDate: optStr(base.resolvedDate, 20),
      };
      break;
    case 'contacts':
      doc = {
        id: safeId,
        name: truncateString(base.name, 120),
        role: base.role,
        phone: truncateString(base.phone, 40),
        email: truncateString(base.email, 254),
        isPrimaryReceiptIssuer:
          typeof base.isPrimaryReceiptIssuer === 'boolean'
            ? base.isPrimaryReceiptIssuer
            : undefined,
        isBackupEscalation:
          typeof base.isBackupEscalation === 'boolean' ? base.isBackupEscalation : undefined,
        smsEnabled: Boolean(base.smsEnabled),
        emailEnabled: Boolean(base.emailEnabled),
        receivesArrearsEscalations: Boolean(base.receivesArrearsEscalations),
      };
      break;
    case 'auditLogs':
      doc = {
        id: safeId,
        timestamp: truncateString(base.timestamp, 40),
        actor: truncateString(base.actor, 120),
        entityType: base.entityType,
        entityId: truncateString(base.entityId, 128),
        action: truncateString(base.action, 120),
        summary: truncateString(base.summary, 1000),
        previousValue: optStr(base.previousValue, 300),
        newValue: optStr(base.newValue, 300),
        reason: optStr(base.reason, 400),
      };
      break;
  }

  return {
    ...stripUndefined(doc),
    ownerUid,
    syncedAt: syncedAtMarker,
  };
}

export function stripSyncMetadata<T extends Record<string, unknown>>(docData: T): Omit<T, 'ownerUid' | 'syncedAt'> {
  const clone = { ...docData };
  delete clone.ownerUid;
  delete clone.syncedAt;
  return clone as Omit<T, 'ownerUid' | 'syncedAt'>;
}

export function computeSubcollectionDiff<T extends { id: string }>(
  prevItems: T[],
  nextItems: T[]
): { upserts: T[]; deletes: string[] } {
  const prevMap = new Map<string, string>();
  for (const item of prevItems) {
    prevMap.set(item.id, JSON.stringify(stripUndefined(item)));
  }

  const nextIds = new Set<string>();
  const upserts: T[] = [];
  for (const item of nextItems) {
    nextIds.add(item.id);
    const serialized = JSON.stringify(stripUndefined(item));
    if (prevMap.get(item.id) !== serialized) {
      upserts.push(item);
    }
  }

  const deletes: string[] = [];
  for (const prevId of prevMap.keys()) {
    if (!nextIds.has(prevId)) {
      deletes.push(prevId);
    }
  }

  return { upserts, deletes };
}

export function hasWorkspaceRootChanged(prev: RentalAppState, next: RentalAppState): boolean {
  if (prev.referenceDate !== next.referenceDate) return true;
  if (
    JSON.stringify(stripUndefined(prev.property)) !==
    JSON.stringify(stripUndefined(next.property))
  ) {
    return true;
  }
  if (
    JSON.stringify(stripUndefined(prev.settings)) !==
    JSON.stringify(stripUndefined(next.settings))
  ) {
    return true;
  }
  return false;
}

export function chunkItems<T>(items: T[], chunkSize = 400): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}
