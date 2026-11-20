import type {
  Agreement,
  AuditLogEntry,
  CommissionRecord,
  Payment,
  PaymentAllocation,
  PaymentMethod,
  ReceiptRequest,
  RentalAppState,
  RentalObligation,
} from '../types/rental';
import {
  calculateCommissionOnAllocations,
  checkDuplicateBankReference,
  computeObligation,
  diffDays,
  type ComputedObligation,
} from './rentalEngine';

export interface PaymentEditPayload {
  tenantId: string;
  agreementId: string;
  amount: number;
  dateReceived: string;
  timeReceived?: string;
  method: PaymentMethod;
  bankReference: string;
  rentYearCovered?: string;
  allocations: PaymentAllocation[];
  notes: string;
  editReason?: string;
}

export interface CreateCycleObligationPayload {
  agreementId: string;
  cycleYear: string; // e.g., "2026", "2027", "2025/2026"
  rentalPeriodLabel?: string;
  rentAmount: number;
  levyAmount?: number;
  dueDate: string; // YYYY-MM-DD
}

export interface ObligationReconciliationItem {
  computed: ComputedObligation;
  cycleYear: string;
  currentPaymentAllocated: number;
  allocatedByOthers: number;
  availableCapacity: number;
}

export function normalizeTimeReceived(raw?: string): {
  ok: true;
  value: string | undefined;
} | {
  ok: false;
  error: string;
} {
  const trimmed = raw?.trim() || '';
  if (!trimmed) return { ok: true, value: undefined };
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return { ok: false, error: 'Time received must be in 24-hour HH:MM or HH:MM:SS format.' };
  }
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = match[3] !== undefined ? Number(match[3]) : undefined;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || (ss !== undefined && (ss < 0 || ss > 59))) {
    return { ok: false, error: 'Time received contains an invalid hour, minute, or second.' };
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    ok: true,
    value: ss !== undefined ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(hh)}:${pad(mm)}`,
  };
}

export function extractObligationCycleLabel(label: string, dueDate: string): string {
  const spanMatch = label.match(/\b(20\d{2}\s*\/\s*20\d{2})\b/);
  if (spanMatch) return spanMatch[1].replace(/\s+/g, '');
  const singleMatch = label.match(/\b(20\d{2})\b/);
  if (singleMatch) return singleMatch[1];
  return dueDate.slice(0, 4) || 'Unknown';
}

export function deriveRentYearLabel(
  allocations: PaymentAllocation[],
  obligations: RentalObligation[],
  fallbackDate?: string
): string {
  const positiveAllocs = allocations.filter((a) => a.amount > 0);
  if (positiveAllocs.length === 0) {
    return fallbackDate && /^\d{4}/.test(fallbackDate) ? fallbackDate.slice(0, 4) : 'Unapplied';
  }

  const allocatedObs = positiveAllocs
    .map((a) => obligations.find((o) => o.id === a.obligationId))
    .filter((o): o is RentalObligation => Boolean(o));

  const prioritized = allocatedObs.some((o) => o.chargeType === 'Rent')
    ? allocatedObs.filter((o) => o.chargeType === 'Rent')
    : allocatedObs;

  const years = Array.from(
    new Set(prioritized.map((o) => extractObligationCycleLabel(o.rentalPeriodLabel, o.dueDate)))
  ).sort();

  if (years.length > 0) return years.join(', ');
  return fallbackDate && /^\d{4}/.test(fallbackDate) ? fallbackDate.slice(0, 4) : 'Unapplied';
}

export function getEffectivePaymentRentYear(
  payment: Payment,
  obligations: RentalObligation[]
): string {
  const explicit = payment.rentYearCovered?.trim();
  if (explicit) return explicit;
  return deriveRentYearLabel(payment.allocations, obligations, payment.dateReceived);
}

export function getObligationReconciliationPool(
  tenantId: string,
  obligations: RentalObligation[],
  payments: Payment[],
  referenceDate: string,
  gracePeriodDays: number,
  editingPaymentId?: string
): ObligationReconciliationItem[] {
  const tenantObs = obligations
    .filter((o) => o.tenantId === tenantId)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const editingPayment = editingPaymentId
    ? payments.find((p) => p.id === editingPaymentId)
    : undefined;

  const otherPayments = editingPaymentId
    ? payments.filter((p) => p.id !== editingPaymentId)
    : payments;

  return tenantObs.map((ob) => {
    const computed = computeObligation(ob, payments, referenceDate, gracePeriodDays);
    const currentPaymentAllocated = editingPayment
      ? editingPayment.allocations
          .filter((a) => a.obligationId === ob.id)
          .reduce((s, a) => s + a.amount, 0)
      : 0;
    const allocatedByOthers = otherPayments
      .filter((p) => p.status === 'Confirmed')
      .reduce(
        (s, p) =>
          s +
          p.allocations
            .filter((a) => a.obligationId === ob.id)
            .reduce((sum, a) => sum + a.amount, 0),
        0
      );
    const availableCapacity = Math.max(
      0,
      Math.round((ob.originalAmount - allocatedByOthers) * 100) / 100
    );

    return {
      computed,
      cycleYear: extractObligationCycleLabel(ob.rentalPeriodLabel, ob.dueDate),
      currentPaymentAllocated,
      allocatedByOthers,
      availableCapacity,
    };
  });
}

export function syncTouchedObligationsSettlement(
  obligations: RentalObligation[],
  touchedIds: Set<string>,
  payments: Payment[],
  referenceDate: string,
  gracePeriodDays: number
): RentalObligation[] {
  if (touchedIds.size === 0) return obligations;

  return obligations.map((ob) => {
    if (!touchedIds.has(ob.id)) return ob;

    const computed = computeObligation(ob, payments, referenceDate, gracePeriodDays);
    if (computed.settlementPosition === 'Paid / Settled') {
      const contributingDates = payments
        .filter(
          (p) =>
            p.status === 'Confirmed' &&
            p.allocations.some((a) => a.obligationId === ob.id && a.amount > 0)
        )
        .map((p) => p.dateReceived)
        .sort();
      const latestDate = contributingDates[contributingDates.length - 1] || ob.settledAt;
      const settledLateDays = latestDate
        ? Math.max(0, diffDays(ob.dueDate, latestDate))
        : ob.settledLateDays;
      return {
        ...ob,
        settledAt: latestDate,
        settledLateDays,
      };
    }

    // No longer fully settled after edit
    if (ob.settledAt !== undefined || ob.settledLateDays !== undefined) {
      const next = { ...ob };
      delete next.settledAt;
      delete next.settledLateDays;
      return next;
    }
    return ob;
  });
}

export function applyPaymentEdit(
  state: RentalAppState,
  paymentId: string,
  payload: PaymentEditPayload,
  idGen: (prefix: string) => string,
  nowIso: string = new Date().toISOString()
): { ok: true; nextState: RentalAppState; duplicateWarning: boolean } | { ok: false; error: string } {
  const existing = state.payments.find((p) => p.id === paymentId);
  if (!existing) {
    return { ok: false, error: 'Payment record not found.' };
  }
  if (existing.status === 'Reversed') {
    return {
      ok: false,
      error: 'Reversed payments are locked in the ledger and cannot be edited.',
    };
  }

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return { ok: false, error: 'Payment amount must be greater than ₦0.' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dateReceived.trim())) {
    return { ok: false, error: 'Valid payment date received (YYYY-MM-DD) is required.' };
  }

  const timeCheck = normalizeTimeReceived(payload.timeReceived);
  if (!timeCheck.ok) {
    return { ok: false, error: timeCheck.error };
  }

  const agreement = state.agreements.find((a) => a.id === payload.agreementId);
  const tenant = state.tenants.find((t) => t.id === payload.tenantId);
  if (!agreement || !tenant || agreement.tenantId !== tenant.id) {
    return { ok: false, error: 'Select a valid tenant and matching tenancy agreement.' };
  }

  const cleanAllocations: PaymentAllocation[] = payload.allocations
    .filter((a) => Number.isFinite(a.amount) && a.amount > 0)
    .map((a) => ({
      obligationId: a.obligationId,
      amount: Math.round(a.amount * 100) / 100,
    }));

  const allocatedTotal = cleanAllocations.reduce((s, a) => s + a.amount, 0);
  if (allocatedTotal > payload.amount + 0.01) {
    return { ok: false, error: 'Allocated total cannot exceed payment amount.' };
  }

  // Ensure each allocated obligation belongs to the selected tenant and doesn't exceed remaining capacity
  const otherConfirmedPayments = state.payments.filter(
    (p) => p.id !== paymentId && p.status === 'Confirmed'
  );
  for (const alloc of cleanAllocations) {
    const ob = state.obligations.find((o) => o.id === alloc.obligationId);
    if (!ob || ob.tenantId !== tenant.id) {
      return {
        ok: false,
        error: 'One or more allocated obligations do not belong to the selected tenant.',
      };
    }
    const allocatedByOthers = otherConfirmedPayments.reduce(
      (s, p) =>
        s +
        p.allocations
          .filter((a) => a.obligationId === ob.id)
          .reduce((sum, a) => sum + a.amount, 0),
      0
    );
    const maxAllowed = Math.max(0, Math.round((ob.originalAmount - allocatedByOthers) * 100) / 100);
    if (alloc.amount > maxAllowed + 0.01) {
      return {
        ok: false,
        error: `Allocation to "${ob.rentalPeriodLabel}" exceeds its available balance (₦${maxAllowed.toLocaleString()}).`,
      };
    }
  }

  const normalizedBankRef = payload.bankReference.trim();
  const isDuplicate = checkDuplicateBankReference(normalizedBankRef, state.payments, paymentId);
  const unappliedAmount = Math.max(0, Math.round((payload.amount - allocatedTotal) * 100) / 100);
  const resolvedRentYear =
    payload.rentYearCovered?.trim() ||
    deriveRentYearLabel(cleanAllocations, state.obligations, payload.dateReceived);

  const updatedPayment: Payment = {
    ...existing,
    tenantId: tenant.id,
    agreementId: agreement.id,
    unitId: agreement.unitId,
    amount: Math.round(payload.amount * 100) / 100,
    dateReceived: payload.dateReceived.trim(),
    dateRecorded: existing.dateRecorded,
    method: payload.method,
    bankReference: normalizedBankRef,
    allocations: cleanAllocations,
    unappliedAmount,
    rentYearCovered: resolvedRentYear,
    notes: payload.notes.trim(),
    duplicateFlag: isDuplicate,
    lastEditedAt: nowIso,
  };
  if (timeCheck.value) {
    updatedPayment.timeReceived = timeCheck.value;
  } else {
    delete updatedPayment.timeReceived;
  }

  const nextPayments = state.payments.map((p) => (p.id === paymentId ? updatedPayment : p));

  const touchedObligationIds = new Set<string>([
    ...existing.allocations.map((a) => a.obligationId),
    ...cleanAllocations.map((a) => a.obligationId),
  ]);
  const nextObligations = syncTouchedObligationsSettlement(
    state.obligations,
    touchedObligationIds,
    nextPayments,
    state.referenceDate,
    state.settings.gracePeriodDays
  );

  // Append-only commission delta if eligible Rent allocation changed
  const existingNetRent = state.commissions
    .filter((c) => c.paymentId === paymentId)
    .reduce((s, c) => s + c.eligibleRentCollected, 0);
  const existingNetComm = state.commissions
    .filter((c) => c.paymentId === paymentId)
    .reduce((s, c) => s + c.accruedAmount, 0);

  const { eligibleRent: newEligibleRent, commissionAmount: newCommAmount } =
    calculateCommissionOnAllocations(
      cleanAllocations,
      nextObligations,
      state.settings.lawyerCommissionRatePercent
    );

  const deltaRent = Math.round((newEligibleRent - existingNetRent) * 100) / 100;
  const deltaComm = Math.round((newCommAmount - existingNetComm) * 100) / 100;
  const commissionAdjustments: CommissionRecord[] = [];
  if (Math.abs(deltaComm) >= 0.01 || Math.abs(deltaRent) >= 0.01) {
    commissionAdjustments.push({
      id: idGen('comm'),
      paymentId,
      agreementId: agreement.id,
      tenantId: tenant.id,
      ratePercent: state.settings.lawyerCommissionRatePercent,
      eligibleRentCollected: deltaRent,
      accruedAmount: deltaComm,
      createdAt: nowIso,
      isReversalAdjustment: deltaComm < 0,
      note: `Reconciliation adjustment for ${existing.systemRef}${
        payload.editReason?.trim() ? ` (${payload.editReason.trim()})` : ''
      }`,
    });
  }

  // Sync open linked ReceiptRequest (never mutate Issued or Cancelled receipts)
  const allocatedObs = nextObligations.filter((o) =>
    cleanAllocations.some((a) => a.obligationId === o.id)
  );
  const periodCovered =
    allocatedObs.map((o) => o.rentalPeriodLabel).join(', ') ||
    (resolvedRentYear ? `${resolvedRentYear} Unapplied Credit` : 'Unapplied Credit');
  const securityLevyIncluded = cleanAllocations.reduce((sum, a) => {
    const ob = nextObligations.find((o) => o.id === a.obligationId);
    return ob?.chargeType === 'Security Levy' ? sum + a.amount : sum;
  }, 0);
  const remainingForAgreement = nextObligations
    .filter((o) => o.agreementId === agreement.id)
    .reduce(
      (sum, o) =>
        sum +
        computeObligation(o, nextPayments, state.referenceDate, state.settings.gracePeriodDays)
          .amountOutstanding,
      0
    );

  const nextReceiptRequests: ReceiptRequest[] = state.receiptRequests.map((r) => {
    if (r.paymentId !== paymentId) return r;
    if (r.status === 'Issued' || r.status === 'Cancelled') return r;
    return {
      ...r,
      tenantId: tenant.id,
      unitId: agreement.unitId,
      amount: updatedPayment.amount,
      datePaid: updatedPayment.dateReceived,
      rentalPeriodCovered: periodCovered.slice(0, 160),
      securityLevyIncluded,
      remainingBalanceAtPayment: remainingForAgreement,
    };
  });

  const oldPrevYear = getEffectivePaymentRentYear(existing, state.obligations);
  const oldTimePart = existing.timeReceived ? ` ${existing.timeReceived}` : '';
  const newTimePart = updatedPayment.timeReceived ? ` ${updatedPayment.timeReceived}` : '';
  const unit = state.units.find((u) => u.id === agreement.unitId);

  const auditEntry: AuditLogEntry = {
    id: idGen('aud'),
    timestamp: nowIso,
    actor: state.property.managerName,
    entityType: 'Payment',
    entityId: paymentId,
    action: 'Payment Reconciled / Edited',
    summary: `Updated ${existing.systemRef} for ${tenant.firstName} ${tenant.lastName} (${unit?.code || agreement.unitId}): ₦${updatedPayment.amount.toLocaleString()} on ${updatedPayment.dateReceived}${newTimePart} (${resolvedRentYear}).`,
    previousValue: `₦${existing.amount.toLocaleString()} · ${existing.dateReceived}${oldTimePart} · ${existing.method} · ${existing.bankReference || 'No ref'} · Cycle ${oldPrevYear}`,
    newValue: `₦${updatedPayment.amount.toLocaleString()} · ${updatedPayment.dateReceived}${newTimePart} · ${updatedPayment.method} · ${updatedPayment.bankReference || 'No ref'} · Cycle ${resolvedRentYear}`,
    reason: payload.editReason?.trim() || 'Bank statement reconciliation update',
  };

  return {
    ok: true,
    duplicateWarning: isDuplicate,
    nextState: {
      ...state,
      payments: nextPayments,
      obligations: nextObligations,
      receiptRequests: nextReceiptRequests,
      commissions: [...commissionAdjustments, ...state.commissions],
      auditLogs: [auditEntry, ...state.auditLogs],
    },
  };
}

export function applyCreateCycleObligation(
  state: RentalAppState,
  payload: CreateCycleObligationPayload,
  idGen: (prefix: string) => string,
  nowIso: string = new Date().toISOString()
):
  | {
      ok: true;
      nextState: RentalAppState;
      createdObligationIds: string[];
      rentObligationId?: string;
    }
  | { ok: false; error: string } {
  const agreement = state.agreements.find((a) => a.id === payload.agreementId);
  if (!agreement) {
    return { ok: false, error: 'Tenancy agreement not found.' };
  }
  const tenant = state.tenants.find((t) => t.id === agreement.tenantId);
  const unit = state.units.find((u) => u.id === agreement.unitId);

  const cycleYear = payload.cycleYear.trim();
  if (!cycleYear) {
    return { ok: false, error: 'Rent year / cycle is required (e.g. 2026 or 2027).' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate.trim())) {
    return { ok: false, error: 'Valid due date (YYYY-MM-DD) is required.' };
  }

  const rentAmount = Math.max(0, Math.round((Number(payload.rentAmount) || 0) * 100) / 100);
  const levyAmount = Math.max(0, Math.round((Number(payload.levyAmount) || 0) * 100) / 100);
  if (rentAmount <= 0 && levyAmount <= 0) {
    return { ok: false, error: 'Enter a Rent amount or Security Levy amount greater than ₦0.' };
  }

  const rentLabel = payload.rentalPeriodLabel?.trim() || `${cycleYear} Annual Rent`;
  const levyLabel = `${cycleYear} Security Levy`;

  const duplicateRent =
    rentAmount > 0 &&
    state.obligations.some(
      (o) =>
        o.agreementId === agreement.id &&
        o.chargeType === 'Rent' &&
        o.rentalPeriodLabel.trim().toLowerCase() === rentLabel.toLowerCase()
    );
  if (duplicateRent) {
    return {
      ok: false,
      error: `"${rentLabel}" already exists for this tenancy. Allocate directly to the existing obligation.`,
    };
  }

  const duplicateLevy =
    levyAmount > 0 &&
    state.obligations.some(
      (o) =>
        o.agreementId === agreement.id &&
        o.chargeType === 'Security Levy' &&
        o.rentalPeriodLabel.trim().toLowerCase() === levyLabel.toLowerCase()
    );
  if (duplicateLevy && rentAmount <= 0) {
    return {
      ok: false,
      error: `"${levyLabel}" already exists for this tenancy.`,
    };
  }

  const created: RentalObligation[] = [];
  let rentObligationId: string | undefined;

  if (rentAmount > 0) {
    rentObligationId = idGen('ob');
    created.push({
      id: rentObligationId,
      agreementId: agreement.id,
      tenantId: agreement.tenantId,
      unitId: agreement.unitId,
      chargeType: 'Rent',
      rentalPeriodLabel: rentLabel,
      originalAmount: rentAmount,
      dueDate: payload.dueDate.trim(),
      underReview: false,
      createdAt: nowIso,
    });
  }

  if (levyAmount > 0 && !duplicateLevy) {
    created.push({
      id: idGen('ob'),
      agreementId: agreement.id,
      tenantId: agreement.tenantId,
      unitId: agreement.unitId,
      chargeType: 'Security Levy',
      rentalPeriodLabel: levyLabel,
      originalAmount: levyAmount,
      dueDate: payload.dueDate.trim(),
      underReview: false,
      createdAt: nowIso,
    });
  }

  const auditEntry: AuditLogEntry = {
    id: idGen('aud'),
    timestamp: nowIso,
    actor: state.property.managerName,
    entityType: 'Agreement',
    entityId: agreement.id,
    action: 'Cycle Obligation Added',
    summary: `Added ${created.map((c) => `${c.rentalPeriodLabel} (₦${c.originalAmount.toLocaleString()})`).join(' + ')} for ${tenant ? `${tenant.firstName} ${tenant.lastName}` : agreement.tenantId} (${unit?.code || agreement.unitId}).`,
    newValue: `${cycleYear} · Due ${payload.dueDate.trim()}`,
  };

  return {
    ok: true,
    createdObligationIds: created.map((c) => c.id),
    rentObligationId,
    nextState: {
      ...state,
      obligations: [...state.obligations, ...created],
      auditLogs: [auditEntry, ...state.auditLogs],
    },
  };
}
