import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  Mail,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { useIntegrations } from '../context/IntegrationContext';
import { useRentalStore } from '../context/RentalStore';
import type {
  ObligationChargeType,
  PaymentAllocation,
  PaymentCategoryDefinition,
  PaymentMethod,
} from '../types/rental';
import { sendEmailViaGmail, sendEmailViaSmtp } from '../utils/emailClient';
import { formatDateShort, formatNaira, formatTenantName, parseCurrencyValue } from '../utils/format';
import {
  deriveRentYearLabel,
  extractObligationCycleLabel,
  getObligationCategoryLabel,
} from '../utils/paymentReconciliation';
import {
  checkDuplicateBankReference,
  suggestPaymentAllocations,
  type ComputedObligation,
} from '../utils/rentalEngine';
import { AddCycleObligationInline } from './AddCycleObligationInline';
import { CurrencyInput } from './CurrencyInput';
import { StatusBadge } from './StatusBadge';

const RENT_YEAR_PRESETS = ['2024', '2025', '2026', '2027', '2028'];

type CategoryKey = 'rent' | 'levy' | `custom:${string}`;

interface SessionSavedPayment {
  id: string;
  systemRef: string;
  tenantName: string;
  categoryLabel: string;
  year: string;
  amount: number;
}

function defaultDueDateForYear(yearLabel: string, fallbackDueDate?: string): string {
  const yrMatch = yearLabel.match(/\b(20\d{2})\b/);
  const yr = yrMatch ? yrMatch[1] : '2026';
  if (fallbackDueDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDueDate)) {
    return `${yr}${fallbackDueDate.slice(4)}`;
  }
  return `${yr}-01-31`;
}

