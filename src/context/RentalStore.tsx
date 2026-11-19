import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SEED_STATE } from '../data/seedData';
import type {
  AgeingBucket,
  Agreement,
  AuditLogEntry,
  BehaviourIndicator,
  CommissionPayout,
  CommissionRecord,
  MaintenanceRecord,
  NotificationRecord,
  Payment,
  PaymentAllocation,
  PaymentCommitment,
  PaymentMethod,
  PropertyExpense,
  PropertyProfile,
  ReceiptRequest,
  RentalAppState,
  RentalObligation,
  RentCycle,
  SmsTemplate,
  StakeholderContact,
  StakeholderRole,
  SystemSettings,
  Tenant,
  Unit,
  UnitOccupancyStatus,
  UnitType,
} from '../types/rental';
import { sendEmailViaSmtp, sendSmsViaGateway } from '../utils/emailClient';
import { isScheduleDue, isWithinQuietHours } from '../utils/messaging';
import { getSmsRecordCostNaira, getSmsRecordUnits } from '../utils/smsAnalytics';
import {
  calculateCommissionOnAllocations,
  checkDuplicateBankReference,
  computeEffectiveReceiptStatus,
  computeObligation,
  computeTenantBehaviour,
  diffDays,
  evaluateCommitmentStatus,
  hasOverlappingActiveAgreement,
  type ComputedObligation,
  type ParsedPaymentImportRow,
  type ParsedTenancyRow,
} from '../utils/rentalEngine';
import { hydrateRentalState } from '../utils/stateHydration';
import { useIntegrations } from './IntegrationContext';

const STORAGE_KEY = 'propledger_rms_state_v2';

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function makeAudit(
  actor: string,
  entityType: AuditLogEntry['entityType'],
  entityId: string,
  action: string,
  summary: string,
  opts?: { previousValue?: string; newValue?: string; reason?: string }
): AuditLogEntry {
  return {
    id: uid('aud'),
    timestamp: new Date().toISOString(),
    actor,
    entityType,
    entityId,
    action,
    summary,
    ...opts,
  };
}

export interface EvaluatedCommitment {
  commitment: PaymentCommitment;
  effectiveStatus: PaymentCommitment['status'];
  amountPaidTowardsObligations: number;
}

export interface SummaryMetrics {
  expectedRent: number;
  rentCollected: number;
  outstandingRent: number;
  totalChargesExpected: number;
  totalChargesCollected: number;
  totalOutstanding: number;
  overdueTenantCount: number;
  pendingReceiptCount: number;
  overdueReceiptCount: number;
  openCommitmentCount: number;
  breachedCommitmentCount: number;
  commissionAccrued: number;
  commissionPaid: number;
  commissionOutstanding: number;
  totalExpenses: number;
}

export interface AgeingBucketSummary {
  bucket: AgeingBucket;
  count: number;
  amount: number;
}

export interface CustomRecipientDraft {
  name: string;
  email?: string;
  phone?: string;
  role: StakeholderRole | 'Tenant' | 'Custom';
  tenantId?: string;
  unitCode?: string;
}

export interface ComposerPrefill {
  directoryRecipientIds?: string[];
  customRecipients?: CustomRecipientDraft[];
  channelMode?: 'Email' | 'SMS' | 'Both';
  subject?: string;
  emailBody?: string;
  smsBody?: string;
  linkedTenantId?: string;
  scheduleMode?: 'now' | 'later';
  scheduledAtLocal?: string;
  intent?: string;
}

interface RentalContextValue {
  state: RentalAppState;
  computedObligations: ComputedObligation[];
  effectiveReceipts: ReceiptRequest[];
  evaluatedCommitments: EvaluatedCommitment[];
  tenantBehaviours: Record<string, BehaviourIndicator>;
  summaryMetrics: SummaryMetrics;
  ageingSummary: AgeingBucketSummary[];
  dueScheduledNotifications: NotificationRecord[];
  scheduledCount: number;
  // Navigation helper
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  selectedTenantIdForDrawer: string | null;
  setSelectedTenantIdForDrawer: (id: string | null) => void;
  openRecordPaymentModal: boolean;
  setOpenRecordPaymentModal: (open: boolean) => void;
  preselectedTenantForPayment: string | null;
  setPreselectedTenantForPayment: (tenantId: string | null) => void;
  // Composer modal helpers
  composerOpen: boolean;
  setComposerOpen: (open: boolean) => void;
  composerPrefill: ComposerPrefill | null;
  openComposerFor: (prefill?: ComposerPrefill) => void;
  // Calendar Sync modal helpers
  calendarSyncOpen: boolean;
  calendarSyncTenantId: string | null;
  openCalendarSyncFor: (tenantId?: string) => void;
  closeCalendarSync: () => void;
  logAuditEvent: (
    entityType: AuditLogEntry['entityType'],
    entityId: string,
    action: string,
    summary: string
  ) => void;
  // Actions
  createUnit: (input: {
    code: string;
    name: string;
    type: UnitType;
    floorOrWing: string;
    occupancyStatus: UnitOccupancyStatus;
    notes?: string;
  }) => { ok: boolean; error?: string };
  updateUnitStatus: (unitId: string, status: UnitOccupancyStatus, notes?: string) => void;
  createTenant: (input: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    notes?: string;
  }) => { ok: boolean; tenantId?: string; error?: string };
  updateTenant: (
    tenantId: string,
    patch: Partial<Pick<Tenant, 'firstName' | 'lastName' | 'phone' | 'email' | 'notes' | 'archived'>>
  ) => void;
  toggleTenantNotificationPause: (tenantId: string, paused: boolean, reason: string) => void;
  overrideTenantBehaviour: (
    tenantId: string,
    indicator: BehaviourIndicator | undefined,
    reason: string
  ) => void;
  createAgreement: (input: {
    tenantId: string;
    unitId: string;
    rentCycle: RentCycle;
    agreedRent: number;
    securityLevy: number;
    startDate: string;
    endDate: string;
    dueDate: string;
    rentalPeriodLabel: string;
    exceptionNote?: string;
  }) => { ok: boolean; error?: string };
  renewAgreement: (input: {
    previousAgreementId: string;
    agreedRent: number;
    securityLevy: number;
    rentCycle: RentCycle;
    startDate: string;
    endDate: string;
    dueDate: string;
    rentalPeriodLabel: string;
  }) => { ok: boolean; error?: string };
  toggleObligationReview: (obligationId: string, underReview: boolean, reason: string) => void;
  recordPayment: (input: {
    tenantId: string;
    agreementId: string;
    amount: number;
    dateReceived: string;
    method: PaymentMethod;
    bankReference: string;
    allocations: PaymentAllocation[];
    notes: string;
    simulateNotificationFailure?: boolean;
  }) => {
    ok: boolean;
    paymentId?: string;
    createdNotifications?: NotificationRecord[];
    error?: string;
    duplicateWarning?: boolean;
  };
  reversePayment: (paymentId: string, reason: string) => { ok: boolean; error?: string };
  acknowledgeReceipt: (receiptId: string, note: string) => void;
  issueReceipt: (
    receiptId: string,
    officialReceiptNumber: string,
    issuedDate: string,
    evidenceNote: string
  ) => void;
  cancelReceipt: (receiptId: string, reason: string) => void;
  retryNotification: (notificationId: string, forceSucceed?: boolean) => void;
  appendNotifications: (
    records: NotificationRecord[],
    auditAction?: string,
    auditSummary?: string
  ) => void;
  updateNotificationRecord: (
    notificationId: string,
    patch: Partial<NotificationRecord>,
    auditAction?: string,
    auditSummary?: string
  ) => void;
  cancelScheduledNotification: (notificationId: string, reason?: string) => void;
  rescheduleNotification: (
    notificationId: string,
    scheduledAtIso: string,
    overrideQuietHours?: boolean
  ) => void;
  runScheduledReminders: () => { createdCount: number; message: string };
  recordCommitment: (input: {
    tenantId: string;
    obligationIds: string[];
    promisedAmount: number;
    promisedDate: string;
    notes: string;
  }) => { ok: boolean; error?: string };
  extendCommitment: (commitmentId: string, newDate: string, reason: string) => void;
  cancelCommitment: (commitmentId: string, reason: string) => void;
  recordCommissionPayout: (input: {
    amount: number;
    payoutDate: string;
    reference: string;
    notes: string;
  }) => { ok: boolean; error?: string };
  recordExpense: (input: Omit<PropertyExpense, 'id' | 'createdAt'>) => void;
  recordMaintenance: (input: Omit<MaintenanceRecord, 'id'>) => void;
  updateMaintenanceStatus: (
    id: string,
    status: MaintenanceRecord['status'],
    resolutionDetails?: string,
    cost?: number
  ) => void;
  commitTenancyImport: (
    rows: ParsedTenancyRow[],
    filename: string
  ) => { unitsCreated: number; tenantsCreated: number; agreementsCreated: number };
  commitPaymentImport: (
    rows: ParsedPaymentImportRow[],
    filename: string,
    createBackfillReceipts: boolean
  ) => { paymentsImported: number; skippedUnmatched: number; totalAmount: number };
  updateSettings: (patch: Partial<SystemSettings>, reason?: string) => void;
  updatePropertyProfile: (patch: Partial<PropertyProfile>) => void;
  saveSmsTemplate: (
    input: Omit<SmsTemplate, 'id' | 'updatedAt'> & { id?: string }
  ) => { ok: boolean; id?: string; error?: string };
  deleteSmsTemplate: (templateId: string) => void;
  addContact: (contact: Omit<StakeholderContact, 'id'>) => void;
  updateContact: (id: string, patch: Partial<StakeholderContact>) => void;
  resetDemoData: () => void;
}

export type NavTab =
  | 'overview'
  | 'units-tenants'
  | 'payments'
  | 'arrears-promises'
  | 'receipts'
  | 'notifications'
  | 'sms-activity'
  | 'commissions'
  | 'expenses'
  | 'import'
  | 'settings';

