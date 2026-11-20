import React, { useState } from 'react';
import { AlertTriangle, BellOff, BellRing, Calendar, FileText, Pencil, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import type { BehaviourIndicator, RentCycle } from '../types/rental';
import { formatDateShort, formatNaira, formatPaymentTimestamp, parseCurrencyValue } from '../utils/format';
import { analyzeTenantArrears } from '../utils/multiYearArrears';
import { getEffectivePaymentRentYear } from '../utils/paymentReconciliation';
import { AddCycleObligationInline } from './AddCycleObligationInline';
import { CurrencyInput } from './CurrencyInput';
import { DeleteTenantConfirmModal, EditTenantModal } from './PortfolioEditModals';
import { StatusBadge } from './StatusBadge';

export function TenantInspectorDrawer() {
  const {
    state,
    computedObligations,
    tenantBehaviours,
    evaluatedCommitments,
    selectedTenantIdForDrawer,
    setSelectedTenantIdForDrawer,
    setPreselectedTenantForPayment,
    setOpenRecordPaymentModal,
    setEditingPaymentId,
    openComposerFor,
    openCalendarSyncFor,
    toggleTenantNotificationPause,
    overrideTenantBehaviour,
    renewAgreement,
    toggleObligationReview,
  } = useRentalStore();

  const [showRenewForm, setShowRenewForm] = useState(false);
  const [renewRent, setRenewRent] = useState('');
  const [renewLevy, setRenewLevy] = useState(String(state.settings.securityLevyAmount));
  const [renewStart, setRenewStart] = useState('2027-09-01');
  const [renewEnd, setRenewEnd] = useState('2028-08-31');
  const [renewDue, setRenewDue] = useState('2027-09-01');
  const [renewCycle, setRenewCycle] = useState<RentCycle>('Yearly');
  const [renewLabel, setRenewLabel] = useState('2027/2028 Renewal Rent');
  const [renewError, setRenewError] = useState('');

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideValue, setOverrideValue] = useState<BehaviourIndicator | ''>('');
  const [overrideReason, setOverrideReason] = useState('');

  const [pauseReason, setPauseReason] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddCycleForm, setShowAddCycleForm] = useState(false);

  if (!selectedTenantIdForDrawer) return null;

  const tenant = state.tenants.find((t) => t.id === selectedTenantIdForDrawer);
  if (!tenant) return null;

  const tenantAgreements = state.agreements
    .filter((a) => a.tenantId === tenant.id)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const activeAgreement = tenantAgreements.find((a) => a.status === 'Active');

  const tenantObligations = computedObligations.filter(
    (c) => c.obligation.tenantId === tenant.id
  );
  const arrearsProfile = analyzeTenantArrears(tenant.id, computedObligations);
  const totalOutstanding = arrearsProfile.totalOutstanding;
  const tenantPayments = state.payments.filter((p) => p.tenantId === tenant.id);
  const tenantCommitments = evaluatedCommitments.filter(
    (c) => c.commitment.tenantId === tenant.id
  );
  const behaviour = tenantBehaviours[tenant.id] || 'Current';
  const activeUnit = activeAgreement
    ? state.units.find((u) => u.id === activeAgreement.unitId)
    : undefined;

  const handleOpenComposerFromDrawer = () => {
    const lines = [
      ...arrearsProfile.unpaidRentCycles.map(
        (c) => `• ${c.periodLabel}: ${formatNaira(c.amountOutstanding)} (Due ${formatDateShort(c.dueDate)})`
      ),
      ...arrearsProfile.unpaidLevyCycles.map(
        (c) => `• ${c.periodLabel}: ${formatNaira(c.amountOutstanding)}`
      ),
    ];

    openComposerFor({
      directoryRecipientIds: [`tenant:${tenant.id}`],
      linkedTenantId: tenant.id,
      channelMode: 'Both',
      intent: arrearsProfile.isMultiYear ? 'Multi-Year Arrears Notice' : 'Tenant Notice',
      subject:
        totalOutstanding > 0
          ? `${arrearsProfile.isMultiYear ? 'URGENT Multi-Year Arrears' : 'Outstanding Dues'}: ${activeUnit?.code || 'Unit'} — ${tenant.firstName} ${tenant.lastName}`
          : `Tenancy Communication: ${activeUnit?.code || 'Unit'} — ${state.property.name}`,
      emailBody:
        totalOutstanding > 0
          ? `Dear ${tenant.firstName} ${tenant.lastName},\n\nOur ledger for ${activeUnit?.code || 'your unit'} at ${state.property.name} shows a total open balance of ${formatNaira(totalOutstanding)}:\n\n${lines.join('\n')}\n\nPlease remit payment and confirm details with ${state.property.managerName}.\n\nRegards,\n${state.property.managerName}`
          : `Dear ${tenant.firstName} ${tenant.lastName},\n\nWriting from ${state.property.name} regarding ${activeUnit?.code || 'your tenancy'}.\n\nRegards,\n${state.property.managerName}`,
      smsBody:
        totalOutstanding > 0
          ? `${state.property.name}: Dear ${tenant.firstName}, your ${activeUnit?.code || ''} balance is ${formatNaira(totalOutstanding)} (${arrearsProfile.unpaidYears.join(', ') || 'open dues'}). Please remit & confirm.`
          : `${state.property.name}: Hello ${tenant.firstName}, please contact ${state.property.managerName} regarding ${activeUnit?.code || 'your tenancy'}.`,
    });
  };

  const handleOpenRenew = () => {
    if (activeAgreement) {
      setRenewRent(String(activeAgreement.agreedRent));
      setRenewLevy(String(activeAgreement.securityLevy));
      setRenewCycle(activeAgreement.rentCycle);
      const nextYear = Number(activeAgreement.endDate.slice(0, 4));
      setRenewStart(activeAgreement.endDate);
      setRenewEnd(`${nextYear + 1}${activeAgreement.endDate.slice(4)}`);
      setRenewDue(activeAgreement.endDate);
      setRenewLabel(`${nextYear}/${nextYear + 1} Renewal Rent`);
    }
    setRenewError('');
    setShowRenewForm(true);
  };

  const handleSubmitRenew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAgreement) return;
    const res = renewAgreement({
      previousAgreementId: activeAgreement.id,
      agreedRent: parseCurrencyValue(renewRent),
      securityLevy: parseCurrencyValue(renewLevy),
      rentCycle: renewCycle,
      startDate: renewStart,
      endDate: renewEnd,
      dueDate: renewDue,
      rentalPeriodLabel: renewLabel,
    });
    if (!res.ok) {
      setRenewError(res.error || 'Failed to renew agreement.');
      return;
    }
    setShowRenewForm(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tenant-drawer-title"
    >
      <div className="w-full max-w-2xl bg-[var(--bg-surface)] h-full shadow-[var(--shadow-sheet)] border-l border-[var(--border-hairline)] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 id="tenant-drawer-title" className="hig-title-3">
                {tenant.firstName} {tenant.lastName}
              </h3>
              <StatusBadge label={behaviour} />
              {arrearsProfile.isMultiYear && <StatusBadge label="Multi-Year Debtor" />}
              {tenant.notificationsPaused && <StatusBadge label="Reminders Paused" tone="warning" />}
            </div>
            <p className="hig-footnote mt-1 break-words">
              {tenant.phone} <span aria-hidden="true">·</span> {tenant.email || 'No email'}
              {activeUnit && ` · ${activeUnit.code}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedTenantIdForDrawer(null)}
            className="hig-touch-icon shrink-0"
            aria-label="Close tenant inspector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6">
          {/* Multi-Year / Multiple Dues Alert Banner */}
          {(arrearsProfile.isMultiYear || arrearsProfile.hasMultipleDues) && totalOutstanding > 0 && (
            <div
              className={`p-4 rounded-2xl border flex items-start gap-3 ${
                arrearsProfile.isMultiYear
                  ? 'bg-[var(--status-danger-bg)] border-[var(--status-danger-ink)]/20 text-[var(--status-danger-ink)]'
                  : 'bg-[var(--status-warning-bg)] border-[var(--status-warning-ink)]/20 text-[var(--status-warning-ink)]'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-[13px] space-y-1">
                <p className="font-semibold">
                  {arrearsProfile.isMultiYear
                    ? `Multi-Year Arrears Alert (${arrearsProfile.unpaidYears.length} Cycles: ${arrearsProfile.unpaidYears.join(', ')})`
                    : 'Multiple Dues Open (Rent + Security Levy)'}
                </p>
                <p className="leading-relaxed">
                  Unpaid Rent: <strong className="font-mono-nums">{formatNaira(arrearsProfile.unpaidRentAmount)}</strong> ·
                  Unpaid Security Levy: <strong className="font-mono-nums">{formatNaira(arrearsProfile.unpaidLevyAmount)}</strong> ·
                  Oldest overdue: <strong className="font-mono-nums">{arrearsProfile.maxDaysPastDue}d</strong>
                </p>
              </div>
            </div>
          )}

          {/* Quick Balance & Actions */}
          <div className="hig-card-inset flex flex-col gap-4 p-4 sm:p-5">
            <div>
              <span className="hig-caption uppercase tracking-[0.04em] font-semibold block">
                Total Outstanding Balance
              </span>
              <p className="hig-title-1 font-mono-nums mt-0.5">
                {formatNaira(totalOutstanding)}
              </p>
              <p className="hig-footnote mt-1">
                Historical late cycles recorded:{' '}
                <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
                  {tenant.historicalLateCycles}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenComposerFromDrawer}
                className="hig-btn-secondary"
              >
                <Send className="w-4 h-4" />
                <span>Send SMS / Email</span>
              </button>
              <button
                type="button"
                onClick={() => openCalendarSyncFor(tenant.id)}
                className="hig-btn-secondary"
              >
                <Calendar className="w-4 h-4" />
                <span>Calendar Reminder</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreselectedTenantForPayment(tenant.id);
                  setOpenRecordPaymentModal(true);
                }}
                className="hig-btn-primary"
              >
                Record Payment
              </button>
              {activeAgreement && (
                <button
                  type="button"
                  onClick={handleOpenRenew}
                  className="hig-btn-secondary"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Renew Agreement</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                className="hig-btn-secondary"
                aria-label={`Edit details for ${tenant.firstName} ${tenant.lastName}`}
              >
                <Pencil className="w-4 h-4" />
                <span>Edit Details</span>
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="hig-btn-secondary"
                style={{ color: 'var(--status-danger-ink)' }}
                aria-label={`Delete ${tenant.firstName} ${tenant.lastName}`}
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* Notification Hold & Behaviour Override Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="hig-card p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="hig-subhead font-semibold text-[var(--ink-primary)]">Reminder Controls</span>
                <button
                  type="button"
                  onClick={() => {
                    const reason =
                      pauseReason.trim() ||
                      (tenant.notificationsPaused ? 'Resumed by Property Manager' : 'Temporary payment arrangement hold');
                    toggleTenantNotificationPause(tenant.id, !tenant.notificationsPaused, reason);
                    setPauseReason('');
                  }}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:underline"
                >
                  {tenant.notificationsPaused ? (
                    <>
                      <BellRing className="w-4 h-4 text-[var(--status-success-ink)]" />
                      <span>Resume Reminders</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="w-4 h-4 text-[var(--status-warning-ink)]" />
                      <span>Pause Reminders</span>
                    </>
                  )}
                </button>
              </div>
              <input
                type="text"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder={tenant.pauseReason ? `Note: ${tenant.pauseReason}` : 'Reason for pause/resume...'}
                aria-label="Reason for reminder pause or resume"
                className="hig-input w-full"
              />
            </div>

            <div className="hig-card p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="hig-subhead font-semibold text-[var(--ink-primary)]">Internal Behaviour Flag</span>
                <button
                  type="button"
                  onClick={() => setOverrideOpen(!overrideOpen)}
                  className="min-h-[44px] px-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:underline"
                >
                  {overrideOpen ? 'Close' : 'Override'}
                </button>
              </div>
              <p className="hig-footnote">
                {tenant.behaviourOverride
                  ? `Manual override: ${tenant.behaviourOverride} (${tenant.behaviourOverrideReason})`
                  : 'Auto-evaluated from payment history (internal only).'}
              </p>
              {overrideOpen && (
                <div className="space-y-2.5 pt-1">
                  <select
                    value={overrideValue}
                    onChange={(e) => setOverrideValue(e.target.value as BehaviourIndicator | '')}
                    aria-label="Override tenant behaviour"
                    className="hig-input w-full"
                  >
                    <option value="">Auto-calculated</option>
                    <option value="Current">Current</option>
                    <option value="Occasional Late Payment">Occasional Late Payment</option>
                    <option value="Repeated Late Payment">Repeated Late Payment</option>
                    <option value="Persistent Arrears">Persistent Arrears</option>
                    <option value="Chronic Delinquency">Chronic Delinquency</option>
                    <option value="Under Review">Under Review</option>
                  </select>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Audit reason..."
                      aria-label="Behaviour override audit reason"
                      className="hig-input flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        overrideTenantBehaviour(
                          tenant.id,
                          overrideValue || undefined,
                          overrideReason || 'Property Manager review'
                        );
                        setOverrideOpen(false);
                      }}
                      className="hig-btn-primary"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Renew Agreement Inline Form */}
          {showRenewForm && activeAgreement && (
            <form
              onSubmit={handleSubmitRenew}
              className="hig-card-inset p-4 space-y-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="hig-subhead font-semibold text-[var(--ink-primary)]">
                  Renew Agreement (Preserves Previous Terms)
                </h4>
                <button
                  type="button"
                  onClick={() => setShowRenewForm(false)}
                  className="min-h-[44px] px-2.5 text-[12.5px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                >
                  Cancel
                </button>
              </div>
              {renewError && (
                <p className="text-[12.5px] text-[var(--status-danger-ink)] bg-[var(--status-danger-bg)] px-3 py-2 rounded-xl">
                  {renewError}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block hig-caption font-semibold mb-1.5">
                    New Rent (₦)
                  </label>
                  <CurrencyInput
                    min={1}
                    value={renewRent}
                    onValueChange={(raw) => setRenewRent(raw)}
                    placeholder="e.g. 4,000,000"
                    required
                  />
                </div>
                <div>
                  <label className="block hig-caption font-semibold mb-1.5">
                    Security Levy (₦)
                  </label>
                  <CurrencyInput
                    min={0}
                    value={renewLevy}
                    onValueChange={(raw) => setRenewLevy(raw)}
                    placeholder="e.g. 4,000"
                  />
                </div>
                <div>
                  <label className="block hig-caption font-semibold mb-1.5">
                    Rent Cycle
                  </label>
                  <select
                    value={renewCycle}
                    onChange={(e) => setRenewCycle(e.target.value as RentCycle)}
                    className="hig-input w-full"
                  >
                    <option value="Yearly">Yearly</option>
                    <option value="Bi-Annual">Bi-Annual</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block hig-caption font-semibold mb-1.5">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={renewStart}
                    onChange={(e) => setRenewStart(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block hig-caption font-semibold mb-1.5">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={renewEnd}
                    onChange={(e) => setRenewEnd(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block hig-caption font-semibold mb-1.5">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={renewDue}
                    onChange={(e) => setRenewDue(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <input
                  type="text"
                  value={renewLabel}
                  onChange={(e) => setRenewLabel(e.target.value)}
                  placeholder="Period label (e.g. 2027/2028 Renewal Rent)"
                  className="hig-input flex-1"
                  required
                />
                <button
                  type="submit"
                  className="hig-btn-primary shrink-0"
                >
                  Confirm Renewal
                </button>
              </div>
            </form>
          )}

          {/* Tenancy Agreements History */}
          <div>
            <h4 className="hig-caption uppercase tracking-[0.04em] font-semibold mb-2.5">
              Tenancy Agreements ({tenantAgreements.length})
            </h4>
            <div className="hig-card divide-y divide-[var(--border-subtle)] overflow-hidden">
              {tenantAgreements.map((ag) => {
                const unit = state.units.find((u) => u.id === ag.unitId);
                return (
                  <div key={ag.id} className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="hig-subhead font-semibold text-[var(--ink-primary)]">
                          {unit?.code} · {unit?.name}
                        </span>
                        <StatusBadge label={ag.status} />
                      </div>
                      <p className="hig-footnote mt-1 tabular-nums">
                        {formatDateShort(ag.startDate)} – {formatDateShort(ag.endDate)} · {ag.rentCycle} · Levy {formatNaira(ag.securityLevy)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[15px] font-semibold font-mono-nums text-[var(--ink-primary)]">
                        {formatNaira(ag.agreedRent)}
                      </span>
                      <span className="block hig-caption">Agreed Rent</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Obligations */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h4 className="hig-caption uppercase tracking-[0.04em] font-semibold">
                Rental Obligations ({tenantObligations.length})
              </h4>
              {activeAgreement && (
                <button
                  type="button"
                  onClick={() => setShowAddCycleForm((v) => !v)}
                  className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg text-[12px] font-semibold text-[var(--accent-ink)] bg-[var(--bg-surface-secondary)] hover:bg-[var(--bg-surface-tertiary)]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Rent Year</span>
                </button>
              )}
            </div>
            {showAddCycleForm && activeAgreement && (
              <div className="mb-3">
                <AddCycleObligationInline
                  agreement={activeAgreement}
                  suggestedYear="2027"
                  onCancel={() => setShowAddCycleForm(false)}
                  onCreated={() => setShowAddCycleForm(false)}
                />
              </div>
            )}
            <div className="hig-card divide-y divide-[var(--border-subtle)] overflow-hidden">
              {tenantObligations.map((co) => (
                <div key={co.obligation.id} className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="hig-subhead font-semibold text-[var(--ink-primary)]">
                        {co.obligation.rentalPeriodLabel}
                      </span>
                      <StatusBadge label={co.settlementPosition} />
                      <StatusBadge label={co.dueDatePosition} />
                    </div>
                    <p className="hig-footnote mt-1 tabular-nums">
                      Due {formatDateShort(co.obligation.dueDate)} · Paid {formatNaira(co.amountAllocated)} of {formatNaira(co.obligation.originalAmount)}
                      {co.daysPastDue > 0 && ` · ${co.daysPastDue}d past due`}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-left sm:text-right">
                      <span className="text-[14px] font-semibold font-mono-nums text-[var(--ink-primary)]">
                        {formatNaira(co.amountOutstanding)}
                      </span>
                      <span className="block hig-caption">Balance</span>
                    </div>
                    {co.amountOutstanding > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          toggleObligationReview(
                            co.obligation.id,
                            !co.obligation.underReview,
                            co.obligation.underReview
                              ? 'Cleared dispute/review'
                              : 'Flagged under review by Property Manager'
                          )
                        }
                        className="hig-btn-secondary px-3 text-[12px]"
                      >
                        {co.obligation.underReview ? 'Clear Review' : 'Flag Review'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Commitments & Payments */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h4 className="hig-caption uppercase tracking-[0.04em] font-semibold mb-2">
                Promises to Pay ({tenantCommitments.length})
              </h4>
              {tenantCommitments.length === 0 ? (
                <p className="hig-footnote">No payment commitments recorded.</p>
              ) : (
                <div className="space-y-2">
                  {tenantCommitments.map((ec) => (
                    <div key={ec.commitment.id} className="hig-card p-3.5 text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
                          {formatNaira(ec.commitment.promisedAmount)}
                        </span>
                        <StatusBadge label={ec.effectiveStatus} />
                      </div>
                      <p className="hig-footnote mt-1">
                        Due {formatDateShort(ec.commitment.extendedUntilDate || ec.commitment.promisedDate)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="hig-caption uppercase tracking-[0.04em] font-semibold mb-2">
                Recent Payments ({tenantPayments.length})
              </h4>
              {tenantPayments.length === 0 ? (
                <p className="hig-footnote">No payments recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {tenantPayments.map((p) => {
                    const rentYear = getEffectivePaymentRentYear(p, state.obligations);
                    return (
                      <div key={p.id} className="hig-card p-3.5 text-[13px] space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
                            {formatNaira(p.amount)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <StatusBadge label={p.status} />
                            {p.status === 'Confirmed' && (
                              <button
                                type="button"
                                onClick={() => setEditingPaymentId(p.id)}
                                aria-label={`Edit payment ${p.systemRef}`}
                                className="inline-flex items-center gap-1 min-h-[32px] px-2 rounded-lg text-[11.5px] font-semibold bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] hover:bg-[var(--bg-surface-tertiary)]"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="hig-footnote flex items-center gap-1.5 tabular-nums">
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            {p.systemRef} · {formatPaymentTimestamp(p.dateReceived, p.timeReceived)}
                          </span>
                        </p>
                        <p className="hig-caption tabular-nums">
                          Year: <strong className="text-[var(--ink-primary)]">{rentYear}</strong>
                          {p.bankReference ? ` · ${p.bankReference}` : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <EditTenantModal
        tenantId={showEditModal ? tenant.id : null}
        onClose={() => setShowEditModal(false)}
      />
      <DeleteTenantConfirmModal
        tenantId={showDeleteModal ? tenant.id : null}
        onClose={() => setShowDeleteModal(false)}
      />
    </div>
  );
}