export function RecordPaymentModal() {
  const {
    state,
    computedObligations,
    openRecordPaymentModal,
    setOpenRecordPaymentModal,
    preselectedTenantForPayment,
    recordPayment,
    addCustomPaymentCategory,
    updateNotificationRecord,
  } = useRentalStore();
  const { status, isGmailConnected, gmailAccessToken, gmailUser } = useIntegrations();

  const activeTenants = useMemo(
    () => state.tenants.filter((t) => !t.archived),
    [state.tenants]
  );
  const customCategories = state.settings.customPaymentCategories ?? [];

  const [tenantId, setTenantId] = useState<string>('');
  const [agreementId, setAgreementId] = useState<string>('');
  const [allocationMode, setAllocationMode] = useState<'guided' | 'split'>('guided');
  const [categoryKey, setCategoryKey] = useState<CategoryKey>('rent');
  const [yearMode, setYearMode] = useState<string>(state.referenceDate.slice(0, 4) || '2026');
  const [customYear, setCustomYear] = useState<string>('');

  // Inline "+ Add New Category" builder
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatDefaultStr, setNewCatDefaultStr] = useState('');
  const [newCatCommission, setNewCatCommission] = useState(false);
  const [newCatError, setNewCatError] = useState('');

  // Inline unbilled obligation setup (for Guided Mode when (Tenant + Category + Year) has no obligation yet)
  const [createUnbilledObligation, setCreateUnbilledObligation] = useState(true);
  const [inlineExpectedStr, setInlineExpectedStr] = useState('');
  const [inlineExpectedTouched, setInlineExpectedTouched] = useState(false);
  const [inlineDueDate, setInlineDueDate] = useState('2026-01-31');

  // Payment fields
  const [amountStr, setAmountStr] = useState<string>('');
  const [amountTouched, setAmountTouched] = useState<boolean>(false);
  const [dateReceived, setDateReceived] = useState<string>(state.referenceDate);
  const [timeReceived, setTimeReceived] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('Bank Transfer');
  const [bankReference, setBankReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Split mode allocation map
  const [allocMap, setAllocMap] = useState<Record<string, number>>({});
  const [showAddCycle, setShowAddCycle] = useState<boolean>(false);

  // Dispatch & session state
  const [sendEmailImmediately, setSendEmailImmediately] = useState<boolean>(
    Boolean(isGmailConnected || status?.smtpConfigured)
  );
  const [simulateFailure, setSimulateFailure] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [sessionSaved, setSessionSaved] = useState<SessionSavedPayment[]>([]);

  const selectedTenant = useMemo(
    () => state.tenants.find((t) => t.id === tenantId),
    [state.tenants, tenantId]
  );

  const tenantAgreements = useMemo(
    () => state.agreements.filter((a) => a.tenantId === tenantId),
    [state.agreements, tenantId]
  );

  const selectedAgreement = useMemo(
    () => state.agreements.find((a) => a.id === agreementId) || tenantAgreements[0],
    [state.agreements, agreementId, tenantAgreements]
  );

  const openObligations = useMemo(() => {
    return computedObligations
      .filter((c) => c.obligation.tenantId === tenantId && c.amountOutstanding > 0)
      .sort((a, b) => a.obligation.dueDate.localeCompare(b.obligation.dueDate));
  }, [computedObligations, tenantId]);

  const settledObligations = useMemo(() => {
    return computedObligations
      .filter((c) => c.obligation.tenantId === tenantId && c.amountOutstanding <= 0)
      .sort((a, b) => a.obligation.dueDate.localeCompare(b.obligation.dueDate));
  }, [computedObligations, tenantId]);

  const selectedCustomCategory: PaymentCategoryDefinition | undefined = useMemo(() => {
    if (!categoryKey.startsWith('custom:')) return undefined;
    const id = categoryKey.slice('custom:'.length);
    return customCategories.find((c) => c.id === id);
  }, [categoryKey, customCategories]);

  const activeChargeType: ObligationChargeType = useMemo(() => {
    if (categoryKey === 'rent') return 'Rent';
    if (categoryKey === 'levy') return 'Security Levy';
    return 'Other Charge';
  }, [categoryKey]);

  const activeCategoryLabel = useMemo(() => {
    if (categoryKey === 'rent') return 'Annual Rent';
    if (categoryKey === 'levy') return 'Security Levy';
    return selectedCustomCategory?.label || 'Other Charge';
  }, [categoryKey, selectedCustomCategory]);

  const effectiveYear = useMemo(() => {
    if (yearMode === 'custom') {
      return customYear.trim() || state.referenceDate.slice(0, 4) || '2026';
    }
    return yearMode;
  }, [yearMode, customYear, state.referenceDate]);

  // Match obligation(s) for (Tenant/Agreement + Category + Year) in Guided Mode
  const matchingObligation: ComputedObligation | undefined = useMemo(() => {
    const candidates = computedObligations.filter((co) => {
      if (co.obligation.tenantId !== tenantId) return false;
      if (agreementId && co.obligation.agreementId !== agreementId) return false;
      const coYear = extractObligationCycleLabel(
        co.obligation.rentalPeriodLabel,
        co.obligation.dueDate
      );
      if (coYear.toLowerCase() !== effectiveYear.toLowerCase()) return false;

      if (categoryKey === 'rent') {
        return co.obligation.chargeType === 'Rent';
      }
      if (categoryKey === 'levy') {
        return co.obligation.chargeType === 'Security Levy';
      }
      if (selectedCustomCategory) {
        return (
          co.obligation.chargeType === 'Other Charge' &&
          (co.obligation.categoryId === selectedCustomCategory.id ||
            co.obligation.categoryLabel?.trim().toLowerCase() ===
              selectedCustomCategory.label.trim().toLowerCase())
        );
      }
      return false;
    });

    // Prefer an unpaid obligation if multiple exist for same year/category
    return candidates.find((c) => c.amountOutstanding > 0) || candidates[0];
  }, [
    computedObligations,
    tenantId,
    agreementId,
    effectiveYear,
    categoryKey,
    selectedCustomCategory,
  ]);

  // Initialize modal cleanly only when opened
  useEffect(() => {
    if (!openRecordPaymentModal) return;

    const defaultTenantId =
      preselectedTenantForPayment ||
      activeTenants.find((t) =>
        computedObligations.some((c) => c.obligation.tenantId === t.id && c.amountOutstanding > 0)
      )?.id ||
      activeTenants[0]?.id ||
      '';

    const tenantAgs = state.agreements.filter((a) => a.tenantId === defaultTenantId);
    const defaultAg = tenantAgs.find((a) => a.status === 'Active') || tenantAgs[0];
    const tenantOpen = computedObligations
      .filter((c) => c.obligation.tenantId === defaultTenantId && c.amountOutstanding > 0)
      .sort((a, b) => a.obligation.dueDate.localeCompare(b.obligation.dueDate));

    const firstOpen = tenantOpen[0];
    let initCat: CategoryKey = 'rent';
    let initYear = state.referenceDate.slice(0, 4) || '2026';

    if (firstOpen) {
      if (firstOpen.obligation.chargeType === 'Security Levy') {
        initCat = 'levy';
      } else if (firstOpen.obligation.chargeType === 'Other Charge') {
        const matchedCat = customCategories.find(
          (cat) =>
            cat.id === firstOpen.obligation.categoryId ||
            cat.label.toLowerCase() === (firstOpen.obligation.categoryLabel || '').toLowerCase()
        );
        initCat = matchedCat ? `custom:${matchedCat.id}` : 'rent';
      } else {
        initCat = 'rent';
      }
      const yr = extractObligationCycleLabel(
        firstOpen.obligation.rentalPeriodLabel,
        firstOpen.obligation.dueDate
      );
      if (RENT_YEAR_PRESETS.includes(yr)) {
        initYear = yr;
      } else {
        initYear = yr;
      }
    }

    setTenantId(defaultTenantId);
    setAgreementId(defaultAg?.id || '');
    setAllocationMode('guided');
    setCategoryKey(initCat);
    if (RENT_YEAR_PRESETS.includes(initYear)) {
      setYearMode(initYear);
      setCustomYear('');
    } else {
      setYearMode('custom');
      setCustomYear(initYear);
    }
    setAmountStr(firstOpen ? String(firstOpen.amountOutstanding) : '');
    setAmountTouched(false);
    setDateReceived(state.referenceDate);
    setTimeReceived('');
    setMethod('Bank Transfer');
    setBankReference('');
    setNotes('');
    setShowNewCategoryForm(false);
    setNewCatLabel('');
    setNewCatDefaultStr('');
    setNewCatCommission(false);
    setNewCatError('');
    setCreateUnbilledObligation(true);
    setInlineExpectedTouched(false);
    setInlineDueDate(defaultDueDateForYear(initYear, defaultAg?.dueDate));
    setShowAddCycle(false);
    setAllocMap({});
    setSendEmailImmediately(Boolean(isGmailConnected || status?.smtpConfigured));
    setSimulateFailure(false);
    setErrorMsg('');
    setSessionSaved([]);
    // Only reset when modal opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRecordPaymentModal, preselectedTenantForPayment]);

  // Keep agreementId valid if tenant changes
  useEffect(() => {
    if (!tenantId) return;
    if (!tenantAgreements.some((a) => a.id === agreementId)) {
      const preferred =
        tenantAgreements.find((a) => a.status === 'Active')?.id || tenantAgreements[0]?.id || '';
      setAgreementId(preferred);
    }
  }, [tenantId, tenantAgreements, agreementId]);

  // Update inline unbilled obligation defaults when category / year / agreement changes
  useEffect(() => {
    setInlineDueDate(defaultDueDateForYear(effectiveYear, selectedAgreement?.dueDate));
    if (inlineExpectedTouched) return;
    if (categoryKey === 'rent') {
      setInlineExpectedStr(selectedAgreement?.agreedRent ? String(selectedAgreement.agreedRent) : '');
    } else if (categoryKey === 'levy') {
      const levyAmt = selectedAgreement?.securityLevy || state.settings.securityLevyAmount;
      setInlineExpectedStr(levyAmt ? String(levyAmt) : '');
    } else if (selectedCustomCategory?.defaultAmount) {
      setInlineExpectedStr(String(selectedCustomCategory.defaultAmount));
    } else {
      setInlineExpectedStr('');
    }
  }, [
    categoryKey,
    effectiveYear,
    selectedAgreement?.agreedRent,
    selectedAgreement?.securityLevy,
    selectedAgreement?.dueDate,
    state.settings.securityLevyAmount,
    selectedCustomCategory,
    inlineExpectedTouched,
  ]);

  // Auto-populate Amount Confirmed in Guided Mode until the user manually edits it
  useEffect(() => {
    if (!openRecordPaymentModal || allocationMode !== 'guided' || amountTouched) return;
    if (matchingObligation) {
      setAmountStr(
        matchingObligation.amountOutstanding > 0
          ? String(matchingObligation.amountOutstanding)
          : ''
      );
    } else if (createUnbilledObligation) {
      setAmountStr(inlineExpectedStr);
    }
  }, [
    openRecordPaymentModal,
    allocationMode,
    amountTouched,
    matchingObligation,
    createUnbilledObligation,
    inlineExpectedStr,
  ]);

  if (!openRecordPaymentModal) return null;

  const parsedAmount = parseCurrencyValue(amountStr);
  const effectiveInlineExpected = inlineExpectedStr.trim()
    ? parseCurrencyValue(inlineExpectedStr)
    : parsedAmount;

  const handleSelectTenant = (nextTenantId: string) => {
    setTenantId(nextTenantId);
    const ags = state.agreements.filter((a) => a.tenantId === nextTenantId);
    const preferredAg = ags.find((a) => a.status === 'Active') || ags[0];
    setAgreementId(preferredAg?.id || '');
    setInlineExpectedTouched(false);
    setAllocMap({});
    setErrorMsg('');
  };

  const handleSelectCategory = (nextKey: CategoryKey) => {
    setCategoryKey(nextKey);
    setInlineExpectedTouched(false);
    setErrorMsg('');
  };

  const handleSelectYear = (nextMode: string) => {
    setYearMode(nextMode);
    setInlineExpectedTouched(false);
    setErrorMsg('');
  };

  const handleCreateNewCategory = () => {
    setNewCatError('');
    const res = addCustomPaymentCategory({
      label: newCatLabel,
      defaultAmount: newCatDefaultStr.trim() ? parseCurrencyValue(newCatDefaultStr) : undefined,
      commissionEligible: newCatCommission,
    });
    if (!res.ok || !res.category) {
      setNewCatError(res.error || 'Could not create category.');
      return;
    }
    setCategoryKey(`custom:${res.category.id}`);
    setInlineExpectedTouched(false);
    setAmountTouched(false);
    setNewCatLabel('');
    setNewCatDefaultStr('');
    setNewCatCommission(false);
    setShowNewCategoryForm(false);
  };

  const handleSwitchToSplitMode = () => {
    setAllocationMode('split');
    const targetAmt =
      parsedAmount > 0 ? parsedAmount : openObligations.reduce((s, c) => s + c.amountOutstanding, 0);
    if (targetAmt > 0 && parsedAmount <= 0) {
      setAmountStr(String(targetAmt));
    }
    const suggested = suggestPaymentAllocations(
      targetAmt,
      openObligations,
      state.settings.defaultAllocationOrder === 'Manual Only'
        ? 'Oldest Overdue First'
        : state.settings.defaultAllocationOrder
    );
    const nextMap: Record<string, number> = {};
    for (const a of suggested.allocations) {
      nextMap[a.obligationId] = a.amount;
    }
    setAllocMap(nextMap);
  };

  const handleAutoAllocateSplit = () => {
    const suggested = suggestPaymentAllocations(
      parsedAmount,
      openObligations,
      state.settings.defaultAllocationOrder === 'Manual Only'
        ? 'Oldest Overdue First'
        : state.settings.defaultAllocationOrder
    );
    const nextMap: Record<string, number> = {};
    for (const a of suggested.allocations) {
      nextMap[a.obligationId] = a.amount;
    }
    setAllocMap(nextMap);
  };

  // Compute live split metrics
  const splitAllocations: PaymentAllocation[] = Object.entries(allocMap)
    .filter(([, amt]) => amt > 0)
    .map(([obligationId, amount]) => ({ obligationId, amount }));
  const splitAllocatedTotal = splitAllocations.reduce((s, a) => s + a.amount, 0);
  const totalOpenBalance = openObligations.reduce((s, c) => s + c.amountOutstanding, 0);

  // Compute live guided allocation metrics
  const guidedAllocatedAmount = matchingObligation
    ? Math.min(parsedAmount, matchingObligation.amountOutstanding)
    : createUnbilledObligation
    ? Math.min(parsedAmount, Math.max(0, effectiveInlineExpected))
    : 0;
  const guidedUnappliedAmount = Math.max(
    0,
    Math.round((parsedAmount - guidedAllocatedAmount) * 100) / 100
  );
  const guidedObligationRemainingAfter = matchingObligation
    ? Math.max(0, Math.round((matchingObligation.amountOutstanding - guidedAllocatedAmount) * 100) / 100)
    : createUnbilledObligation
    ? Math.max(0, Math.round((effectiveInlineExpected - guidedAllocatedAmount) * 100) / 100)
    : 0;

  const isDuplicateRef = checkDuplicateBankReference(bankReference, state.payments);
  const autoDerivedYear = deriveRentYearLabel(splitAllocations, state.obligations, dateReceived);
  const resolvedRentYear =
    allocationMode === 'guided'
      ? effectiveYear
      : autoDerivedYear !== 'Unapplied'
      ? autoDerivedYear
      : effectiveYear;

  const suggestedNewYear = (() => {
    const allYears = computedObligations
      .filter((c) => c.obligation.tenantId === tenantId)
      .map((c) =>
        Number(
          extractObligationCycleLabel(c.obligation.rentalPeriodLabel, c.obligation.dueDate).slice(
            0,
            4
          )
        )
      )
      .filter((y) => Number.isFinite(y));
    const maxYr = allYears.length > 0 ? Math.max(...allYears) : 2026;
    return String(Math.max(2026, maxYr + 1));
  })();

  const tenantMissingEmail = !selectedTenant?.email?.trim();
  const tenantMissingPhone = !selectedTenant?.phone?.trim();

  const dispatchEmailsIfNeeded = async (
    createdNotifications: NonNullable<ReturnType<typeof recordPayment>['createdNotifications']>
  ) => {
    const hasLiveEmailTransport =
      (isGmailConnected && Boolean(gmailAccessToken)) || Boolean(status?.smtpConfigured);
    if (!sendEmailImmediately || simulateFailure || !hasLiveEmailTransport) return;

    const emailNotifications = createdNotifications.filter(
      (n) => n.channel === 'Email' && n.recipientContact?.trim()
    );
    for (const n of emailNotifications) {
      try {
        if (isGmailConnected && gmailAccessToken) {
          const res = await sendEmailViaGmail(gmailAccessToken, {
            from: gmailUser?.email || undefined,
            to: n.recipientContact,
            subject: n.subject || 'PropLedger Receipt Request',
            body: n.messageBody,
            replyTo: state.property.managerEmail,
          });
          updateNotificationRecord(
            n.id,
            {
              status: 'Delivered',
              deliveryProvider: 'Gmail',
              externalMessageId: res.messageId,
              attemptedAt: new Date().toISOString(),
              failureReason: undefined,
            },
            'Email Dispatched via Gmail',
            `Dispatched receipt email to ${n.recipientName} (${n.recipientContact}) via Gmail API.`
          );
        } else if (status?.smtpConfigured) {
          const res = await sendEmailViaSmtp({
            to: n.recipientContact,
            subject: n.subject || 'PropLedger Receipt Request',
            body: n.messageBody,
            replyTo: state.property.managerEmail,
          });
          updateNotificationRecord(
            n.id,
            {
              status: 'Delivered',
              deliveryProvider: 'SMTP',
              externalMessageId: res.messageId,
              attemptedAt: new Date().toISOString(),
              failureReason: undefined,
            },
            'Email Dispatched via SMTP',
            `Dispatched receipt email to ${n.recipientName} (${n.recipientContact}) via SMTP.`
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Email relay failed';
        updateNotificationRecord(
          n.id,
          {
            status: 'Failed',
            attemptedAt: new Date().toISOString(),
            failureReason: `${msg} (payment persisted safely)`,
          },
          'Immediate Email Dispatch Failed',
          `Email dispatch failed after saving payment: ${msg}`
        );
      }
    }
  };

  const executeSave = (keepOpen: boolean) => {
    setErrorMsg('');
    if (parsedAmount <= 0) {
      setErrorMsg('Enter an amount confirmed greater than ₦0.');
      return;
    }

    let allocationsToSave: PaymentAllocation[] = [];
    let inlineObligationPayload: Parameters<typeof recordPayment>[0]['inlineObligation'];

    if (allocationMode === 'split') {
      if (splitAllocatedTotal > parsedAmount + 0.01) {
        setErrorMsg('Allocated total cannot exceed payment amount.');
        return;
      }
      allocationsToSave = splitAllocations;
    } else if (matchingObligation) {
      if (matchingObligation.amountOutstanding > 0) {
        const alloc = Math.min(parsedAmount, matchingObligation.amountOutstanding);
        if (alloc > 0) {
          allocationsToSave = [{ obligationId: matchingObligation.obligation.id, amount: alloc }];
        }
      }
    } else if (createUnbilledObligation) {
      if (effectiveInlineExpected <= 0) {
        setErrorMsg('Expected charge amount for the unbilled obligation must be greater than ₦0.');
        return;
      }
      const periodSuffix =
        activeChargeType === 'Rent'
          ? 'Annual Rent'
          : activeChargeType === 'Security Levy'
          ? 'Security Levy'
          : activeCategoryLabel;
      inlineObligationPayload = {
        chargeType: activeChargeType,
        ...(selectedCustomCategory ? { categoryId: selectedCustomCategory.id } : {}),
        ...(activeChargeType === 'Other Charge' ? { categoryLabel: activeCategoryLabel } : {}),
        ...(activeChargeType === 'Other Charge'
          ? { commissionEligible: Boolean(selectedCustomCategory?.commissionEligible) }
          : {}),
        cycleYear: effectiveYear,
        rentalPeriodLabel: `${effectiveYear} ${periodSuffix}`,
        originalAmount: effectiveInlineExpected,
        dueDate: inlineDueDate,
      };
    }

    const result = recordPayment({
      tenantId,
      agreementId,
      amount: parsedAmount,
      dateReceived,
      timeReceived: timeReceived || undefined,
      method,
      bankReference,
      rentYearCovered: resolvedRentYear,
      allocations: allocationsToSave,
      notes,
      simulateNotificationFailure: simulateFailure,
      inlineObligation: inlineObligationPayload,
    });

    if (!result.ok) {
      setErrorMsg(result.error || 'Unable to save payment.');
      return;
    }

    if (result.createdNotifications?.length) {
      void dispatchEmailsIfNeeded(result.createdNotifications);
    }

    if (keepOpen) {
      const tenantLabel = selectedTenant
        ? formatTenantName(selectedTenant)
        : 'Tenant';
      setSessionSaved((prev) => [
        {
          id: result.paymentId || `${Date.now()}`,
          systemRef: result.systemRef || 'Saved',
          tenantName: tenantLabel,
          categoryLabel:
            allocationMode === 'split' ? 'Split Allocation' : activeCategoryLabel,
          year: resolvedRentYear,
          amount: parsedAmount,
        },
        ...prev,
      ]);
      setAmountStr('');
      setAmountTouched(false);
      setBankReference('');
      setNotes('');
      setTimeReceived('');
      setInlineExpectedTouched(false);
      setAllocMap({});
      setErrorMsg('');
    } else {
      setOpenRecordPaymentModal(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSave(false);
  };

  const sessionTotalAmount = sessionSaved.reduce((s, item) => s + item.amount, 0);
  const splitInvalid = allocationMode === 'split' && splitAllocatedTotal > parsedAmount + 0.01;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-payment-title"
    >
      <div
        className="w-full max-w-2xl rounded-2xl border max-h-[92vh] flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
          boxShadow: 'var(--shadow-sheet)',
        }}
      >
        <div
          className="px-5 py-4 border-b flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <div className="min-w-0">
            <h3 id="record-payment-title" className="hig-headline">
              Record Confirmed Payment
            </h3>
            <p className="hig-footnote mt-0.5">
              Select payment type, year, and amount — separates Rent, Security Levy, and custom dues automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpenRecordPaymentModal(false)}
            className="hig-touch-icon shrink-0"
            aria-label="Close record payment modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {sessionSaved.length > 0 && (
            <div
              className="p-3.5 rounded-xl border space-y-1.5"
              style={{
                backgroundColor: 'var(--status-success-bg)',
                borderColor: 'color-mix(in srgb, var(--status-success-ink) 25%, transparent)',
                color: 'var(--status-success-ink)',
              }}
            >
              <div className="flex items-center justify-between gap-2 text-[0.875rem] font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Saved {sessionSaved.length} payment{sessionSaved.length === 1 ? '' : 's'} this session ({formatNaira(sessionTotalAmount)})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setOpenRecordPaymentModal(false)}
                  className="text-[0.75rem] underline font-medium"
                >
                  Done &amp; Close
                </button>
              </div>
              <p className="hig-caption font-mono-nums" style={{ color: 'var(--status-success-ink)' }}>
                {sessionSaved
                  .slice(0, 3)
                  .map((s) => `${s.systemRef}: ${s.tenantName} · ${s.year} ${s.categoryLabel} (${formatNaira(s.amount)})`)
                  .join(' | ')}
                {sessionSaved.length > 3 ? ` (+${sessionSaved.length - 3} more)` : ''}
              </p>
            </div>
          )}

          {errorMsg && (
            <div
              className="p-3.5 rounded-xl text-[0.875rem] flex items-center gap-2"
              style={{
                backgroundColor: 'var(--status-danger-bg)',
                color: 'var(--status-danger-ink)',
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 1: Tenant & Agreement */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pay-tenant" className="block hig-footnote mb-1.5">
                Tenant
              </label>
              <select
                id="pay-tenant"
                value={tenantId}
                onChange={(e) => handleSelectTenant(e.target.value)}
                className="hig-input w-full"
                required
              >
                {activeTenants.map((t) => {
                  const ag = state.agreements.find((a) => a.tenantId === t.id && a.status === 'Active');
                  const unit = ag ? state.units.find((u) => u.id === ag.unitId) : undefined;
                  return (
                    <option key={t.id} value={t.id}>
                      {formatTenantName(t)} {unit ? `(${unit.code} · ${unit.name})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label htmlFor="pay-agreement" className="block hig-footnote mb-1.5">
                Tenancy Agreement
              </label>
              <select
                id="pay-agreement"
                value={agreementId}
                onChange={(e) => {
                  setAgreementId(e.target.value);
                  setInlineExpectedTouched(false);
                }}
                className="hig-input w-full"
                required
              >
                {tenantAgreements.map((ag) => {
                  const unit = state.units.find((u) => u.id === ag.unitId);
                  return (
                    <option key={ag.id} value={ag.id}>
                      {unit?.code} · {ag.status} · {formatNaira(ag.agreedRent)}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {(tenantMissingEmail || tenantMissingPhone) && selectedTenant && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface-secondary)] text-[0.8125rem] text-[var(--ink-secondary)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-[var(--ink-tertiary)]" />
              <span>
                {tenantMissingEmail && tenantMissingPhone
                  ? 'No phone or email on file for this tenant — payment saves cleanly without queuing tenant SMS/email.'
                  : tenantMissingEmail
                  ? 'No email on file for this tenant — confirmation email will be skipped cleanly.'
                  : 'No phone number on file for this tenant — SMS confirmation is unavailable.'}
              </span>
            </div>
          )}

          {/* Step 2: Category-First Selection & Year / Split Mode */}
          <div className="hig-card-inset p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="hig-subhead font-semibold text-[var(--ink-primary)]">
                  Payment Category &amp; Year
                </h4>
                <p className="hig-caption">
                  Keep Rent, Security Levy, and other dues cleanly separated per year.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  allocationMode === 'guided'
                    ? handleSwitchToSplitMode()
                    : setAllocationMode('guided')
                }
                className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[0.8125rem] font-medium border transition-colors"
                style={
                  allocationMode === 'split'
                    ? {
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-contrast)',
                        borderColor: 'var(--accent)',
                      }
                    : {
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--ink-primary)',
                        borderColor: 'var(--border-hairline)',
                      }
                }
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {allocationMode === 'split'
                    ? 'Back to Single Category'
                    : 'Split Across Multiple Obligations'}
                </span>
              </button>
            </div>

            {allocationMode === 'guided' ? (
              <>
                {/* Category Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="hig-caption font-semibold uppercase tracking-[0.03em]">
                      1. Type of Payment
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCategoryForm((v) => !v);
                        setNewCatError('');
                      }}
                      className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-[var(--accent-ink)] hover:underline min-h-[32px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add New Category</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'rent' as CategoryKey, label: 'Annual Rent', subtitle: `${state.settings.lawyerCommissionRatePercent}% comm.` },
                      { key: 'levy' as CategoryKey, label: 'Security Levy', subtitle: 'No comm.' },
                      ...customCategories.map((c) => ({
                        key: `custom:${c.id}` as CategoryKey,
                        label: c.label,
                        subtitle: c.commissionEligible
                          ? `${state.settings.lawyerCommissionRatePercent}% comm.`
                          : 'No comm.',
                      })),
                    ].map((opt) => {
                      const active = categoryKey === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => handleSelectCategory(opt.key)}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-[0.8125rem] font-semibold transition-all border inline-flex items-center gap-1.5"
                          style={
                            active
                              ? {
                                  backgroundColor: 'var(--accent)',
                                  color: 'var(--accent-contrast)',
                                  borderColor: 'var(--accent)',
                                }
                              : {
                                  backgroundColor: 'var(--bg-surface)',
                                  color: 'var(--ink-primary)',
                                  borderColor: 'var(--border-hairline)',
                                }
                          }
                        >
                          <span>{opt.label}</span>
                          <span
                            className="text-[0.6875rem] font-normal opacity-80"
                          >
                            ({opt.subtitle})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {showNewCategoryForm && (
                    <div
                      className="hig-card p-3.5 space-y-3 border"
                      style={{ borderColor: 'var(--accent-ink)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="hig-subhead font-semibold text-[var(--ink-primary)] inline-flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-[var(--accent-ink)]" />
                          <span>Create Payment Category</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowNewCategoryForm(false)}
                          className="hig-touch-icon"
                          aria-label="Close new category form"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {newCatError && (
                        <p className="text-[0.8125rem]" style={{ color: 'var(--status-danger-ink)' }}>
                          {newCatError}
                        </p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="new-cat-name" className="block hig-caption mb-1">
                            Category Name
                          </label>
                          <input
                            id="new-cat-name"
                            type="text"
                            value={newCatLabel}
                            onChange={(e) => setNewCatLabel(e.target.value)}
                            placeholder="e.g. Waste Levy, Generator Fuel"
                            className="hig-input w-full"
                          />
                        </div>
                        <div>
                          <label htmlFor="new-cat-default" className="block hig-caption mb-1">
                            Default Amount (Optional ₦)
                          </label>
                          <CurrencyInput
                            id="new-cat-default"
                            min={0}
                            value={newCatDefaultStr}
                            onValueChange={(raw) => setNewCatDefaultStr(raw)}
                            placeholder="e.g. 5,000"
                            className="hig-input w-full"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-[0.8125rem] text-[var(--ink-primary)] cursor-pointer min-h-[38px]">
                          <input
                            type="checkbox"
                            checked={newCatCommission}
                            onChange={(e) => setNewCatCommission(e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          <span>
                            Apply lawyer commission ({state.settings.lawyerCommissionRatePercent}%) to this category
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={handleCreateNewCategory}
                          className="hig-btn-primary !min-h-[38px] !py-1.5"
                        >
                          Save Category
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Year / Cycle Selector */}
                <div className="space-y-2">
                  <span className="block hig-caption font-semibold uppercase tracking-[0.03em]">
                    2. Year / Cycle Paid For
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {RENT_YEAR_PRESETS.map((yr) => {
                      const active = yearMode === yr;
                      return (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => handleSelectYear(yr)}
                          className="min-h-[38px] px-3 rounded-xl text-[0.8125rem] font-semibold font-mono-nums transition-colors border"
                          style={
                            active
                              ? {
                                  backgroundColor: 'var(--accent)',
                                  color: 'var(--accent-contrast)',
                                  borderColor: 'var(--accent)',
                                }
                              : {
                                  backgroundColor: 'var(--bg-surface)',
                                  color: 'var(--ink-primary)',
                                  borderColor: 'var(--border-hairline)',
                                }
                          }
                        >
                          {yr}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => handleSelectYear('custom')}
                      className="min-h-[38px] px-3 rounded-xl text-[0.8125rem] font-semibold transition-colors border"
                      style={
                        yearMode === 'custom'
                          ? {
                              backgroundColor: 'var(--accent)',
                              color: 'var(--accent-contrast)',
                              borderColor: 'var(--accent)',
                            }
                          : {
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--ink-primary)',
                              borderColor: 'var(--border-hairline)',
                            }
                      }
                    >
                      Custom…
                    </button>
                    {yearMode === 'custom' && (
                      <input
                        type="text"
                        value={customYear}
                        onChange={(e) => {
                          setCustomYear(e.target.value);
                          setInlineExpectedTouched(false);
                        }}
                        placeholder="e.g. 2025/2026"
                        aria-label="Custom cycle year"
                        className="hig-input w-36 font-mono-nums"
                      />
                    )}
                  </div>
                </div>

                {/* Live Matched Obligation or Unbilled Setup */}
                {matchingObligation ? (
                  <div className="hig-card p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="hig-subhead font-semibold text-[var(--ink-primary)]">
                          {matchingObligation.obligation.rentalPeriodLabel}
                        </span>
                        <StatusBadge
                          label={getObligationCategoryLabel(matchingObligation.obligation)}
                          tone="neutral"
                        />
                        <StatusBadge label={matchingObligation.settlementPosition} />
                        {matchingObligation.settlementPosition !== 'Paid / Settled' && (
                          <StatusBadge label={matchingObligation.dueDatePosition} />
                        )}
                      </div>
                      {matchingObligation.amountOutstanding > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setAmountStr(String(matchingObligation.amountOutstanding));
                            setAmountTouched(true);
                          }}
                          className="min-h-[34px] px-2.5 rounded-lg text-[12px] font-semibold bg-[var(--bg-surface-secondary)] text-[var(--accent-ink)] hover:bg-[var(--bg-surface-tertiary)]"
                        >
                          Fill Remaining ({formatNaira(matchingObligation.amountOutstanding)})
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[0.8125rem] tabular-nums">
                      <div>
                        <span className="hig-caption block">Expected Charge</span>
                        <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
                          {formatNaira(matchingObligation.obligation.originalAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="hig-caption block">Paid Previously</span>
                        <span
                          className="font-mono-nums font-semibold"
                          style={{ color: 'var(--status-success-ink)' }}
                        >
                          {formatNaira(matchingObligation.amountAllocated)}
                        </span>
                      </div>
                      <div>
                        <span className="hig-caption block">Remaining Now</span>
                        <span
                          className="font-mono-nums font-semibold"
                          style={{
                            color:
                              matchingObligation.amountOutstanding > 0
                                ? 'var(--status-danger-ink)'
                                : 'var(--status-success-ink)',
                          }}
                        >
                          {formatNaira(matchingObligation.amountOutstanding)}
                        </span>
                      </div>
                    </div>

                    {matchingObligation.amountOutstanding <= 0 ? (
                      <p
                        className="hig-caption pt-1 border-t"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--status-success-ink)',
                        }}
                      >
                        This obligation is already 100% settled. Any additional payment recorded here will be stored as unapplied credit unless you select another year or category.
                      </p>
                    ) : parsedAmount > 0 ? (
                      <p
                        className="hig-caption pt-1 border-t font-medium"
                        style={{
                          borderColor: 'var(--border-subtle)',
                          color:
                            guidedObligationRemainingAfter === 0
                              ? 'var(--status-success-ink)'
                              : 'var(--status-warning-ink)',
                        }}
                      >
                        {guidedObligationRemainingAfter === 0
                          ? `After saving: Paid / Settled (${formatNaira(guidedAllocatedAmount)} applied${
                              guidedUnappliedAmount > 0
                                ? ` + ${formatNaira(guidedUnappliedAmount)} unapplied credit`
                                : ''
                            }).`
                          : `After saving: Partially Paid — ${formatNaira(
                              guidedObligationRemainingAfter
                            )} will remain on ${matchingObligation.obligation.rentalPeriodLabel}.`}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="hig-card p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="hig-subhead font-semibold text-[var(--ink-primary)] block">
                          No {effectiveYear} {activeCategoryLabel} obligation on file yet
                        </span>
                        <span className="hig-caption">
                          Create &amp; reconcile it in one step below (ideal for 2025 handover dues or new charges).
                        </span>
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 text-[0.8125rem] font-medium text-[var(--ink-primary)] cursor-pointer min-h-[36px]">
                      <input
                        type="checkbox"
                        checked={createUnbilledObligation}
                        onChange={(e) => setCreateUnbilledObligation(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span>
                        Create &amp; settle &quot;{effectiveYear} {activeCategoryLabel}&quot; obligation on save
                      </span>
                    </label>

                    {createUnbilledObligation && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="inline-expected-amt" className="block hig-caption mb-1">
                            Expected {activeCategoryLabel} Amount (₦)
                          </label>
                          <CurrencyInput
                            id="inline-expected-amt"
                            min={1}
                            value={inlineExpectedStr}
                            onValueChange={(raw) => {
                              setInlineExpectedTouched(true);
                              setInlineExpectedStr(raw);
                            }}
                            placeholder={
                              parsedAmount > 0 ? String(parsedAmount) : 'e.g. 4,000'
                            }
                            className="hig-input w-full"
                          />
                        </div>
                        <div>
                          <label htmlFor="inline-due-date" className="block hig-caption mb-1">
                            Charge Due Date
                          </label>
                          <input
                            id="inline-due-date"
                            type="date"
                            value={inlineDueDate}
                            onChange={(e) => setInlineDueDate(e.target.value)}
                            className="hig-input w-full font-mono-nums"
                          />
                        </div>
                      </div>
                    )}

                    {createUnbilledObligation && parsedAmount > 0 && effectiveInlineExpected > 0 && (
                      <p
                        className="hig-caption font-medium"
                        style={{
                          color:
                            guidedObligationRemainingAfter === 0
                              ? 'var(--status-success-ink)'
                              : 'var(--status-warning-ink)',
                        }}
                      >
                        Calculation: Expected {formatNaira(effectiveInlineExpected)} − Paying{' '}
                        {formatNaira(parsedAmount)} →{' '}
                        {guidedObligationRemainingAfter === 0
                          ? `Paid / Settled${
                              guidedUnappliedAmount > 0
                                ? ` (+ ${formatNaira(guidedUnappliedAmount)} unapplied credit)`
                                : ''
                            }`
                          : `Partially Paid (${formatNaira(guidedObligationRemainingAfter)} remaining)`}
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Split Across Multiple Obligations Mode */
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="hig-caption">
                    Split one payment across multiple cycles or dues (e.g. 2025 + 2026 Rent + Security Levy).
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddCycle((v) => !v)}
                      className="hig-btn-secondary whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Obligation</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAutoAllocateSplit}
                      className="hig-btn-secondary whitespace-nowrap"
                    >
                      Auto-Allocate
                    </button>
                  </div>
                </div>

                {settledObligations.length > 0 && (
                  <p className="hig-caption tabular-nums">
                    Already settled for this tenant:{' '}
                    <span className="font-medium text-[var(--status-success-ink)]">
                      {settledObligations.map((c) => c.obligation.rentalPeriodLabel).join(', ')}
                    </span>
                  </p>
                )}

                {showAddCycle && (
                  <AddCycleObligationInline
                    agreement={selectedAgreement}
                    suggestedYear={suggestedNewYear}
                    onCancel={() => setShowAddCycle(false)}
                    onCreated={() => {
                      setShowAddCycle(false);
                    }}
                  />
                )}

                {openObligations.length === 0 ? (
                  <p className="hig-subhead py-2">
                    No unpaid obligations for this tenant. Add an obligation above or save as Unapplied Credit.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {openObligations.map((co) => {
                      const val = allocMap[co.obligation.id] ?? 0;
                      return (
                        <div
                          key={co.obligation.id}
                          className="hig-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="hig-subhead font-semibold text-[var(--ink-primary)]">
                                {co.obligation.rentalPeriodLabel}
                              </span>
                              <StatusBadge
                                label={getObligationCategoryLabel(co.obligation)}
                                tone="neutral"
                              />
                              <StatusBadge label={co.dueDatePosition} />
                            </div>
                            <p className="hig-caption mt-1 tabular-nums">
                              Due {formatDateShort(co.obligation.dueDate)} · Outstanding:{' '}
                              <span className="font-semibold text-[var(--ink-primary)]">
                                {formatNaira(co.amountOutstanding)}
                              </span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <label className="sr-only" htmlFor={`alloc-${co.obligation.id}`}>
                              Allocate to {co.obligation.rentalPeriodLabel}
                            </label>
                            <CurrencyInput
                              id={`alloc-${co.obligation.id}`}
                              min={0}
                              max={co.amountOutstanding}
                              value={val || ''}
                              onValueChange={(_, num) => {
                                const clamped = Math.max(0, Math.min(co.amountOutstanding, num));
                                setAllocMap((prev) => ({
                                  ...prev,
                                  [co.obligation.id]: clamped,
                                }));
                              }}
                              placeholder="0"
                              className="hig-input w-full sm:w-36"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div
                  className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t text-[0.8125rem]"
                  style={{ borderColor: 'var(--border-hairline)' }}
                >
                  <div>
                    <span className="hig-caption block">Total Received</span>
                    <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
                      {formatNaira(parsedAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="hig-caption block">Allocated</span>
                    <span
                      className="font-mono-nums font-semibold"
                      style={{ color: 'var(--status-success-ink)' }}
                    >
                      {formatNaira(splitAllocatedTotal)}
                    </span>
                  </div>
                  <div>
                    <span className="hig-caption block">Unapplied Credit</span>
                    <span
                      className="font-mono-nums font-semibold"
                      style={{
                        color: 'var(--status-warning-ink)',
                      }}
                    >
                      {formatNaira(Math.max(0, parsedAmount - splitAllocatedTotal))}
                    </span>
                  </div>
                  <div>
                    <span className="hig-caption block">Remaining Balance</span>
                    <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
                      {formatNaira(Math.max(0, totalOpenBalance - splitAllocatedTotal))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Amount, Date, Time, Method & Bank Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="pay-amount" className="block hig-footnote mb-1.5">
                Amount Confirmed (₦)
              </label>
              <CurrencyInput
                id="pay-amount"
                min={1}
                value={amountStr}
                onValueChange={(raw) => {
                  setAmountStr(raw);
                  setAmountTouched(true);
                }}
                placeholder="e.g. 60,000"
                className="hig-input w-full"
                required
              />
            </div>

            <div>
              <label htmlFor="pay-date" className="block hig-footnote mb-1.5">
                Date Hit Account
              </label>
              <input
                id="pay-date"
                type="date"
                value={dateReceived}
                onChange={(e) => setDateReceived(e.target.value)}
                className="hig-input w-full font-mono-nums"
                required
              />
            </div>

            <div>
              <label htmlFor="pay-time" className="block hig-footnote mb-1.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Time Hit Account</span>
              </label>
              <input
                id="pay-time"
                type="time"
                step={1}
                value={timeReceived}
                onChange={(e) => setTimeReceived(e.target.value)}
                className="hig-input w-full font-mono-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pay-method" className="block hig-footnote mb-1.5">
                Payment Method
              </label>
              <select
                id="pay-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="hig-input w-full"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="POS">POS</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Prior Manager / Handover">Prior Manager / Handover</option>
              </select>
              {method === 'Prior Manager / Handover' && (
                <p className="hig-caption mt-1 text-[var(--ink-secondary)]">
                  Counted in portfolio collections and tagged as collected prior to handover.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="pay-ref" className="block hig-footnote mb-1.5">
                Bank / Payment Reference
              </label>
              <input
                id="pay-ref"
                type="text"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="e.g. GTB-NIP-4410928 or Handover-2025"
                className="hig-input w-full font-mono-nums"
              />
            </div>
          </div>

          {isDuplicateRef && (
            <p
              className="hig-caption flex items-center gap-1.5"
              style={{ color: 'var(--status-warning-ink)' }}
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>
                Warning: Another confirmed payment already uses reference &quot;{bankReference}&quot;. Flagged for review.
              </span>
            </p>
          )}

          <div>
            <label htmlFor="pay-notes" className="block hig-footnote mb-1.5">
              Bank Statement Description / Narration
            </label>
            <textarea
              id="pay-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional transfer narration, sender details, or handover note..."
              className="hig-input w-full min-h-[72px]"
            />
          </div>

          <div className="space-y-2.5 pt-1">
            <label className="flex items-start gap-2.5 text-[0.875rem] text-[var(--ink-primary)] cursor-pointer select-none min-h-[44px]">
              <input
                type="checkbox"
                checked={sendEmailImmediately && !simulateFailure}
                disabled={simulateFailure}
                onChange={(e) => setSendEmailImmediately(e.target.checked)}
                className="w-4 h-4 mt-1 rounded shrink-0"
              />
              <span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Mail className="w-4 h-4 text-[var(--accent-ink)]" />
                  Immediately send receipt request email via Gmail/SMTP on save
                </span>
                <span className="block hig-caption mt-0.5">
                  {isGmailConnected
                    ? `Active transport: Gmail OAuth (${gmailUser?.email || 'signed in'}).`
                    : status?.smtpConfigured
                    ? `Active transport: Server SMTP (${status.smtpFrom || status.smtpHost}).`
                    : 'No live email client connected yet — emails will queue safely in Notifications.'}
                </span>
              </span>
            </label>

            <label className="flex items-center gap-2.5 text-[0.875rem] text-[var(--ink-secondary)] cursor-pointer select-none min-h-[44px]">
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={(e) => setSimulateFailure(e.target.checked)}
                className="w-4 h-4 rounded shrink-0"
              />
              <span>
                Simulate SMS/email gateway outage on dispatch (verifies payment persists independently)
              </span>
            </label>
          </div>

          <div
            className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <button
              type="button"
              onClick={() => setOpenRecordPaymentModal(false)}
              className="hig-btn-secondary"
            >
              {sessionSaved.length > 0 ? 'Done' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => executeSave(true)}
              disabled={parsedAmount <= 0 || splitInvalid}
              className="hig-btn-secondary"
              style={{
                color: 'var(--accent-ink)',
                borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)',
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Save &amp; Add Another</span>
            </button>
            <button
              type="submit"
              disabled={parsedAmount <= 0 || splitInvalid}
              className="hig-btn-primary"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm &amp; Save Payment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
