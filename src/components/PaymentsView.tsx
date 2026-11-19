import React, { useMemo, useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import { exportFilteredCsv } from '../utils/csvExport';
import { formatDateShort, formatNaira } from '../utils/format';
import { StatusBadge } from './StatusBadge';
import { ExportCsvButton, SearchInput } from './TableToolbarControls';

export function PaymentsView() {
  const {
    state,
    effectiveReceipts,
    setOpenRecordPaymentModal,
    setPreselectedTenantForPayment,
    setSelectedTenantIdForDrawer,
    reversePayment,
  } = useRentalStore();

  const [statusFilter, setStatusFilter] = useState<'All' | 'Confirmed' | 'Reversed' | 'Duplicate'>('All');
  const [search, setSearch] = useState('');
  const [reversingPaymentId, setReversingPaymentId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState('');

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.payments.filter((p) => {
      if (statusFilter === 'Confirmed' && p.status !== 'Confirmed') return false;
      if (statusFilter === 'Reversed' && p.status !== 'Reversed') return false;
      if (statusFilter === 'Duplicate' && !p.duplicateFlag) return false;

      if (q) {
        const tenant = state.tenants.find((t) => t.id === p.tenantId);
        const unit = state.units.find((u) => u.id === p.unitId);
        const text = `${p.systemRef} ${p.bankReference} ${p.method} ${tenant?.firstName} ${tenant?.lastName} ${unit?.code} ${unit?.name}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [state.payments, state.tenants, state.units, statusFilter, search]);

  const handleExportPaymentsCsv = () => {
    exportFilteredCsv(
      `propledger-payments-${state.referenceDate}.csv`,
      [
        'System Ref',
        'Date Received',
        'Tenant Name',
        'Unit Code',
        'Unit Name',
        'Payment Method',
        'Bank Reference',
        'Allocated Periods',
        'Receipt Status',
        'Official Receipt No',
        'Amount (NGN)',
        'Unapplied Credit (NGN)',
        'Status',
        'Reversal Reason',
      ],
      filteredPayments.map((p) => {
        const tenant = state.tenants.find((t) => t.id === p.tenantId);
        const unit = state.units.find((u) => u.id === p.unitId);
        const receipt = effectiveReceipts.find((r) => r.paymentId === p.id);
        const allocatedDesc =
          p.allocations.length === 0
            ? 'Unapplied credit'
            : p.allocations
                .map((a) => {
                  const ob = state.obligations.find((o) => o.id === a.obligationId);
                  return `${ob?.rentalPeriodLabel || a.obligationId}: ${a.amount}`;
                })
                .join('; ');
        return [
          p.systemRef,
          p.dateReceived,
          tenant ? `${tenant.firstName} ${tenant.lastName}` : '',
          unit?.code || '',
          unit?.name || '',
          p.method,
          p.bankReference || '',
          allocatedDesc,
          receipt?.status || '',
          receipt?.officialReceiptNumber || '',
          p.amount,
          p.unappliedAmount,
          p.status,
          p.reversalReason || '',
        ];
      })
    );
  };

  const totalConfirmed = state.payments
    .filter((p) => p.status === 'Confirmed')
    .reduce((s, p) => s + p.amount, 0);

  const handleConfirmReversal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingPaymentId) return;
    const res = reversePayment(reversingPaymentId, reversalReason);
    if (!res.ok) {
      setReversalError(res.error || 'Unable to reverse payment.');
      return;
    }
    setReversingPaymentId(null);
    setReversalReason('');
    setReversalError('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="hig-title-1">Payments &amp; Allocations Ledger</h1>
          <p className="hig-subhead mt-1">
            Confirmed collections total{' '}
            <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
              {formatNaira(totalConfirmed)}
            </span>{' '}
            · Original records are never deleted; errors use auditable reversals.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setPreselectedTenantForPayment(null);
            setOpenRecordPaymentModal(true);
          }}
          className="hig-btn-primary whitespace-nowrap shrink-0"
        >
          Record Confirmed Payment
        </button>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="hig-segmented w-fit">
          {(['All', 'Confirmed', 'Reversed', 'Duplicate'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              data-active={statusFilter === tab}
              onClick={() => setStatusFilter(tab)}
              className="hig-segmented-item"
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search unit number, tenant name, or ref..."
            ariaLabel="Search payments by unit number, tenant name, or reference"
            className="w-full sm:w-72"
          />
          <ExportCsvButton
            onClick={handleExportPaymentsCsv}
            disabled={filteredPayments.length === 0}
            count={filteredPayments.length}
          />
        </div>
      </div>

      {/* Mobile Stacked Cards (< md) */}
      <div className="md:hidden space-y-3">
        {filteredPayments.length === 0 ? (
          <div className="hig-card p-8 text-center hig-footnote">
            No payment records match your filter.
          </div>
        ) : (
          filteredPayments.map((p) => {
            const tenant = state.tenants.find((t) => t.id === p.tenantId);
            const unit = state.units.find((u) => u.id === p.unitId);
            const receipt = effectiveReceipts.find((r) => r.paymentId === p.id);

            return (
              <div key={p.id} className="hig-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                    className="text-left min-w-0 min-h-[44px]"
                  >
                    <span className="font-semibold text-[1rem] text-[var(--ink-primary)] block truncate">
                      {tenant?.firstName} {tenant?.lastName}
                    </span>
                    <span className="hig-caption block truncate">
                      {unit?.code} · {unit?.name} · {p.systemRef}
                    </span>
                  </button>
                  <div className="text-right shrink-0">
                    <span className="font-mono-nums font-bold text-[1rem] text-[var(--ink-primary)] block">
                      {formatNaira(p.amount)}
                    </span>
                    <span className="hig-caption tabular-nums">{formatDateShort(p.dateReceived)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <StatusBadge label={p.status} />
                  {receipt && <StatusBadge label={receipt.status} />}
                  <span className="hig-caption">
                    {p.method} {p.bankReference ? `· ${p.bankReference}` : ''}
                  </span>
                </div>

                <div className="hig-caption space-y-0.5">
                  {p.allocations.length === 0 ? (
                    <span style={{ color: 'var(--status-warning-ink)' }}>Unapplied credit</span>
                  ) : (
                    p.allocations.map((a) => {
                      const ob = state.obligations.find((o) => o.id === a.obligationId);
                      return (
                        <div key={a.obligationId} className="tabular-nums">
                          {ob?.rentalPeriodLabel}: {formatNaira(a.amount)}
                        </div>
                      );
                    })
                  )}
                </div>

                {p.status === 'Confirmed' && (
                  <button
                    type="button"
                    onClick={() => {
                      setReversingPaymentId(p.id);
                      setReversalReason('');
                      setReversalError('');
                    }}
                    className="hig-btn-secondary w-full !text-[var(--status-danger-ink)]"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Reverse</span>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Ledger Table (>= md) */}
      <div className="hidden md:block hig-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className="border-b hig-caption uppercase tracking-[0.03em]"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <th className="py-3 px-5">System Ref &amp; Date</th>
                <th className="py-3 px-4">Tenant &amp; Unit</th>
                <th className="py-3 px-4">Method &amp; Bank Ref</th>
                <th className="py-3 px-4">Allocated To</th>
                <th className="py-3 px-4">Receipt Status</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-right">Unapplied</th>
                <th className="py-3 px-5 text-right">Status / Action</th>
              </tr>
            </thead>
            <tbody
              className="divide-y text-[0.875rem]"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center hig-footnote">
                    No payment records match your filter.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const tenant = state.tenants.find((t) => t.id === p.tenantId);
                  const unit = state.units.find((u) => u.id === p.unitId);
                  const receipt = effectiveReceipts.find((r) => r.paymentId === p.id);

                  return (
                    <tr key={p.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-3.5 px-5">
                        <span className="font-mono-nums font-semibold text-[var(--ink-primary)] block">
                          {p.systemRef}
                        </span>
                        <span className="hig-caption tabular-nums">
                          {formatDateShort(p.dateReceived)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                          className="text-left hover:underline min-h-[44px] flex flex-col justify-center"
                        >
                          <span className="font-medium text-[var(--ink-primary)] block">
                            {tenant?.firstName} {tenant?.lastName}
                          </span>
                          <span className="hig-caption">
                            {unit?.code} · {unit?.name}
                          </span>
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[var(--ink-primary)] block">{p.method}</span>
                        <span className="hig-caption font-mono-nums flex items-center gap-1">
                          {p.bankReference || 'No ref'}
                          {p.duplicateFlag && (
                            <span
                              title="Duplicate reference flagged"
                              className="inline-flex items-center"
                              style={{ color: 'var(--status-warning-ink)' }}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 hig-caption text-[var(--ink-secondary)]">
                        {p.allocations.length === 0 ? (
                          <span style={{ color: 'var(--status-warning-ink)' }}>Unapplied credit</span>
                        ) : (
                          p.allocations.map((a) => {
                            const ob = state.obligations.find((o) => o.id === a.obligationId);
                            return (
                              <div key={a.obligationId} className="tabular-nums">
                                {ob?.rentalPeriodLabel}: {formatNaira(a.amount)}
                              </div>
                            );
                          })
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {receipt ? (
                          <div>
                            <StatusBadge label={receipt.status} />
                            {receipt.officialReceiptNumber && (
                              <span className="block hig-caption font-mono-nums mt-0.5">
                                #{receipt.officialReceiptNumber}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="hig-caption">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-nums font-semibold text-[var(--ink-primary)]">
                        {formatNaira(p.amount)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-nums text-[var(--ink-secondary)]">
                        {formatNaira(p.unappliedAmount)}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <StatusBadge label={p.status} />
                          {p.status === 'Confirmed' && (
                            <button
                              type="button"
                              onClick={() => {
                                setReversingPaymentId(p.id);
                                setReversalReason('');
                                setReversalError('');
                              }}
                              className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-xl text-[0.8125rem] font-semibold transition-opacity hover:opacity-85"
                              style={{
                                backgroundColor: 'var(--status-danger-bg)',
                                color: 'var(--status-danger-ink)',
                              }}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reverse</span>
                            </button>
                          )}
                        </div>
                        {p.reversalReason && (
                          <span
                            className="block text-[0.75rem] mt-1 max-w-[180px] ml-auto truncate"
                            style={{ color: 'var(--status-danger-ink)' }}
                          >
                            {p.reversalReason}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reverse Payment Modal */}
      {reversingPaymentId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[6px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reverse-payment-title"
        >
          <div
            className="w-full max-w-md hig-card p-6 space-y-4"
            style={{ boxShadow: 'var(--shadow-sheet)' }}
          >
            <h3 id="reverse-payment-title" className="hig-headline">
              Reverse Confirmed Payment
            </h3>
            <p className="hig-subhead">
              Reversing preserves the original payment record, restores the affected obligation balances, creates a negative lawyer commission adjustment, and flags the linked receipt request for issuer cancellation/correction.
            </p>
            {reversalError && (
              <p className="hig-footnote" style={{ color: 'var(--status-danger-ink)' }}>
                {reversalError}
              </p>
            )}
            <form onSubmit={handleConfirmReversal} className="space-y-4">
              <div>
                <label htmlFor="rev-reason" className="block hig-caption mb-1.5">
                  Mandatory Reversal Reason
                </label>
                <textarea
                  id="rev-reason"
                  rows={3}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Cheque returned unpaid / duplicate transfer entry"
                  className="hig-input w-full"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReversingPaymentId(null)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-4 rounded-xl bg-[#FF3B30] text-white text-[0.875rem] font-semibold hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  Confirm Reversal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
