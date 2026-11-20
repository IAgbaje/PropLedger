import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Plus, X } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import type { PaymentAllocation, PaymentMethod } from '../types/rental';
import { formatDateShort, formatDateTimeShort, formatNaira, parseCurrencyValue } from '../utils/format';
import {
  deriveRentYearLabel,
  getEffectivePaymentRentYear,
  getObligationReconciliationPool,
} from '../utils/paymentReconciliation';
import { calculateCommissionOnAllocations, checkDuplicateBankReference } from '../utils/rentalEngine';
import { AddCycleObligationInline } from './AddCycleObligationInline';
import { CurrencyInput } from './CurrencyInput';
import { StatusBadge } from './StatusBadge';

const RENT_YEAR_PRESETS = ['2024', '2025', '2026', '2027', '2028', '2025/2026', '2026/2027'];

export function EditPaymentModal() {
  const {
    state,
    editingPaymentId,
    setEditingPaymentId,
    editPayment,
  } = useRentalStore();

  const payment = useMemo(
    () => (editingPaymentId ? state.payments.find((p) => p.id === editingPaymentId) : undefined),
    [editingPaymentId, state.payments]
  );

  const activeTenants = useMemo(
    () => state.tenants.filter((t) => !t.archived || t.id === payment?.tenantId),
    [state.tenants, payment?.tenantId]
  );

  const [tenantId, setTenantId] = useState('');
  const [agreementId, setAgreementId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [dateReceived, setDateReceived] = useState('');
  const [timeReceived, setTimeReceived] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Bank Transfer');
  const [bankReference, setBankReference] = useState('');
  const [rentYearMode, setRentYearMode] = useState<string>('auto');
  const [customRentYear, setCustomRentYear] = useState('');
  const [notes, setNotes] = useState('');
  const [editReason, setEditReason] = useState('');
  const [allocMap, setAllocMap] = useState<Record<string, number>>({});
  const [showAddCycle, setShowAddCycle] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Populate form when opening for a payment
  useEffect(() => {
    if (!payment) return;
    setTenantId(payment.tenantId);
    setAgreementId(payment.agreementId);
    setAmountStr(String(payment.amount));
    setDateReceived(payment.dateReceived);
    setTimeReceived(payment.timeReceived || '');
    setMethod(payment.method);
    setBankReference(payment.bankReference);
    setNotes(payment.notes || '');
    setEditReason('');
    setShowAddCycle(false);
    setErrorMsg('');

    const nextAllocMap: Record<string, number> = {};
    for (const a of payment.allocations) {
      nextAllocMap[a.obligationId] = a.amount;
    }
    setAllocMap(nextAllocMap);

    const existingYear = payment.rentYearCovered?.trim();
    if (!existingYear) {
      setRentYearMode('auto');
      setCustomRentYear('');
    } else if (RENT_YEAR_PRESETS.includes(existingYear)) {
      setRentYearMode(existingYear);
      setCustomRentYear('');
    } else {
      setRentYearMode('custom');
      setCustomRentYear(existingYear);
    }
  }, [payment]);

  const tenantAgreements = useMemo(
    () => state.agreements.filter((a) => a.tenantId === tenantId),
    [state.agreements, tenantId]
  );

  useEffect(() => {
    if (!tenantId) return;
    const stillValid = tenantAgreements.some((a) => a.id === agreementId);
    if (!stillValid) {
      const preferred =
        tenantAgreements.find((a) => a.status === 'Active')?.id || tenantAgreements[0]?.id || '';
      setAgreementId(preferred);
      setAllocMap({});
    }
  }, [tenantId, tenantAgreements, agreementId]);

  const reconciliationPool = useMemo(() => {
    if (!tenantId || !payment) return [];
    return getObligationReconciliationPool(
      tenantId,
      state.obligations,
      state.payments,
      state.referenceDate,
      state.settings.gracePeriodDays,
      payment.id
    );
  }, [
    tenantId,
    payment,
    state.obligations,
    state.payments,
    state.referenceDate,
    state.settings.gracePeriodDays,
  ]);

  if (!editingPaymentId || !payment) return null;

  const selectedAgreement = state.agreements.find((a) => a.id === agreementId);
  const parsedAmount = parseCurrencyValue(amountStr);
  const cleanAllocations: PaymentAllocation[] = Object.entries(allocMap)
    .filter(([, amt]) => amt > 0)
    .map(([obligationId, amount]) => ({ obligationId, amount }));
  const allocatedTotal = cleanAllocations.reduce((s, a) => s + a.amount, 0);
  const unappliedAmount = Math.max(0, Math.round((parsedAmount - allocatedTotal) * 100) / 100);
  const isDuplicateRef = checkDuplicateBankReference(bankReference, state.payments, payment.id);

  const autoDerivedYear = deriveRentYearLabel(cleanAllocations, state.obligations, dateReceived);
  const resolvedRentYear =
    rentYearMode === 'auto'
      ? autoDerivedYear
      : rentYearMode === 'custom'
      ? customRentYear.trim() || autoDerivedYear
      : rentYearMode;

  const { commissionAmount: projectedCommission } = calculateCommissionOnAllocations(
    cleanAllocations,
    state.obligations,
    state.settings.lawyerCommissionRatePercent
  );
  const existingNetCommission = state.commissions
    .filter((c) => c.paymentId === payment.id)
    .reduce((s, c) => s + c.accruedAmount, 0);
  const commissionDelta = Math.round((projectedCommission - existingNetCommission) * 100) / 100;

  const suggestedNewYear = (() => {
    const years = reconciliationPool
      .map((i) => Number(i.cycleYear.slice(0, 4)))
      .filter((y) => Number.isFinite(y));
    const maxYr = years.length > 0 ? Math.max(...years) : 2026;
    return String(Math.max(2026, maxYr + 1));
  })();

  const handleAutoAllocate = () => {
    let remaining = parsedAmount;
    const nextMap: Record<string, number> = {};
    for (const item of reconciliationPool) {
      if (remaining <= 0) break;
      if (item.availableCapacity <= 0) continue;
      const alloc = Math.min(remaining, item.availableCapacity);
      if (alloc > 0) {
        nextMap[item.computed.obligation.id] = Math.round(alloc * 100) / 100;
        remaining = Math.round((remaining - alloc) * 100) / 100;
      }
    }
    setAllocMap(nextMap);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const res = editPayment(payment.id, {
      tenantId,
      agreementId,
      amount: parsedAmount,
      dateReceived,
      timeReceived,
      method,
      bankReference,
      rentYearCovered: resolvedRentYear,
      allocations: cleanAllocations,
      notes,
      editReason,
    });

    if (!res.ok) {
      setErrorMsg(res.error || 'Unable to save payment edits.');
      return;
    }

    setEditingPaymentId(null);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-payment-title"
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
            <div className="flex items-center gap-2 flex-wrap">
              <h3 id="edit-payment-title" className="hig-headline">
                Reconcile &amp; Edit Payment
              </h3>
              <span className="font-mono-nums text-[12.5px] font-semibold px-2 py-0.5 rounded-lg bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)]">
                {payment.systemRef}
              </span>
            </div>
            <p className="hig-footnote mt-0.5 tabular-nums">
              Recorded {formatDateTimeShort(payment.dateRecorded)} by {payment.recordedBy} · Current cycle:{' '}
              <strong className="text-[var(--ink-primary)]">
                {getEffectivePaymentRentYear(payment, state.obligations)}
              </strong>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingPaymentId(null)}
            className="hig-touch-icon shrink-0"
            aria-label="Close edit payment modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
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

          {/* Tenant & Agreement */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-pay-tenant" className="block hig-footnote mb-1.5">
                Tenant
              </label>
              <select
                id="edit-pay-tenant"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="hig-input w-full"
                required
              >
                {activeTenants.map((t) => {
                  const ag = state.agreements.find((a) => a.tenantId === t.id && a.status === 'Active');
                  const unit = ag ? state.units.find((u) => u.id === ag.unitId) : undefined;
                  return (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName} {unit ? `(${unit.code} · ${unit.name})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label htmlFor="edit-pay-agreement" className="block hig-footnote mb-1.5">
                Tenancy Agreement
              </label>
              <select
                id="edit-pay-agreement"
                value={agreementId}
                onChange={(e) => setAgreementId(e.target.value)}
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

          {/* Amount, Exact Date & Exact Time Hit Account */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="edit-pay-amount" className="block hig-footnote mb-1.5">
                Amount Confirmed (₦)
              </label>
              <CurrencyInput
                id="edit-pay-amount"
                min={1}
                value={amountStr}
                onValueChange={(raw) => setAmountStr(raw)}
                placeholder="e.g. 64,000"
                className="hig-input w-full"
                required
              />
            </div>

            <div>
              <label htmlFor="edit-pay-date" className="block hig-footnote mb-1.5">
                Date Hit Account
              </label>
              <input
                id="edit-pay-date"
                type="date"
                value={dateReceived}
                onChange={(e) => setDateReceived(e.target.value)}
                className="hig-input w-full font-mono-nums"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="edit-pay-time" className="hig-footnote flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Time Hit Account</span>
                </label>
                {timeReceived && (
                  <button
                    type="button"
                    onClick={() => setTimeReceived('')}
                    className="text-[11.5px] font-medium text-[var(--accent-ink)] hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                id="edit-pay-time"
                type="time"
                step={1}
                value={timeReceived}
                onChange={(e) => setTimeReceived(e.target.value)}
                className="hig-input w-full font-mono-nums"
              />
            </div>
          </div>

          {/* Method, Bank Ref & Rent Year Covered */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="edit-pay-method" className="block hig-footnote mb-1.5">
                Payment Method
              </label>
              <select
                id="edit-pay-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="hig-input w-full"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="POS">POS</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            <div>
              <label htmlFor="edit-pay-ref" className="block hig-footnote mb-1.5">
                Bank / Payment Reference
              </label>
              <input
                id="edit-pay-ref"
                type="text"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="e.g. GTB-NIP-4410928"
                className="hig-input w-full font-mono-nums"
              />
            </div>

            <div>
              <label htmlFor="edit-pay-year" className="block hig-footnote mb-1.5">
                Rent Year Paid For
              </label>
              <select
                id="edit-pay-year"
                value={rentYearMode}
                onChange={(e) => setRentYearMode(e.target.value)}
                className="hig-input w-full font-mono-nums"
              >
                <option value="auto">Auto ({autoDerivedYear})</option>
                {RENT_YEAR_PRESETS.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} Cycle
                  </option>
                ))}
                <option value="custom">Custom Label…</option>
              </select>
              {rentYearMode === 'custom' && (
                <input
                  type="text"
                  value={customRentYear}
                  onChange={(e) => setCustomRentYear(e.target.value)}
                  placeholder="e.g. 2025 & 2026"
                  aria-label="Custom rent year paid for"
                  className="hig-input w-full mt-2 font-mono-nums"
                />
              )}
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

          {/* Cycle-Year Obligation Reconciliation */}
          <div className="hig-card-inset p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="hig-subhead font-semibold text-[var(--ink-primary)]">
                  Reconcile Across Rent Years &amp; Obligations
                </h4>
                <p className="hig-caption">
                  All cycles for this tenant are shown below (including settled cycles linked to this payment).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCycle((v) => !v)}
                  className="hig-btn-secondary whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Rent Year</span>
                </button>
                <button
                  type="button"
                  onClick={handleAutoAllocate}
                  className="hig-btn-secondary whitespace-nowrap"
                >
                  Auto-Allocate
                </button>
              </div>
            </div>

            {showAddCycle && (
              <AddCycleObligationInline
                agreement={selectedAgreement}
                suggestedYear={suggestedNewYear}
                onCancel={() => setShowAddCycle(false)}
                onCreated={(rentObId, yr) => {
                  setShowAddCycle(false);
                  if (yr && RENT_YEAR_PRESETS.includes(yr)) {
                    setRentYearMode(yr);
                  }
                  if (rentObId) {
                    const remainingToAssign = Math.max(
                      0,
                      Math.round((parsedAmount - allocatedTotal) * 100) / 100
                    );
                    if (remainingToAssign > 0) {
                      setAllocMap((prev) => ({ ...prev, [rentObId]: remainingToAssign }));
                    }
                  }
                }}
              />
            )}

            {reconciliationPool.length === 0 ? (
              <p className="hig-subhead py-2">
                No obligations exist for this tenant yet. Use &quot;Add Rent Year&quot; above or save as Unapplied Credit.
              </p>
            ) : (
              <div className="space-y-2">
                {reconciliationPool.map((item) => {
                  const ob = item.computed.obligation;
                  const val = allocMap[ob.id] ?? 0;
                  const isLockedByOthers = item.availableCapacity <= 0;

                  return (
                    <div
                      key={ob.id}
                      className="hig-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="hig-subhead font-semibold text-[var(--ink-primary)]">
                            {ob.rentalPeriodLabel}
                          </span>
                          <StatusBadge label={ob.chargeType} tone="neutral" />
                          <StatusBadge label={item.computed.settlementPosition} />
                          {item.currentPaymentAllocated > 0 && (
                            <span className="hig-caption font-medium text-[var(--accent-ink)]">
                              Currently allocated: {formatNaira(item.currentPaymentAllocated)}
                            </span>
                          )}
                        </div>
                        <p className="hig-caption mt-1 tabular-nums">
                          Cycle {item.cycleYear} · Due {formatDateShort(ob.dueDate)} · Total{' '}
                          {formatNaira(ob.originalAmount)} · Available for this payment:{' '}
                          <strong className="text-[var(--ink-primary)]">
                            {formatNaira(item.availableCapacity)}
                          </strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isLockedByOthers && (
                          <button
                            type="button"
                            onClick={() => {
                              const otherAllocatedInForm = Object.entries(allocMap)
                                .filter(([id]) => id !== ob.id)
                                .reduce((s, [, amt]) => s + (Number(amt) || 0), 0);
                              const maxAvailFromPayment = Math.max(
                                0,
                                Math.round((parsedAmount - otherAllocatedInForm) * 100) / 100
                              );
                              const fillAmt = Math.min(item.availableCapacity, maxAvailFromPayment);
                              setAllocMap((prev) => ({ ...prev, [ob.id]: fillAmt }));
                            }}
                            className="min-h-[36px] px-2.5 rounded-lg text-[12px] font-semibold bg-[var(--bg-surface-secondary)] text-[var(--accent-ink)] hover:bg-[var(--bg-surface-tertiary)]"
                          >
                            Match
                          </button>
                        )}
                        <label className="sr-only" htmlFor={`edit-alloc-${ob.id}`}>
                          Allocate to {ob.rentalPeriodLabel}
                        </label>
                        <CurrencyInput
                          id={`edit-alloc-${ob.id}`}
                          min={0}
                          max={item.availableCapacity}
                          disabled={isLockedByOthers}
                          value={val || ''}
                          onValueChange={(_, num) => {
                            const clamped = Math.max(0, Math.min(item.availableCapacity, num));
                            setAllocMap((prev) => ({ ...prev, [ob.id]: clamped }));
                          }}
                          placeholder="0"
                          className="hig-input w-full sm:w-32"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reconciliation summary strip */}
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
                  style={{
                    color:
                      allocatedTotal > parsedAmount + 0.01
                        ? 'var(--status-danger-ink)'
                        : 'var(--status-success-ink)',
                  }}
                >
                  {formatNaira(allocatedTotal)}
                </span>
              </div>
              <div>
                <span className="hig-caption block">Unapplied Credit</span>
                <span
                  className="font-mono-nums font-semibold"
                  style={{ color: 'var(--status-warning-ink)' }}
                >
                  {formatNaira(unappliedAmount)}
                </span>
              </div>
              <div>
                <span className="hig-caption block">Commission Impact</span>
                <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
                  {commissionDelta === 0
                    ? `${formatNaira(projectedCommission)} (No change)`
                    : `${commissionDelta > 0 ? '+' : ''}${formatNaira(commissionDelta)}`}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-pay-notes" className="block hig-footnote mb-1.5">
                Bank Statement Description / Notes
              </label>
              <textarea
                id="edit-pay-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Paste bank statement narration, sender details, or transfer note..."
                className="hig-input w-full min-h-[72px]"
              />
            </div>

            <div>
              <label htmlFor="edit-pay-reason" className="block hig-footnote mb-1.5">
                Reconciliation Audit Note
              </label>
              <textarea
                id="edit-pay-reason"
                rows={2}
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. Matched GTB statement timestamp & corrected cycle year to 2025"
                className="hig-input w-full min-h-[72px]"
              />
            </div>
          </div>

          <div
            className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <button
              type="button"
              onClick={() => setEditingPaymentId(null)}
              className="hig-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={parsedAmount <= 0 || allocatedTotal > parsedAmount + 0.01}
              className="hig-btn-primary"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save Reconciliation Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
