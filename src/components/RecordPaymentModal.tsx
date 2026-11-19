import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, X } from 'lucide-react';
import { useIntegrations } from '../context/IntegrationContext';
import { useRentalStore } from '../context/RentalStore';
import type { PaymentAllocation, PaymentMethod } from '../types/rental';
import { sendEmailViaGmail, sendEmailViaSmtp } from '../utils/emailClient';
import { formatDateShort, formatNaira, parseCurrencyValue } from '../utils/format';
import { checkDuplicateBankReference, suggestPaymentAllocations } from '../utils/rentalEngine';
import { CurrencyInput } from './CurrencyInput';
import { StatusBadge } from './StatusBadge';

export function RecordPaymentModal() {
  const {
    state,
    computedObligations,
    openRecordPaymentModal,
    setOpenRecordPaymentModal,
    preselectedTenantForPayment,
    recordPayment,
    updateNotificationRecord,
  } = useRentalStore();
  const { status, isGmailConnected, gmailAccessToken, gmailUser } = useIntegrations();

  const activeTenants = useMemo(
    () => state.tenants.filter((t) => !t.archived),
    [state.tenants]
  );

  const [tenantId, setTenantId] = useState<string>('');
  const [agreementId, setAgreementId] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [dateReceived, setDateReceived] = useState<string>(state.referenceDate);
  const [method, setMethod] = useState<PaymentMethod>('Bank Transfer');
  const [bankReference, setBankReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [allocMap, setAllocMap] = useState<Record<string, number>>({});
  const [sendEmailImmediately, setSendEmailImmediately] = useState<boolean>(
    Boolean(isGmailConnected || status?.smtpConfigured)
  );
  const [simulateFailure, setSimulateFailure] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Initialize tenant when modal opens
  useEffect(() => {
    if (!openRecordPaymentModal) return;
    const defaultTenant =
      preselectedTenantForPayment ||
      activeTenants.find((t) =>
        computedObligations.some((c) => c.obligation.tenantId === t.id && c.amountOutstanding > 0)
      )?.id ||
      activeTenants[0]?.id ||
      '';
    setTenantId(defaultTenant);
    setDateReceived(state.referenceDate);
    setMethod('Bank Transfer');
    setBankReference('');
    setNotes('');
    setSendEmailImmediately(Boolean(isGmailConnected || status?.smtpConfigured));
    setSimulateFailure(false);
    setErrorMsg('');
  }, [
    openRecordPaymentModal,
    preselectedTenantForPayment,
    activeTenants,
    computedObligations,
    state.referenceDate,
    isGmailConnected,
    status?.smtpConfigured,
  ]);

  const tenantAgreements = useMemo(
    () => state.agreements.filter((a) => a.tenantId === tenantId),
    [state.agreements, tenantId]
  );

  useEffect(() => {
    const preferred =
      tenantAgreements.find((a) => a.status === 'Active')?.id || tenantAgreements[0]?.id || '';
    setAgreementId(preferred);
  }, [tenantId, tenantAgreements]);

  const openObligations = useMemo(() => {
    return computedObligations
      .filter((c) => c.obligation.tenantId === tenantId && c.amountOutstanding > 0)
      .sort((a, b) => a.obligation.dueDate.localeCompare(b.obligation.dueDate));
  }, [computedObligations, tenantId]);

  useEffect(() => {
    const totalOpen = openObligations.reduce((s, c) => s + c.amountOutstanding, 0);
    if (totalOpen > 0) {
      setAmountStr(String(totalOpen));
      const suggested = suggestPaymentAllocations(
        totalOpen,
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
    } else {
      setAmountStr('');
      setAllocMap({});
    }
  }, [tenantId, openObligations, state.settings.defaultAllocationOrder]);

  if (!openRecordPaymentModal) return null;

  const parsedAmount = parseCurrencyValue(amountStr);
  const allocatedTotal = Object.values(allocMap).reduce((s, v) => s + (Number(v) || 0), 0);
  const unappliedAmount = Math.max(0, Math.round((parsedAmount - allocatedTotal) * 100) / 100);
  const totalOpenBalance = openObligations.reduce((s, c) => s + c.amountOutstanding, 0);
  const remainingAfterPayment = Math.max(0, totalOpenBalance - allocatedTotal);
  const isDuplicateRef = checkDuplicateBankReference(bankReference, state.payments);

  const handleAutoAllocate = () => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const allocations: PaymentAllocation[] = Object.entries(allocMap)
      .filter(([, amt]) => amt > 0)
      .map(([obligationId, amount]) => ({ obligationId, amount }));

    const result = recordPayment({
      tenantId,
      agreementId,
      amount: parsedAmount,
      dateReceived,
      method,
      bankReference,
      allocations,
      notes,
      simulateNotificationFailure: simulateFailure,
    });

    if (!result.ok) {
      setErrorMsg(result.error || 'Unable to save payment.');
      return;
    }

    setOpenRecordPaymentModal(false);

    const hasLiveEmailTransport =
      (isGmailConnected && Boolean(gmailAccessToken)) || Boolean(status?.smtpConfigured);
    if (
      sendEmailImmediately &&
      !simulateFailure &&
      hasLiveEmailTransport &&
      result.createdNotifications?.length
    ) {
      const emailNotifications = result.createdNotifications.filter(
        (n) => n.channel === 'Email' && n.recipientContact
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
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
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
              Saves confirmed funds, allocates to obligations, and triggers a receipt request.
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pay-tenant" className="block hig-footnote mb-1.5">
                Tenant
              </label>
              <select
                id="pay-tenant"
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
              <label htmlFor="pay-agreement" className="block hig-footnote mb-1.5">
                Tenancy Agreement
              </label>
              <select
                id="pay-agreement"
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="pay-amount" className="block hig-footnote mb-1.5">
                Amount Confirmed (₦)
              </label>
              <CurrencyInput
                id="pay-amount"
                min={1}
                value={amountStr}
                onValueChange={(raw) => setAmountStr(raw)}
                placeholder="e.g. 4,000,000"
                className="hig-input w-full"
                required
              />
            </div>

            <div>
              <label htmlFor="pay-date" className="block hig-footnote mb-1.5">
                Date Received
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
              </select>
            </div>
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
              placeholder="e.g. GTB-NIP-4410928"
              className="hig-input w-full font-mono-nums"
            />
            {isDuplicateRef && (
              <p
                className="mt-1.5 hig-caption flex items-center gap-1.5"
                style={{ color: 'var(--status-warning-ink)' }}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Warning: Another confirmed payment already uses reference "{bankReference}". Flagged for review.
                </span>
              </p>
            )}
          </div>

          {/* Obligation Allocation Section */}
          <div className="hig-card-inset p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="hig-subhead font-semibold text-[var(--ink-primary)]">
                  Obligation Allocation
                </h4>
                <p className="hig-caption">
                  Allocate confirmed funds across rent and security levy obligations.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAutoAllocate}
                className="hig-btn-secondary whitespace-nowrap"
              >
                Auto-Allocate ({state.settings.defaultAllocationOrder === 'Manual Only' ? 'Oldest First' : state.settings.defaultAllocationOrder})
              </button>
            </div>

            {openObligations.length === 0 ? (
              <p className="hig-subhead py-2">
                No unpaid obligations for this tenant. Full amount will be recorded as Unapplied Credit.
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
                          <StatusBadge label={co.obligation.chargeType} tone="neutral" />
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
                            setAllocMap((prev) => ({ ...prev, [co.obligation.id]: clamped }));
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

            {/* Summary reconciliation strip */}
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
                <span className="hig-caption block">Remaining Balance</span>
                <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
                  {formatNaira(remainingAfterPayment)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="pay-notes" className="block hig-footnote mb-1.5">
              Notes
            </label>
            <textarea
              id="pay-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional narration, bank account confirmed, or tranche details..."
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={parsedAmount <= 0 || allocatedTotal > parsedAmount + 0.01}
              className="hig-btn-primary"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm & Save Payment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