const RentalContext = createContext<RentalContextValue | null>(null);

export function RentalProvider({ children }: { children: React.ReactNode }) {
  const { status: integrationStatus } = useIntegrations();

  const [state, setState] = useState<RentalAppState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return hydrateRentalState(JSON.parse(saved) as Partial<RentalAppState>);
      }
    } catch {
      // ignore storage errors
    }
    return SEED_STATE;
  });

  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [selectedTenantIdForDrawer, setSelectedTenantIdForDrawer] = useState<string | null>(null);
  const [openRecordPaymentModal, setOpenRecordPaymentModal] = useState(false);
  const [preselectedTenantForPayment, setPreselectedTenantForPayment] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPrefill, setComposerPrefill] = useState<ComposerPrefill | null>(null);
  const [calendarSyncOpen, setCalendarSyncOpen] = useState(false);
  const [calendarSyncTenantId, setCalendarSyncTenantId] = useState<string | null>(null);
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());
  const dispatchingIdsRef = useRef<Set<string>>(new Set());

  const openComposerFor = useCallback((prefill?: ComposerPrefill) => {
    setComposerPrefill(prefill ?? null);
    setComposerOpen(true);
  }, []);

  const openCalendarSyncFor = useCallback((tenantId?: string) => {
    setCalendarSyncTenantId(tenantId ?? null);
    setCalendarSyncOpen(true);
  }, []);

  const closeCalendarSync = useCallback(() => {
    setCalendarSyncOpen(false);
  }, []);

  const logAuditEvent = useCallback(
    (
      entityType: AuditLogEntry['entityType'],
      entityId: string,
      action: string,
      summary: string
    ) => {
      setState((prev) => ({
        ...prev,
        auditLogs: [
          makeAudit(prev.property.managerName, entityType, entityId, action, summary),
          ...prev.auditLogs,
        ],
      }));
    },
    []
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state]);

  // Periodic tick to evaluate scheduled Email/SMS queue
  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const nowIso = `${state.referenceDate}T12:58:00Z`;

  const computedObligations = useMemo(() => {
    return state.obligations.map((ob) =>
      computeObligation(ob, state.payments, state.referenceDate, state.settings.gracePeriodDays)
    );
  }, [state.obligations, state.payments, state.referenceDate, state.settings.gracePeriodDays]);

  const effectiveReceipts = useMemo(() => {
    return state.receiptRequests.map((req) => ({
      ...req,
      status: computeEffectiveReceiptStatus(req, nowIso),
    }));
  }, [state.receiptRequests, nowIso]);

  const evaluatedCommitments = useMemo<EvaluatedCommitment[]>(() => {
    return state.commitments.map((c) => {
      const res = evaluateCommitmentStatus(c, state.payments, state.referenceDate);
      return {
        commitment: c,
        effectiveStatus: res.status,
        amountPaidTowardsObligations: res.amountPaidTowardsObligations,
      };
    });
  }, [state.commitments, state.payments, state.referenceDate]);

  const tenantBehaviours = useMemo(() => {
    const map: Record<string, BehaviourIndicator> = {};
    for (const t of state.tenants) {
      map[t.id] = computeTenantBehaviour(t, computedObligations, state.settings);
    }
    return map;
  }, [state.tenants, computedObligations, state.settings]);

  const summaryMetrics = useMemo<SummaryMetrics>(() => {
    let expectedRent = 0;
    let rentCollected = 0;
    let outstandingRent = 0;
    let totalChargesExpected = 0;
    let totalChargesCollected = 0;
    let totalOutstanding = 0;
    const overdueTenants = new Set<string>();

    for (const co of computedObligations) {
      totalChargesExpected += co.obligation.originalAmount;
      totalChargesCollected += co.amountAllocated;
      totalOutstanding += co.amountOutstanding;
      if (co.obligation.chargeType === 'Rent') {
        expectedRent += co.obligation.originalAmount;
        rentCollected += co.amountAllocated;
        outstandingRent += co.amountOutstanding;
      }
      if (co.dueDatePosition === 'Overdue' && co.amountOutstanding > 0) {
        overdueTenants.add(co.obligation.tenantId);
      }
    }

    const pendingReceiptCount = effectiveReceipts.filter(
      (r) => r.status !== 'Issued' && r.status !== 'Cancelled'
    ).length;
    const overdueReceiptCount = effectiveReceipts.filter((r) => r.status === 'Overdue').length;

    const openCommitmentCount = evaluatedCommitments.filter(
      (c) => c.effectiveStatus === 'Open' || c.effectiveStatus === 'Partially Fulfilled'
    ).length;
    const breachedCommitmentCount = evaluatedCommitments.filter(
      (c) => c.effectiveStatus === 'Breached'
    ).length;

    const commissionAccrued = state.commissions.reduce((acc, c) => acc + c.accruedAmount, 0);
    const commissionPaid = state.commissionPayouts.reduce((acc, p) => acc + p.amount, 0);
    const commissionOutstanding = Math.max(0, commissionAccrued - commissionPaid);
    const totalExpenses = state.expenses.reduce((acc, e) => acc + e.amount, 0);

    return {
      expectedRent,
      rentCollected,
      outstandingRent,
      totalChargesExpected,
      totalChargesCollected,
      totalOutstanding,
      overdueTenantCount: overdueTenants.size,
      pendingReceiptCount,
      overdueReceiptCount,
      openCommitmentCount,
      breachedCommitmentCount,
      commissionAccrued,
      commissionPaid,
      commissionOutstanding,
      totalExpenses,
    };
  }, [computedObligations, effectiveReceipts, evaluatedCommitments, state.commissions, state.commissionPayouts, state.expenses]);

  const ageingSummary = useMemo<AgeingBucketSummary[]>(() => {
    const order: AgeingBucket[] = [
      'Not Yet Due',
      '1–7 days',
      '8–30 days',
      '31–60 days',
      '61–90 days',
      '> 90 days',
    ];
    const buckets: Record<AgeingBucket, { count: number; amount: number }> = {
      'Not Yet Due': { count: 0, amount: 0 },
      '1–7 days': { count: 0, amount: 0 },
      '8–30 days': { count: 0, amount: 0 },
      '31–60 days': { count: 0, amount: 0 },
      '61–90 days': { count: 0, amount: 0 },
      '> 90 days': { count: 0, amount: 0 },
    };

    for (const co of computedObligations) {
      if (co.amountOutstanding <= 0) continue;
      buckets[co.ageingBucket].count += 1;
      buckets[co.ageingBucket].amount += co.amountOutstanding;
    }

    return order.map((bucket) => ({
      bucket,
      count: buckets[bucket].count,
      amount: buckets[bucket].amount,
    }));
  }, [computedObligations]);

  const createUnit: RentalContextValue['createUnit'] = (input) => {
    const codeTrimmed = input.code.trim();
    if (!codeTrimmed || !input.name.trim()) {
      return { ok: false, error: 'Unit code and name are required.' };
    }
    if (state.units.some((u) => u.code.toLowerCase() === codeTrimmed.toLowerCase())) {
      return { ok: false, error: `Unit code "${codeTrimmed}" already exists.` };
    }
    const newUnit: Unit = {
      id: uid('u'),
      code: codeTrimmed,
      name: input.name.trim(),
      type: input.type,
      floorOrWing: input.floorOrWing.trim() || 'Ground Floor',
      occupancyStatus: input.occupancyStatus,
      notes: input.notes?.trim(),
    };
    setState((prev) => ({
      ...prev,
      units: [...prev.units, newUnit],
      auditLogs: [
        makeAudit(
          prev.property.managerName,
          'Unit',
          newUnit.id,
          'Unit Created',
          `Created unit ${newUnit.code} (${newUnit.name} · ${newUnit.type}).`,
          { newValue: `${newUnit.code} · ${newUnit.occupancyStatus}` }
        ),
        ...prev.auditLogs,
      ],
    }));
    return { ok: true };
  };

  const updateUnitStatus: RentalContextValue['updateUnitStatus'] = (unitId, status, notes) => {
    setState((prev) => {
      const target = prev.units.find((u) => u.id === unitId);
      if (!target) return prev;
      return {
        ...prev,
        units: prev.units.map((u) =>
          u.id === unitId ? { ...u, occupancyStatus: status, notes: notes ?? u.notes } : u
        ),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Unit',
            unitId,
            'Unit Status Updated',
            `Updated ${target.code} occupancy to ${status}.`,
            { previousValue: target.occupancyStatus, newValue: status }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const createTenant: RentalContextValue['createTenant'] = (input) => {
    if (!input.firstName.trim() || !input.lastName.trim()) {
      return { ok: false, error: 'First and last name are required.' };
    }
    if (!input.phone.trim() && !input.email.trim()) {
      return { ok: false, error: 'Provide at least a phone number or email address.' };
    }
    const newTenant: Tenant = {
      id: uid('t'),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      archived: false,
      notificationsPaused: false,
      historicalLateCycles: 0,
      createdAt: new Date().toISOString(),
      notes: input.notes?.trim(),
    };
    setState((prev) => ({
      ...prev,
      tenants: [...prev.tenants, newTenant],
      auditLogs: [
        makeAudit(
          prev.property.managerName,
          'Tenant',
          newTenant.id,
          'Tenant Created',
          `Created tenant record for ${newTenant.firstName} ${newTenant.lastName}.`,
          { newValue: `${newTenant.phone} · ${newTenant.email}` }
        ),
        ...prev.auditLogs,
      ],
    }));
    return { ok: true, tenantId: newTenant.id };
  };

  const updateTenant: RentalContextValue['updateTenant'] = (tenantId, patch) => {
    setState((prev) => {
      const target = prev.tenants.find((t) => t.id === tenantId);
      if (!target) return prev;
      return {
        ...prev,
        tenants: prev.tenants.map((t) => (t.id === tenantId ? { ...t, ...patch } : t)),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Tenant',
            tenantId,
            patch.archived ? 'Tenant Archived' : 'Tenant Updated',
            `Updated details for ${target.firstName} ${target.lastName}.`,
            { previousValue: `${target.phone}`, newValue: `${patch.phone ?? target.phone}` }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const toggleTenantNotificationPause: RentalContextValue['toggleTenantNotificationPause'] = (
    tenantId,
    paused,
    reason
  ) => {
    setState((prev) => {
      const target = prev.tenants.find((t) => t.id === tenantId);
      if (!target) return prev;
      return {
        ...prev,
        tenants: prev.tenants.map((t) =>
          t.id === tenantId ? { ...t, notificationsPaused: paused, pauseReason: reason } : t
        ),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Tenant',
            tenantId,
            paused ? 'Notifications Paused' : 'Notifications Resumed',
            `${paused ? 'Paused' : 'Resumed'} external reminders for ${target.firstName} ${target.lastName}.`,
            {
              previousValue: String(target.notificationsPaused),
              newValue: String(paused),
              reason,
            }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const overrideTenantBehaviour: RentalContextValue['overrideTenantBehaviour'] = (
    tenantId,
    indicator,
    reason
  ) => {
    setState((prev) => {
      const target = prev.tenants.find((t) => t.id === tenantId);
      if (!target) return prev;
      return {
        ...prev,
        tenants: prev.tenants.map((t) =>
          t.id === tenantId
            ? { ...t, behaviourOverride: indicator, behaviourOverrideReason: reason }
            : t
        ),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Tenant',
            tenantId,
            'Behaviour Indicator Overridden',
            `Updated payment behaviour indicator for ${target.firstName} ${target.lastName} to ${indicator ?? 'Auto-calculated'}.`,
            {
              previousValue: target.behaviourOverride ?? 'Auto',
              newValue: indicator ?? 'Auto',
              reason,
            }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const createAgreement: RentalContextValue['createAgreement'] = (input) => {
    if (input.agreedRent <= 0) {
      return { ok: false, error: 'Agreed rent must be greater than ₦0.' };
    }
    const overlap = hasOverlappingActiveAgreement(input.unitId, state.agreements);
    if (overlap && !input.exceptionNote?.trim()) {
      return {
        ok: false,
        error:
          'This unit already has an Active agreement. Provide an approved exception note or renew the existing agreement instead.',
      };
    }

    const agId = uid('ag');
    const newAgreement: Agreement = {
      id: agId,
      tenantId: input.tenantId,
      unitId: input.unitId,
      status: 'Active',
      rentCycle: input.rentCycle,
      agreedRent: input.agreedRent,
      securityLevy: input.securityLevy,
      startDate: input.startDate,
      endDate: input.endDate,
      dueDate: input.dueDate,
      exceptionNote: input.exceptionNote?.trim(),
      createdAt: new Date().toISOString(),
    };

    const rentObligation: RentalObligation = {
      id: uid('ob'),
      agreementId: agId,
      tenantId: input.tenantId,
      unitId: input.unitId,
      chargeType: 'Rent',
      rentalPeriodLabel: input.rentalPeriodLabel.trim() || `${input.startDate.slice(0, 4)} Rent`,
      originalAmount: input.agreedRent,
      dueDate: input.dueDate,
      underReview: false,
      createdAt: new Date().toISOString(),
    };

    const newObligations: RentalObligation[] = [rentObligation];
    if (input.securityLevy > 0) {
      newObligations.push({
        id: uid('ob'),
        agreementId: agId,
        tenantId: input.tenantId,
        unitId: input.unitId,
        chargeType: 'Security Levy',
        rentalPeriodLabel: `${input.rentalPeriodLabel.trim() || input.startDate.slice(0, 4)} Security Levy`,
        originalAmount: input.securityLevy,
        dueDate: input.dueDate,
        underReview: false,
        createdAt: new Date().toISOString(),
      });
    }

    setState((prev) => {
      const tenant = prev.tenants.find((t) => t.id === input.tenantId);
      const unit = prev.units.find((u) => u.id === input.unitId);
      return {
        ...prev,
        units: prev.units.map((u) =>
          u.id === input.unitId ? { ...u, occupancyStatus: 'Occupied' } : u
        ),
        agreements: [...prev.agreements, newAgreement],
        obligations: [...prev.obligations, ...newObligations],
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Agreement',
            agId,
            'Agreement Created',
            `Created active ${input.rentCycle} agreement for ${tenant?.firstName} ${tenant?.lastName} on ${unit?.code} (₦${input.agreedRent.toLocaleString()}).`,
            {
              newValue: `Rent ₦${input.agreedRent.toLocaleString()} · Due ${input.dueDate}`,
              reason: input.exceptionNote,
            }
          ),
          ...prev.auditLogs,
        ],
      };
    });
    return { ok: true };
  };

  const renewAgreement: RentalContextValue['renewAgreement'] = (input) => {
    const oldAg = state.agreements.find((a) => a.id === input.previousAgreementId);
    if (!oldAg) return { ok: false, error: 'Previous agreement not found.' };
    if (input.agreedRent <= 0) return { ok: false, error: 'Agreed rent must be positive.' };

    const newAgId = uid('ag');
    const newAgreement: Agreement = {
      id: newAgId,
      tenantId: oldAg.tenantId,
      unitId: oldAg.unitId,
      status: 'Active',
      rentCycle: input.rentCycle,
      agreedRent: input.agreedRent,
      securityLevy: input.securityLevy,
      startDate: input.startDate,
      endDate: input.endDate,
      dueDate: input.dueDate,
      previousAgreementId: oldAg.id,
      createdAt: new Date().toISOString(),
    };

    const newObligations: RentalObligation[] = [
      {
        id: uid('ob'),
        agreementId: newAgId,
        tenantId: oldAg.tenantId,
        unitId: oldAg.unitId,
        chargeType: 'Rent',
        rentalPeriodLabel: input.rentalPeriodLabel.trim() || `${input.startDate.slice(0, 4)} Renewal Rent`,
        originalAmount: input.agreedRent,
        dueDate: input.dueDate,
        underReview: false,
        createdAt: new Date().toISOString(),
      },
    ];
    if (input.securityLevy > 0) {
      newObligations.push({
        id: uid('ob'),
        agreementId: newAgId,
        tenantId: oldAg.tenantId,
        unitId: oldAg.unitId,
        chargeType: 'Security Levy',
        rentalPeriodLabel: `${input.rentalPeriodLabel.trim() || input.startDate.slice(0, 4)} Security Levy`,
        originalAmount: input.securityLevy,
        dueDate: input.dueDate,
        underReview: false,
        createdAt: new Date().toISOString(),
      });
    }

    setState((prev) => {
      const tenant = prev.tenants.find((t) => t.id === oldAg.tenantId);
      const unit = prev.units.find((u) => u.id === oldAg.unitId);
      return {
        ...prev,
        agreements: [
          ...prev.agreements.map((a) =>
            a.id === oldAg.id
              ? { ...a, status: 'Renewed / Superseded' as const, supersededById: newAgId }
              : a
          ),
          newAgreement,
        ],
        obligations: [...prev.obligations, ...newObligations],
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Agreement',
            newAgId,
            'Agreement Renewed',
            `Renewed tenancy for ${tenant?.firstName} ${tenant?.lastName} (${unit?.code}). Historical terms preserved on ${oldAg.id}.`,
            {
              previousValue: `₦${oldAg.agreedRent.toLocaleString()} (${oldAg.startDate} to ${oldAg.endDate})`,
              newValue: `₦${input.agreedRent.toLocaleString()} (${input.startDate} to ${input.endDate})`,
            }
          ),
          ...prev.auditLogs,
        ],
      };
    });
    return { ok: true };
  };

  const toggleObligationReview: RentalContextValue['toggleObligationReview'] = (
    obligationId,
    underReview,
    reason
  ) => {
    setState((prev) => {
      const ob = prev.obligations.find((o) => o.id === obligationId);
      if (!ob) return prev;
      return {
        ...prev,
        obligations: prev.obligations.map((o) =>
          o.id === obligationId ? { ...o, underReview, reviewReason: reason } : o
        ),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Obligation',
            obligationId,
            underReview ? 'Marked Under Review' : 'Cleared Review Hold',
            `${underReview ? 'Placed' : 'Removed'} review flag on ${ob.rentalPeriodLabel}.`,
            {
              previousValue: ob.underReview ? 'Under Review' : 'Active',
              newValue: underReview ? 'Under Review' : 'Active',
              reason,
            }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const recordPayment: RentalContextValue['recordPayment'] = (input) => {
    if (input.amount <= 0) {
      return { ok: false, error: 'Payment amount must be greater than ₦0.' };
    }
    const allocatedTotal = input.allocations.reduce((s, a) => s + a.amount, 0);
    if (allocatedTotal > input.amount + 0.01) {
      return { ok: false, error: 'Allocated total cannot exceed payment amount.' };
    }

    const agreement = state.agreements.find((a) => a.id === input.agreementId);
    const tenant = state.tenants.find((t) => t.id === input.tenantId);
    if (!agreement || !tenant) {
      return { ok: false, error: 'Select a valid tenant and tenancy agreement.' };
    }

    const isDuplicate = checkDuplicateBankReference(input.bankReference, state.payments);
    const payId = uid('pay');
    const sysRef = `PAY-2026-${String(state.payments.length + 45).padStart(4, '0')}`;
    const unappliedAmount = Math.max(0, Math.round((input.amount - allocatedTotal) * 100) / 100);

    const newPayment: Payment = {
      id: payId,
      systemRef: sysRef,
      tenantId: input.tenantId,
      agreementId: input.agreementId,
      unitId: agreement.unitId,
      amount: input.amount,
      dateReceived: input.dateReceived,
      dateRecorded: new Date().toISOString(),
      method: input.method,
      bankReference: input.bankReference.trim(),
      status: 'Confirmed',
      allocations: input.allocations.filter((a) => a.amount > 0),
      unappliedAmount,
      notes: input.notes.trim(),
      recordedBy: state.property.managerName,
      duplicateFlag: isDuplicate,
    };

    const primaryIssuer =
      state.contacts.find((c) => c.role === 'Receipt Issuer' && c.isPrimaryReceiptIssuer) ||
      state.contacts.find((c) => c.role === 'Receipt Issuer');

    const unit = state.units.find((u) => u.id === agreement.unitId);
    const allocatedObligations = state.obligations.filter((o) =>
      newPayment.allocations.some((a) => a.obligationId === o.id)
    );
    const periodCovered =
      allocatedObligations.map((o) => o.rentalPeriodLabel).join(', ') || 'Unapplied Credit';
    const securityLevyIncluded = newPayment.allocations.reduce((sum, a) => {
      const ob = state.obligations.find((o) => o.id === a.obligationId);
      return ob?.chargeType === 'Security Levy' ? sum + a.amount : sum;
    }, 0);

    const updatedPayments = [...state.payments, newPayment];
    const remainingForAgreement = state.obligations
      .filter((o) => o.agreementId === agreement.id)
      .reduce(
        (sum, o) =>
          sum +
          computeObligation(o, updatedPayments, state.referenceDate, state.settings.gracePeriodDays)
            .amountOutstanding,
        0
      );

    const slaDate = new Date(
      new Date().getTime() + state.settings.receiptSlaHours * 60 * 60 * 1000
    ).toISOString();

    const rcpId = uid('rcp-req');
    const newReceipt: ReceiptRequest = {
      id: rcpId,
      paymentId: payId,
      paymentRef: sysRef,
      tenantId: tenant.id,
      unitId: agreement.unitId,
      amount: input.amount,
      datePaid: input.dateReceived,
      rentalPeriodCovered: periodCovered,
      securityLevyIncluded,
      remainingBalanceAtPayment: remainingForAgreement,
      issuerContactId: primaryIssuer?.id || 'c-issuer-1',
      status: primaryIssuer && !state.settings.globalNotificationsPaused ? 'Notified' : 'Created',
      createdAt: new Date().toISOString(),
      slaDeadlineAt: slaDate,
    };

    // Notifications to Receipt Issuer (Email + SMS tracked independently)
    const newNotifications: NotificationRecord[] = [];
    const emailProviderLabel =
      state.settings.preferredEmailProvider === 'smtp'
        ? 'SMTP'
        : state.settings.preferredEmailProvider === 'gmail'
        ? 'Gmail'
        : 'Ledger Only';

    if (primaryIssuer && !state.settings.globalNotificationsPaused) {
      const evtId = uid('evt-rcp');
      if (primaryIssuer.emailEnabled && primaryIssuer.email) {
        newNotifications.push({
          id: uid('ntf'),
          eventId: evtId,
          eventType: 'Payment Recorded / Receipt Request',
          relatedRecordId: rcpId,
          tenantId: tenant.id,
          recipientName: primaryIssuer.name,
          recipientRole: 'Receipt Issuer',
          recipientContact: primaryIssuer.email,
          channel: 'Email',
          status: input.simulateNotificationFailure
            ? 'Failed'
            : state.settings.autoSendPaymentReceipts && emailProviderLabel !== 'Ledger Only'
            ? 'Queued'
            : 'Delivered',
          deliveryProvider: emailProviderLabel,
          subject: `Receipt Request: ${sysRef} — ${tenant.firstName} ${tenant.lastName} (${unit?.code})`,
          messageBody: `Dear ${primaryIssuer.name.split(' ')[0]},\n\nConfirmed payment ${sysRef} of ₦${input.amount.toLocaleString()} was received on ${input.dateReceived} from ${tenant.firstName} ${tenant.lastName} (${unit?.name} · ${unit?.type}) covering ${periodCovered}. Security levy included: ₦${securityLevyIncluded.toLocaleString()}. Remaining balance: ₦${remainingForAgreement.toLocaleString()}.\n\nPlease issue the official receipt within ${state.settings.receiptSlaHours} hours.\n\nRegards,\n${state.property.name}`,
          scheduledAt: new Date().toISOString(),
          attemptedAt: input.simulateNotificationFailure ? new Date().toISOString() : undefined,
          retryCount: 0,
          failureReason: input.simulateNotificationFailure
            ? 'Simulated SMTP relay timeout — payment saved safely'
            : undefined,
        });
      }
      if (primaryIssuer.smsEnabled && primaryIssuer.phone) {
        newNotifications.push({
          id: uid('ntf'),
          eventId: evtId,
          eventType: 'Payment Recorded / Receipt Request',
          relatedRecordId: rcpId,
          tenantId: tenant.id,
          recipientName: primaryIssuer.name,
          recipientRole: 'Receipt Issuer',
          recipientContact: primaryIssuer.phone,
          channel: 'SMS',
          status: input.simulateNotificationFailure ? 'Retry Pending' : 'Sent',
          deliveryProvider: 'Ledger Only',
          messageBody: `Receipt Request ${sysRef}: ${tenant.firstName} ${tenant.lastName} (${unit?.code}) paid ₦${input.amount.toLocaleString()} on ${input.dateReceived}. Bal: ₦${remainingForAgreement.toLocaleString()}. Please issue official receipt.`,
          scheduledAt: new Date().toISOString(),
          attemptedAt: new Date().toISOString(),
          retryCount: input.simulateNotificationFailure ? 1 : 0,
          failureReason: input.simulateNotificationFailure
            ? 'SMS carrier transient failure; queued for retry'
            : undefined,
        });
      }
    }

    if (
      state.settings.sendTenantPaymentConfirmation &&
      !state.settings.globalNotificationsPaused &&
      !tenant.notificationsPaused &&
      tenant.email
    ) {
      newNotifications.push({
        id: uid('ntf'),
        eventId: uid('evt-pay-conf'),
        eventType: 'Payment Recorded / Receipt Request',
        relatedRecordId: payId,
        tenantId: tenant.id,
        recipientName: `${tenant.firstName} ${tenant.lastName}`,
        recipientRole: 'Tenant',
        recipientContact: tenant.email,
        channel: 'Email',
        status: input.simulateNotificationFailure
          ? 'Failed'
          : state.settings.autoSendPaymentReceipts && emailProviderLabel !== 'Ledger Only'
          ? 'Queued'
          : 'Delivered',
        deliveryProvider: emailProviderLabel,
        subject: `Payment Confirmation (${sysRef}) — ${state.property.name}`,
        messageBody: `Dear ${tenant.firstName},\n\nThank you. We confirm receipt of your payment of ₦${input.amount.toLocaleString()} (${input.method}) on ${input.dateReceived} for ${unit?.name} (${periodCovered}).\n\nRemaining balance on this tenancy: ₦${remainingForAgreement.toLocaleString()}.\nYour official receipt request (${rcpId}) has been routed for issuance.\n\nWarm regards,\n${state.property.managerName}\n${state.property.name}`,
        scheduledAt: new Date().toISOString(),
        attemptedAt: input.simulateNotificationFailure ? new Date().toISOString() : undefined,
        retryCount: 0,
        failureReason: input.simulateNotificationFailure
          ? 'Simulated relay failure — payment confirmed in ledger'
          : undefined,
      });
    }

    // Commission accrual strictly on eligible Rent collected
    const { eligibleRent, commissionAmount } = calculateCommissionOnAllocations(
      newPayment.allocations,
      state.obligations,
      state.settings.lawyerCommissionRatePercent
    );
    const newCommissions: CommissionRecord[] = [];
    if (commissionAmount > 0) {
      newCommissions.push({
        id: uid('comm'),
        paymentId: payId,
        agreementId: agreement.id,
        tenantId: tenant.id,
        ratePercent: state.settings.lawyerCommissionRatePercent,
        eligibleRentCollected: eligibleRent,
        accruedAmount: commissionAmount,
        createdAt: new Date().toISOString(),
        note: `${state.settings.lawyerCommissionRatePercent}% on ₦${eligibleRent.toLocaleString()} eligible rent collected (${sysRef})`,
      });
    }

    setState((prev) => ({
      ...prev,
      payments: [newPayment, ...prev.payments],
      receiptRequests: [newReceipt, ...prev.receiptRequests],
      notifications: [...newNotifications, ...prev.notifications],
      commissions: [...newCommissions, ...prev.commissions],
      auditLogs: [
        makeAudit(
          prev.property.managerName,
          'Payment',
          payId,
          'Payment Recorded',
          `Recorded ${sysRef} (₦${input.amount.toLocaleString()}) for ${tenant.firstName} ${tenant.lastName} (${unit?.code}). Created receipt request ${rcpId}.`,
          {
            newValue: `₦${input.amount.toLocaleString()} · ${input.method}${input.bankReference ? ` · ${input.bankReference}` : ''}`,
          }
        ),
        ...prev.auditLogs,
      ],
    }));

    return {
      ok: true,
      paymentId: payId,
      createdNotifications: newNotifications,
      duplicateWarning: isDuplicate,
    };
  };

  const reversePayment: RentalContextValue['reversePayment'] = (paymentId, reason) => {
    if (!reason.trim()) {
      return { ok: false, error: 'A reversal reason is required for the audit log.' };
    }
    const target = state.payments.find((p) => p.id === paymentId);
    if (!target) return { ok: false, error: 'Payment not found.' };
    if (target.status === 'Reversed') return { ok: false, error: 'Payment is already reversed.' };

    const tenant = state.tenants.find((t) => t.id === target.tenantId);
    const relatedComm = state.commissions.find(
      (c) => c.paymentId === paymentId && !c.isReversalAdjustment
    );
    const relatedReceipt = state.receiptRequests.find((r) => r.paymentId === paymentId);
    const issuer = state.contacts.find((c) => c.id === relatedReceipt?.issuerContactId);

    const reversalCommission: CommissionRecord[] = relatedComm
      ? [
          {
            id: uid('comm'),
            paymentId,
            agreementId: target.agreementId,
            tenantId: target.tenantId,
            ratePercent: relatedComm.ratePercent,
            eligibleRentCollected: -relatedComm.eligibleRentCollected,
            accruedAmount: -relatedComm.accruedAmount,
            createdAt: new Date().toISOString(),
            isReversalAdjustment: true,
            note: `Reversal adjustment for ${target.systemRef}: ${reason}`,
          },
        ]
      : [];

    const correctionNotifs: NotificationRecord[] = [];
    if (relatedReceipt && issuer && !state.settings.globalNotificationsPaused) {
      correctionNotifs.push({
        id: uid('ntf'),
        eventId: uid('evt-corr'),
        eventType: 'Receipt Correction / Cancellation',
        relatedRecordId: relatedReceipt.id,
        recipientName: issuer.name,
        recipientRole: 'Receipt Issuer',
        recipientContact: issuer.email || issuer.phone,
        channel: issuer.email ? 'Email' : 'SMS',
        status: 'Sent',
        subject: `URGENT: Payment Reversed — Cancel/Correct Receipt for ${target.systemRef}`,
        messageBody: `Dear ${issuer.name.split(' ')[0]},\n\nPayment ${target.systemRef} (₦${target.amount.toLocaleString()}) for ${tenant?.firstName} ${tenant?.lastName} has been reversed. Reason: ${reason}. Please cancel or hold any receipt issuance.\n\nRegards,\n${state.property.name}`,
        scheduledAt: new Date().toISOString(),
        attemptedAt: new Date().toISOString(),
        retryCount: 0,
      });
    }

    setState((prev) => ({
      ...prev,
      payments: prev.payments.map((p) =>
        p.id === paymentId
          ? {
              ...p,
              status: 'Reversed',
              reversalReason: reason.trim(),
              reversedAt: new Date().toISOString(),
            }
          : p
      ),
      receiptRequests: prev.receiptRequests.map((r) =>
        r.paymentId === paymentId ? { ...r, status: 'Correction Required' } : r
      ),
      commissions: [...reversalCommission, ...prev.commissions],
      notifications: [...correctionNotifs, ...prev.notifications],
      auditLogs: [
        makeAudit(
          prev.property.managerName,
          'Payment',
          paymentId,
          'Payment Reversed',
          `Reversed ${target.systemRef} (₦${target.amount.toLocaleString()}). Obligation balances and lawyer commission recalculated.`,
          {
            previousValue: 'Confirmed',
            newValue: 'Reversed',
            reason: reason.trim(),
          }
        ),
        ...prev.auditLogs,
      ],
    }));

    return { ok: true };
  };

  const acknowledgeReceipt: RentalContextValue['acknowledgeReceipt'] = (receiptId, note) => {
    setState((prev) => {
      const req = prev.receiptRequests.find((r) => r.id === receiptId);
      if (!req) return prev;
      return {
        ...prev,
        receiptRequests: prev.receiptRequests.map((r) =>
          r.id === receiptId
            ? {
                ...r,
                status: 'Acknowledged',
                acknowledgedAt: new Date().toISOString(),
                acknowledgedNote: note.trim() || 'Acknowledged via phone/WhatsApp.',
              }
            : r
        ),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Receipt',
            receiptId,
            'Receipt Request Acknowledged',
            `Recorded issuer acknowledgement for ${req.paymentRef}.`,
            { previousValue: req.status, newValue: 'Acknowledged', reason: note }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const issueReceipt: RentalContextValue['issueReceipt'] = (
    receiptId,
    officialReceiptNumber,
    issuedDate,
    evidenceNote
  ) => {
    setState((prev) => {
      const req = prev.receiptRequests.find((r) => r.id === receiptId);
      if (!req) return prev;
      return {
        ...prev,
        receiptRequests: prev.receiptRequests.map((r) =>
          r.id === receiptId
            ? {
                ...r,
                status: 'Issued',
                officialReceiptNumber: officialReceiptNumber.trim(),
                issuedDate,
                evidenceNote: evidenceNote.trim(),
              }
            : r
        ),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Receipt',
            receiptId,
            'Official Receipt Issued',
            `Closed receipt request for ${req.paymentRef} with official receipt #${officialReceiptNumber.trim()}.`,
            {
              previousValue: req.status,
              newValue: `Issued · #${officialReceiptNumber.trim()} (${issuedDate})`,
            }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const cancelReceipt: RentalContextValue['cancelReceipt'] = (receiptId, reason) => {
    setState((prev) => {
      const req = prev.receiptRequests.find((r) => r.id === receiptId);
      if (!req) return prev;
      return {
        ...prev,
        receiptRequests: prev.receiptRequests.map((r) =>
          r.id === receiptId ? { ...r, status: 'Cancelled', cancellationReason: reason } : r
        ),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Receipt',
            receiptId,
            'Receipt Request Cancelled',
            `Cancelled receipt request for ${req.paymentRef}.`,
            { previousValue: req.status, newValue: 'Cancelled', reason }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const retryNotification: RentalContextValue['retryNotification'] = (
    notificationId,
    forceSucceed = true
  ) => {
    setState((prev) => {
      const n = prev.notifications.find((item) => item.id === notificationId);
      if (!n) return prev;
      const newStatus = forceSucceed ? 'Delivered' : 'Exhausted / Action Required';
      return {
        ...prev,
        notifications: prev.notifications.map((item) =>
          item.id === notificationId
            ? {
                ...item,
                status: newStatus,
                attemptedAt: new Date().toISOString(),
                retryCount: item.retryCount + 1,
                failureReason: forceSucceed ? undefined : 'Max retries reached; manual follow-up required.',
              }
            : item
        ),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Notification',
            notificationId,
            'Notification Retried',
            `Retried ${n.channel} notification to ${n.recipientName} (${n.eventType}) — Result: ${newStatus}.`,
            { previousValue: n.status, newValue: newStatus }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const appendNotifications: RentalContextValue['appendNotifications'] = useCallback(
    (records, auditAction = 'Custom Message Recorded', auditSummary) => {
      if (records.length === 0) return;
      setState((prev) => ({
        ...prev,
        notifications: [...records, ...prev.notifications],
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Notification',
            records[0].eventId,
            auditAction,
            auditSummary ||
              `Logged ${records.length} ${records[0].channel} message(s) (${records[0].eventType}).`
          ),
          ...prev.auditLogs,
        ],
      }));
    },
    []
  );

  const updateNotificationRecord: RentalContextValue['updateNotificationRecord'] = useCallback(
    (notificationId, patch, auditAction, auditSummary) => {
      setState((prev) => {
        const existing = prev.notifications.find((n) => n.id === notificationId);
        if (!existing) return prev;
        return {
          ...prev,
          notifications: prev.notifications.map((n) =>
            n.id === notificationId ? { ...n, ...patch } : n
          ),
          auditLogs: auditAction
            ? [
                makeAudit(
                  prev.property.managerName,
                  'Notification',
                  notificationId,
                  auditAction,
                  auditSummary ||
                    `Updated ${existing.channel} to ${existing.recipientName} (${patch.status || existing.status}).`,
                  {
                    previousValue: existing.status,
                    newValue: patch.status || existing.status,
                    reason: patch.failureReason,
                  }
                ),
                ...prev.auditLogs,
              ]
            : prev.auditLogs,
        };
      });
    },
    []
  );

  const cancelScheduledNotification: RentalContextValue['cancelScheduledNotification'] = useCallback(
    (notificationId, reason) => {
      setState((prev) => {
        const existing = prev.notifications.find((n) => n.id === notificationId);
        if (!existing) return prev;
        return {
          ...prev,
          notifications: prev.notifications.map((n) =>
            n.id === notificationId
              ? {
                  ...n,
                  status: 'Cancelled',
                  cancelledAt: new Date().toISOString(),
                  failureReason: reason || 'Cancelled before dispatch',
                }
              : n
          ),
          auditLogs: [
            makeAudit(
              prev.property.managerName,
              'Notification',
              notificationId,
              'Scheduled Message Cancelled',
              `Cancelled scheduled ${existing.channel} to ${existing.recipientName}.`,
              { previousValue: existing.status, newValue: 'Cancelled', reason }
            ),
            ...prev.auditLogs,
          ],
        };
      });
    },
    []
  );

  const rescheduleNotification: RentalContextValue['rescheduleNotification'] = useCallback(
    (notificationId, scheduledAtIso, overrideQuietHours) => {
      setState((prev) => {
        const existing = prev.notifications.find((n) => n.id === notificationId);
        if (!existing) return prev;
        return {
          ...prev,
          notifications: prev.notifications.map((n) =>
            n.id === notificationId
              ? {
                  ...n,
                  status: 'Queued',
                  scheduledAt: scheduledAtIso,
                  cancelledAt: undefined,
                  failureReason: undefined,
                  overrideQuietHours: overrideQuietHours ?? n.overrideQuietHours,
                }
              : n
          ),
          auditLogs: [
            makeAudit(
              prev.property.managerName,
              'Notification',
              notificationId,
              'Message Rescheduled',
              `Rescheduled ${existing.channel} to ${existing.recipientName} for ${scheduledAtIso}.`,
              { previousValue: existing.scheduledAt, newValue: scheduledAtIso }
            ),
            ...prev.auditLogs,
          ],
        };
      });
    },
    []
  );

  const dueScheduledNotifications = useMemo(() => {
    return state.notifications.filter(
      (n) => n.status === 'Queued' && !n.cancelledAt && isScheduleDue(n.scheduledAt, clockNowMs)
    );
  }, [state.notifications, clockNowMs]);

  const scheduledCount = useMemo(() => {
    return state.notifications.filter((n) => n.status === 'Queued' && !n.cancelledAt).length;
  }, [state.notifications]);

  // Automatic background queue dispatch for Server SMTP & SMS Webhook Gateway when enabled
  useEffect(() => {
    if (state.settings.globalNotificationsPaused) return;
    if (dueScheduledNotifications.length === 0) return;

    const inQuiet = isWithinQuietHours(
      new Date(clockNowMs).toISOString(),
      state.settings.quietHoursStart,
      state.settings.quietHoursEnd
    );

    for (const item of dueScheduledNotifications) {
      if (dispatchingIdsRef.current.has(item.id)) continue;
      if (inQuiet && !item.overrideQuietHours) continue;

      if (
        item.channel === 'Email' &&
        state.settings.preferredEmailProvider === 'smtp' &&
        integrationStatus?.smtpConfigured &&
        (item.isCustom
          ? state.settings.autoSendCustomScheduled
          : state.settings.autoSendScheduledReminders)
      ) {
        dispatchingIdsRef.current.add(item.id);
        void sendEmailViaSmtp({
          to: item.recipientContact,
          subject: item.subject || `Message from ${state.property.name}`,
          body: item.messageBody,
          replyTo: state.property.managerEmail,
        })
          .then((res) => {
            updateNotificationRecord(
              item.id,
              {
                status: 'Delivered',
                attemptedAt: new Date().toISOString(),
                deliveryProvider: 'SMTP',
                externalMessageId: res.messageId,
                failureReason: undefined,
              },
              'Scheduled Email Auto-Sent',
              `Automatically dispatched scheduled Email via SMTP to ${item.recipientName}.`
            );
          })
          .catch((err) => {
            updateNotificationRecord(
              item.id,
              {
                status: 'Failed',
                attemptedAt: new Date().toISOString(),
                deliveryProvider: 'SMTP',
                failureReason: err instanceof Error ? err.message : 'SMTP delivery failed',
              },
              'Scheduled Email Failed',
              `Scheduled SMTP delivery failed for ${item.recipientName}.`
            );
          })
          .finally(() => {
            dispatchingIdsRef.current.delete(item.id);
          });
      } else if (
        item.channel === 'SMS' &&
        integrationStatus?.smsWebhookConfigured &&
        (item.isCustom
          ? state.settings.autoSendCustomScheduled
          : state.settings.autoSendScheduledReminders)
      ) {
        dispatchingIdsRef.current.add(item.id);
        void sendSmsViaGateway({
          to: item.recipientContact,
          message: item.messageBody,
          reference: item.id,
        })
          .then((res) => {
            const parsedUnits = res.units !== undefined ? Number(res.units) : NaN;
            const effectiveUnits =
              Number.isFinite(parsedUnits) && parsedUnits > 0
                ? parsedUnits
                : getSmsRecordUnits({
                    status: 'Sent',
                    messageBody: item.messageBody,
                  }).billableUnits;
            const costNaira = getSmsRecordCostNaira(
              {
                status: 'Sent',
                messageBody: item.messageBody,
                smsUnits: effectiveUnits,
              },
              state.settings.smsUnitCostNaira
            );
            updateNotificationRecord(
              item.id,
              {
                status: 'Sent',
                attemptedAt: new Date().toISOString(),
                deliveryProvider: res.provider,
                externalMessageId: res.messageId,
                smsUnits: effectiveUnits,
                smsCostNaira: costNaira,
                failureReason: undefined,
              },
              'Scheduled SMS Auto-Sent',
              `Automatically dispatched scheduled SMS via ${res.provider} to ${item.recipientName}.`
            );
          })
          .catch((err) => {
            updateNotificationRecord(
              item.id,
              {
                status: 'Failed',
                attemptedAt: new Date().toISOString(),
                deliveryProvider: 'SMS Gateway',
                failureReason: err instanceof Error ? err.message : 'SMS gateway failed',
              },
              'Scheduled SMS Failed',
              `Scheduled SMS gateway delivery failed for ${item.recipientName}.`
            );
          })
          .finally(() => {
            dispatchingIdsRef.current.delete(item.id);
          });
      }
    }
  }, [
    clockNowMs,
    dueScheduledNotifications,
    integrationStatus?.smtpConfigured,
    integrationStatus?.smsWebhookConfigured,
    state.property.managerEmail,
    state.property.name,
    state.settings.autoSendCustomScheduled,
    state.settings.autoSendScheduledReminders,
    state.settings.globalNotificationsPaused,
    state.settings.preferredEmailProvider,
    state.settings.quietHoursEnd,
    state.settings.quietHoursStart,
    state.settings.smsUnitCostNaira,
    updateNotificationRecord,
  ]);

  const runScheduledReminders: RentalContextValue['runScheduledReminders'] = () => {
    if (state.settings.globalNotificationsPaused) {
      return {
        createdCount: 0,
        message: 'Global notifications are currently paused. No reminders were dispatched.',
      };
    }

    const newlyCreated: NotificationRecord[] = [];
    const existingKeys = new Set(
      state.notifications.map((n) => `${n.eventId}::${n.recipientContact}::${n.channel}`)
    );

    const isAutoSmtp =
      state.settings.preferredEmailProvider === 'smtp' &&
      Boolean(integrationStatus?.smtpConfigured) &&
      state.settings.autoSendScheduledReminders;
    const isGmailMode = state.settings.preferredEmailProvider === 'gmail';

    for (const co of computedObligations) {
      if (co.amountOutstanding <= 0 || co.obligation.underReview) continue;
      const tenant = state.tenants.find((t) => t.id === co.obligation.tenantId);
      const unit = state.units.find((u) => u.id === co.obligation.unitId);
      if (!tenant || tenant.archived || tenant.notificationsPaused) continue;

      const daysUntilDue = diffDays(state.referenceDate, co.obligation.dueDate);
      let eventType: NotificationRecord['eventType'] | null = null;
      let eventKey = '';

      if (daysUntilDue > 0 && state.settings.preDueOffsetsDays.includes(daysUntilDue)) {
        eventType = 'Pre-Due Reminder';
        eventKey = `pre-${co.obligation.id}-${daysUntilDue}`;
      } else if (daysUntilDue === 0) {
        eventType = 'Due-Date Reminder';
        eventKey = `due-${co.obligation.id}`;
      } else if (co.dueDatePosition === 'Overdue') {
        eventType = 'Overdue Reminder';
        eventKey = `overdue-${co.obligation.id}-${state.referenceDate}`;
      }

      if (eventType) {
        const partialNote =
          co.settlementPosition === 'Partially Paid'
            ? ` (Remaining balance after partial payment: ₦${co.amountOutstanding.toLocaleString()})`
            : '';
        if (tenant.email) {
          const k = `${eventKey}::${tenant.email}::Email`;
          if (!existingKeys.has(k)) {
            existingKeys.add(k);
            newlyCreated.push({
              id: uid('ntf'),
              eventId: eventKey,
              eventType,
              relatedRecordId: co.obligation.id,
              tenantId: tenant.id,
              recipientName: `${tenant.firstName} ${tenant.lastName}`,
              recipientRole: 'Tenant',
              recipientContact: tenant.email,
              channel: 'Email',
              status: isAutoSmtp || isGmailMode ? 'Queued' : 'Delivered',
              deliveryProvider: isAutoSmtp
                ? 'SMTP'
                : isGmailMode
                ? 'Gmail'
                : 'Ledger Only',
              subject: `${eventType}: ${unit?.name} — ${co.obligation.rentalPeriodLabel}`,
              messageBody: `Dear ${tenant.firstName},\n\nThis is a reminder regarding ${co.obligation.rentalPeriodLabel} for ${unit?.name}. Outstanding balance: ₦${co.amountOutstanding.toLocaleString()}${partialNote}. Due date: ${co.obligation.dueDate}.\n\nKindly remit payment and share your transfer reference.\n\nRegards,\n${state.property.name}`,
              scheduledAt: new Date().toISOString(),
              attemptedAt: isAutoSmtp || isGmailMode ? undefined : new Date().toISOString(),
              retryCount: 0,
            });
          }
        }
        if (tenant.phone) {
          const k = `${eventKey}::${tenant.phone}::SMS`;
          if (!existingKeys.has(k)) {
            existingKeys.add(k);
            const hasSmsGw = Boolean(integrationStatus?.smsWebhookConfigured);
            const smsProv = integrationStatus?.bulkSmsConfigured
              ? 'BulkSMSLive'
              : hasSmsGw
              ? 'SMS Gateway'
              : 'Ledger Only';
            newlyCreated.push({
              id: uid('ntf'),
              eventId: eventKey,
              eventType,
              relatedRecordId: co.obligation.id,
              tenantId: tenant.id,
              recipientName: `${tenant.firstName} ${tenant.lastName}`,
              recipientRole: 'Tenant',
              recipientContact: tenant.phone,
              channel: 'SMS',
              status: hasSmsGw ? 'Queued' : 'Sent',
              deliveryProvider: smsProv,
              messageBody: `${eventType}: ${unit?.code} ${co.obligation.rentalPeriodLabel} balance ₦${co.amountOutstanding.toLocaleString()} (Due ${co.obligation.dueDate}).`,
              scheduledAt: new Date().toISOString(),
              attemptedAt: hasSmsGw ? undefined : new Date().toISOString(),
              retryCount: 0,
            });
          }
        }
      }
    }

    if (newlyCreated.length > 0) {
      setState((prev) => ({
        ...prev,
        notifications: [...newlyCreated, ...prev.notifications],
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Notification',
            'batch-run',
            'Scheduled Reminders Processed',
            `Processed reminder schedule for ${prev.referenceDate}: queued/logged ${newlyCreated.length} role-scoped messages.`
          ),
          ...prev.auditLogs,
        ],
      }));
    }

    return {
      createdCount: newlyCreated.length,
      message:
        newlyCreated.length > 0
          ? isGmailMode
            ? `Queued ${newlyCreated.length} reminder(s). Review & approve due Gmail emails below to send.`
            : `Processed ${newlyCreated.length} deduplicated reminder(s) for active unpaid obligations.`
          : 'All eligible reminders for today have already been processed or suppressed.',
    };
  };

  const recordCommitment: RentalContextValue['recordCommitment'] = (input) => {
    if (input.promisedAmount <= 0) {
      return { ok: false, error: 'Promised amount must be greater than ₦0.' };
    }
    if (input.obligationIds.length === 0) {
      return { ok: false, error: 'Select at least one open obligation.' };
    }
    const newCom: PaymentCommitment = {
      id: uid('com'),
      tenantId: input.tenantId,
      obligationIds: input.obligationIds,
      promisedAmount: input.promisedAmount,
      promisedDate: input.promisedDate,
      instalments: [{ id: uid('inst'), dueDate: input.promisedDate, amount: input.promisedAmount }],
      status: 'Open',
      dateRecorded: state.referenceDate,
      recordedBy: state.property.managerName,
      notes: input.notes.trim(),
    };
    const tenant = state.tenants.find((t) => t.id === input.tenantId);
    setState((prev) => ({
      ...prev,
      commitments: [newCom, ...prev.commitments],
      auditLogs: [
        makeAudit(
          prev.property.managerName,
          'Commitment',
          newCom.id,
          'Promise to Pay Recorded',
          `Recorded ₦${input.promisedAmount.toLocaleString()} payment commitment from ${tenant?.firstName} ${tenant?.lastName} due ${input.promisedDate}.`,
          { newValue: `₦${input.promisedAmount.toLocaleString()} · Due ${input.promisedDate}` }
        ),
        ...prev.auditLogs,
      ],
    }));
    return { ok: true };
  };

  const extendCommitment: RentalContextValue['extendCommitment'] = (
    commitmentId,
    newDate,
    reason
  ) => {
    setState((prev) => {
      const target = prev.commitments.find((c) => c.id === commitmentId);
      if (!target) return prev;
      return {
        ...prev,
        commitments: prev.commitments.map((c) =>
          c.id === commitmentId ? { ...c, extendedUntilDate: newDate } : c
        ),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Commitment',
            commitmentId,
            'Commitment Extended',
            `Extended promise-to-pay deadline to ${newDate}.`,
            { previousValue: target.extendedUntilDate || target.promisedDate, newValue: newDate, reason }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const cancelCommitment: RentalContextValue['cancelCommitment'] = (commitmentId, reason) => {
    setState((prev) => {
      const target = prev.commitments.find((c) => c.id === commitmentId);
      if (!target) return prev;
      return {
        ...prev,
        commitments: prev.commitments.map((c) =>
          c.id === commitmentId ? { ...c, status: 'Cancelled', cancellationReason: reason } : c
        ),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Commitment',
            commitmentId,
            'Commitment Cancelled',
            `Cancelled payment commitment.`,
            { previousValue: target.status, newValue: 'Cancelled', reason }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const recordCommissionPayout: RentalContextValue['recordCommissionPayout'] = (input) => {
    if (input.amount <= 0) return { ok: false, error: 'Payout amount must be positive.' };
    const lawyer = state.contacts.find((c) => c.role === 'Lawyer');
    const payout: CommissionPayout = {
      id: uid('cpay'),
      lawyerContactId: lawyer?.id || 'c-lawyer-1',
      amount: input.amount,
      payoutDate: input.payoutDate,
      reference: input.reference.trim(),
      notes: input.notes.trim(),
      recordedBy: state.property.managerName,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      commissionPayouts: [payout, ...prev.commissionPayouts],
      auditLogs: [
        makeAudit(
          prev.property.managerName,
          'Commission',
          payout.id,
          'Commission Payout Recorded',
          `Paid ₦${input.amount.toLocaleString()} commission to ${lawyer?.name || 'Lawyer'} (Ref: ${payout.reference}).`,
          { newValue: `₦${input.amount.toLocaleString()} · ${payout.payoutDate}` }
        ),
        ...prev.auditLogs,
      ],
    }));
    return { ok: true };
  };

  const recordExpense: RentalContextValue['recordExpense'] = (input) => {
    const exp: PropertyExpense = {
      ...input,
      id: uid('exp'),
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      expenses: [exp, ...prev.expenses],
      auditLogs: [
        makeAudit(
          prev.property.managerName,
          'Expense',
          exp.id,
          'Expense Recorded',
          `Recorded ₦${exp.amount.toLocaleString()} expense (${exp.category}) paid to ${exp.vendor}.`,
          { newValue: `${exp.description} · ₦${exp.amount.toLocaleString()}` }
        ),
        ...prev.auditLogs,
      ],
    }));
  };

  const recordMaintenance: RentalContextValue['recordMaintenance'] = (input) => {
    const rec: MaintenanceRecord = {
      ...input,
      id: uid('mnt'),
    };
    setState((prev) => ({
      ...prev,
      maintenance: [rec, ...prev.maintenance],
      auditLogs: [
        makeAudit(
          prev.property.managerName,
          'Maintenance',
          rec.id,
          'Maintenance Logged',
          `Logged maintenance ticket: "${rec.issue}" assigned to ${rec.assignedTo}.`,
          { newValue: `${rec.status} · ₦${rec.estimatedOrActualCost.toLocaleString()}` }
        ),
        ...prev.auditLogs,
      ],
    }));
  };

  const updateMaintenanceStatus: RentalContextValue['updateMaintenanceStatus'] = (
    id,
    status,
    resolutionDetails,
    cost
  ) => {
    setState((prev) => {
      const target = prev.maintenance.find((m) => m.id === id);
      if (!target) return prev;
      return {
        ...prev,
        maintenance: prev.maintenance.map((m) =>
          m.id === id
            ? {
                ...m,
                status,
                resolutionDetails: resolutionDetails ?? m.resolutionDetails,
                estimatedOrActualCost: cost ?? m.estimatedOrActualCost,
                resolvedDate: status === 'Resolved' ? prev.referenceDate : m.resolvedDate,
              }
            : m
        ),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Maintenance',
            id,
            'Maintenance Status Updated',
            `Updated maintenance "${target.issue}" to ${status}.`,
            { previousValue: target.status, newValue: status, reason: resolutionDetails }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const commitTenancyImport: RentalContextValue['commitTenancyImport'] = (rows, filename) => {
    let unitsCreated = 0;
    let tenantsCreated = 0;
    let agreementsCreated = 0;

    setState((prev) => {
      const units = [...prev.units];
      const tenants = [...prev.tenants];
      const agreements = [...prev.agreements];
      const obligations = [...prev.obligations];

      for (const r of rows) {
        let unit = units.find((u) => u.code.toLowerCase() === r.unitCode.toLowerCase());
        if (!unit) {
          unit = {
            id: uid('u'),
            code: r.unitCode,
            name: r.unitName,
            type: r.unitType,
            floorOrWing: r.floorOrWing,
            occupancyStatus: 'Occupied',
          };
          units.push(unit);
          unitsCreated++;
        }

        let tenant = tenants.find(
          (t) =>
            (r.phone && t.phone.replace(/\s+/g, '') === r.phone.replace(/\s+/g, '')) ||
            (r.email && t.email.toLowerCase() === r.email.toLowerCase())
        );
        if (!tenant) {
          tenant = {
            id: uid('t'),
            firstName: r.firstName,
            lastName: r.lastName,
            phone: r.phone,
            email: r.email,
            archived: false,
            notificationsPaused: false,
            historicalLateCycles: 0,
            createdAt: new Date().toISOString(),
          };
          tenants.push(tenant);
          tenantsCreated++;
        }

        if (!hasOverlappingActiveAgreement(unit.id, agreements)) {
          const agId = uid('ag');
          agreements.push({
            id: agId,
            tenantId: tenant.id,
            unitId: unit.id,
            status: 'Active',
            rentCycle: 'Yearly',
            agreedRent: r.agreedRent,
            securityLevy: r.securityLevy,
            startDate: r.startDate,
            endDate: r.endDate,
            dueDate: r.dueDate,
            createdAt: new Date().toISOString(),
          });
          obligations.push({
            id: uid('ob'),
            agreementId: agId,
            tenantId: tenant.id,
            unitId: unit.id,
            chargeType: 'Rent',
            rentalPeriodLabel: `${r.startDate.slice(0, 4)} Imported Rent`,
            originalAmount: r.agreedRent,
            dueDate: r.dueDate,
            underReview: false,
            createdAt: new Date().toISOString(),
          });
          if (r.securityLevy > 0) {
            obligations.push({
              id: uid('ob'),
              agreementId: agId,
              tenantId: tenant.id,
              unitId: unit.id,
              chargeType: 'Security Levy',
              rentalPeriodLabel: `${r.startDate.slice(0, 4)} Imported Levy`,
              originalAmount: r.securityLevy,
              dueDate: r.dueDate,
              underReview: false,
              createdAt: new Date().toISOString(),
            });
          }
          agreementsCreated++;
        }
      }

      return {
        ...prev,
        units,
        tenants,
        agreements,
        obligations,
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Import',
            uid('imp'),
            'Tenancy CSV Imported',
            `Imported "${filename}" (${rows.length} rows): +${unitsCreated} units, +${tenantsCreated} tenants, +${agreementsCreated} agreements. External notifications suppressed.`,
            { newValue: `${agreementsCreated} agreements onboarded` }
          ),
          ...prev.auditLogs,
        ],
      };
    });

    return { unitsCreated, tenantsCreated, agreementsCreated };
  };

  const commitPaymentImport: RentalContextValue['commitPaymentImport'] = (
    rows,
    filename,
    createBackfillReceipts
  ) => {
    let paymentsImported = 0;
    let skippedUnmatched = 0;
    let totalAmount = 0;

    setState((prev) => {
      const payments = [...prev.payments];
      const receiptRequests = [...prev.receiptRequests];
      const commissions = [...prev.commissions];
      const obligations = prev.obligations;

      for (const r of rows) {
        const unit = prev.units.find((u) => u.code.toLowerCase() === r.unitCode.toLowerCase());
        const agreement = unit
          ? prev.agreements.find((a) => a.unitId === unit.id && a.status === 'Active') ||
            prev.agreements.find((a) => a.unitId === unit.id)
          : undefined;
        if (!unit || !agreement) {
          skippedUnmatched++;
          continue;
        }

        const unitObs = obligations
          .filter((o) => o.agreementId === agreement.id)
          .map((o) => computeObligation(o, payments, prev.referenceDate, prev.settings.gracePeriodDays))
          .filter((co) => co.amountOutstanding > 0);

        let rem = r.amount;
        const allocations: PaymentAllocation[] = [];
        for (const co of unitObs) {
          if (rem <= 0) break;
          const alloc = Math.min(rem, co.amountOutstanding);
          if (alloc > 0) {
            allocations.push({ obligationId: co.obligation.id, amount: alloc });
            rem -= alloc;
          }
        }

        const payId = uid('pay');
        const sysRef = `IMP-2026-${String(payments.length + 100).padStart(4, '0')}`;
        payments.unshift({
          id: payId,
          systemRef: sysRef,
          tenantId: agreement.tenantId,
          agreementId: agreement.id,
          unitId: unit.id,
          amount: r.amount,
          dateReceived: r.dateReceived,
          dateRecorded: new Date().toISOString(),
          method: r.method,
          bankReference: r.bankReference,
          status: 'Confirmed',
          allocations,
          unappliedAmount: rem,
          notes: r.notes,
          recordedBy: `${prev.property.managerName} (CSV Import)`,
        });

        const { eligibleRent, commissionAmount } = calculateCommissionOnAllocations(
          allocations,
          obligations,
          prev.settings.lawyerCommissionRatePercent
        );
        if (commissionAmount > 0) {
          commissions.unshift({
            id: uid('comm'),
            paymentId: payId,
            agreementId: agreement.id,
            tenantId: agreement.tenantId,
            ratePercent: prev.settings.lawyerCommissionRatePercent,
            eligibleRentCollected: eligibleRent,
            accruedAmount: commissionAmount,
            createdAt: new Date().toISOString(),
            note: `Imported historical commission (${sysRef})`,
          });
        }

        if (createBackfillReceipts) {
          const issuer = prev.contacts.find((c) => c.isPrimaryReceiptIssuer);
          receiptRequests.unshift({
            id: uid('rcp-req'),
            paymentId: payId,
            paymentRef: sysRef,
            tenantId: agreement.tenantId,
            unitId: unit.id,
            amount: r.amount,
            datePaid: r.dateReceived,
            rentalPeriodCovered: 'Imported Historical Payment',
            securityLevyIncluded: 0,
            remainingBalanceAtPayment: 0,
            issuerContactId: issuer?.id || 'c-issuer-1',
            status: 'Created',
            createdAt: new Date().toISOString(),
            slaDeadlineAt: new Date().toISOString(),
          });
        }

        paymentsImported++;
        totalAmount += r.amount;
      }

      return {
        ...prev,
        payments,
        receiptRequests,
        commissions,
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Import',
            uid('imp'),
            'Historical Payments Imported',
            `Imported "${filename}": ${paymentsImported} payment(s) totaling ₦${totalAmount.toLocaleString()} (${skippedUnmatched} skipped).`,
            { newValue: `₦${totalAmount.toLocaleString()} · Backfill receipts: ${createBackfillReceipts}` }
          ),
          ...prev.auditLogs,
        ],
      };
    });

    return { paymentsImported, skippedUnmatched, totalAmount };
  };

  const updateSettings: RentalContextValue['updateSettings'] = (patch, reason) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
      auditLogs: [
        makeAudit(
          prev.property.managerName,
          'Settings',
          'system-settings',
          'Settings Updated',
          `Updated property operating rules (${Object.keys(patch).join(', ')}).`,
          { newValue: JSON.stringify(patch), reason }
        ),
        ...prev.auditLogs,
      ],
    }));
  };

  const updatePropertyProfile: RentalContextValue['updatePropertyProfile'] = (patch) => {
    setState((prev) => ({
      ...prev,
      property: { ...prev.property, ...patch },
      auditLogs: [
        makeAudit(
          prev.property.managerName,
          'Property',
          prev.property.id,
          'Property Profile Updated',
          `Updated property metadata (${Object.keys(patch).join(', ')}).`
        ),
        ...prev.auditLogs,
      ],
    }));
  };

  const saveSmsTemplate: RentalContextValue['saveSmsTemplate'] = useCallback((input) => {
    const nameTrim = input.name.trim();
    const bodyTrim = input.body.trim();
    if (!nameTrim) {
      return { ok: false, error: 'Template name is required.' };
    }
    if (!bodyTrim) {
      return { ok: false, error: 'SMS template message body cannot be empty.' };
    }

    const nowIso = new Date().toISOString();
    const tplId = input.id || uid('tpl-sms');
    const saved: SmsTemplate = {
      id: tplId,
      name: nameTrim,
      category: input.category,
      body: bodyTrim,
      updatedAt: nowIso,
    };

    setState((prev) => {
      const existing = prev.smsTemplates.find((t) => t.id === tplId);
      const nextTemplates = existing
        ? prev.smsTemplates.map((t) => (t.id === tplId ? saved : t))
        : [saved, ...prev.smsTemplates];
      return {
        ...prev,
        smsTemplates: nextTemplates,
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Template',
            tplId,
            existing ? 'SMS Template Updated' : 'SMS Template Created',
            `${existing ? 'Updated' : 'Created'} reusable SMS template "${saved.name}" (${saved.category}).`,
            existing
              ? { previousValue: existing.body.slice(0, 80), newValue: saved.body.slice(0, 80) }
              : { newValue: `${saved.category}: ${saved.name}` }
          ),
          ...prev.auditLogs,
        ],
      };
    });

    return { ok: true, id: tplId };
  }, []);

  const deleteSmsTemplate: RentalContextValue['deleteSmsTemplate'] = useCallback((templateId) => {
    setState((prev) => {
      const target = prev.smsTemplates.find((t) => t.id === templateId);
      if (!target) return prev;
      return {
        ...prev,
        smsTemplates: prev.smsTemplates.filter((t) => t.id !== templateId),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Template',
            templateId,
            'SMS Template Deleted',
            `Deleted reusable SMS template "${target.name}" (${target.category}).`,
            { previousValue: target.name }
          ),
          ...prev.auditLogs,
        ],
      };
    });
  }, []);

  const addContact: RentalContextValue['addContact'] = (contact) => {
    const newC: StakeholderContact = { ...contact, id: uid('c') };
    setState((prev) => ({
      ...prev,
      contacts: [...prev.contacts, newC],
      auditLogs: [
        makeAudit(
          prev.property.managerName,
          'Contact',
          newC.id,
          'Stakeholder Contact Added',
          `Added ${newC.name} as ${newC.role}.`
        ),
        ...prev.auditLogs,
      ],
    }));
  };

  const updateContact: RentalContextValue['updateContact'] = (id, patch) => {
    setState((prev) => {
      const target = prev.contacts.find((c) => c.id === id);
      if (!target) return prev;
      return {
        ...prev,
        contacts: prev.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        auditLogs: [
          makeAudit(
            prev.property.managerName,
            'Contact',
            id,
            'Contact Routing Updated',
            `Updated notification preferences for ${target.name} (${target.role}).`
          ),
          ...prev.auditLogs,
        ],
      };
    });
  };

  const resetDemoData = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState(SEED_STATE);
  };

  return (
    <RentalContext.Provider
      value={{
        state,
        computedObligations,
        effectiveReceipts,
        evaluatedCommitments,
        tenantBehaviours,
        summaryMetrics,
        ageingSummary,
        dueScheduledNotifications,
        scheduledCount,
        activeTab,
        setActiveTab,
        selectedTenantIdForDrawer,
        setSelectedTenantIdForDrawer,
        openRecordPaymentModal,
        setOpenRecordPaymentModal,
        preselectedTenantForPayment,
        setPreselectedTenantForPayment,
        composerOpen,
        setComposerOpen,
        composerPrefill,
        openComposerFor,
        calendarSyncOpen,
        calendarSyncTenantId,
        openCalendarSyncFor,
        closeCalendarSync,
        logAuditEvent,
        createUnit,
        updateUnitStatus,
        createTenant,
        updateTenant,
        toggleTenantNotificationPause,
        overrideTenantBehaviour,
        createAgreement,
        renewAgreement,
        toggleObligationReview,
        recordPayment,
        reversePayment,
        acknowledgeReceipt,
        issueReceipt,
        cancelReceipt,
        retryNotification,
        appendNotifications,
        updateNotificationRecord,
        cancelScheduledNotification,
        rescheduleNotification,
        runScheduledReminders,
        recordCommitment,
        extendCommitment,
        cancelCommitment,
        recordCommissionPayout,
        recordExpense,
        recordMaintenance,
        updateMaintenanceStatus,
        commitTenancyImport,
        commitPaymentImport,
        updateSettings,
        updatePropertyProfile,
        saveSmsTemplate,
        deleteSmsTemplate,
        addContact,
        updateContact,
        resetDemoData,
      }}
    >
      {children}
    </RentalContext.Provider>
  );
}

export function useRentalStore(): RentalContextValue {
  const ctx = useContext(RentalContext);
  if (!ctx) throw new Error('useRentalStore must be used inside RentalProvider');
  return ctx;
}
