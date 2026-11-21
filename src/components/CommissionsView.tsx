import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import { exportFilteredCsv } from '../utils/csvExport';
import { formatDateShort, formatNaira, formatTenantName, parseCurrencyValue } from '../utils/format';
import { CurrencyInput } from './CurrencyInput';
import { StatusBadge } from './StatusBadge';
import { ExportCsvButton, SearchInput } from './TableToolbarControls';

export function CommissionsView() {
  const { state, summaryMetrics, recordCommissionPayout } = useRentalStore();
  const [search, setSearch] = useState('');
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [amount, setAmount] = useState(String(summaryMetrics.commissionOutstanding || 0));
  const [payoutDate, setPayoutDate] = useState(state.referenceDate);
  const [ref, setRef] = useState('');
  const [notes, setNotes] = useState('');

  const lawyer = state.contacts.find((c) => c.role === 'Lawyer');
  const q = search.trim().toLowerCase();

  const filteredCommissions = useMemo(() => {
    if (!q) return state.commissions;
    return state.commissions.filter((c) => {
      const tenant = state.tenants.find((t) => t.id === c.tenantId);
      const agreement = state.agreements.find((a) => a.id === c.agreementId);
      const unit = agreement ? state.units.find((u) => u.id === agreement.unitId) : undefined;
      const searchable = `${formatTenantName(tenant)} ${tenant?.alias || ''} ${unit?.code || ''} ${unit?.name || ''} ${c.note} ${lawyer?.name || ''}`.toLowerCase();
      return searchable.includes(q);
    });
  }, [state.commissions, state.tenants, state.agreements, state.units, lawyer, q]);

  const filteredPayouts = useMemo(() => {
    if (!q) return state.commissionPayouts;
    return state.commissionPayouts.filter((cp) => {
      const cpLawyer = state.contacts.find((c) => c.id === cp.lawyerContactId);
      const searchable = `${cp.reference} ${cp.notes} ${cp.payoutDate} ${cpLawyer?.name || ''}`.toLowerCase();
      return searchable.includes(q);
    });
  }, [state.commissionPayouts, state.contacts, q]);

  const handleExportAccrualsCsv = () => {
    exportFilteredCsv(
      `propledger-commission-accruals-${state.referenceDate}.csv`,
      [
        'Accrual Date',
        'Tenant Name',
        'Unit Code',
        'Unit Name',
        'Calculation Note',
        'Reversal Adjustment',
        'Rate (%)',
        'Eligible Rent Collected (NGN)',
        'Commission Accrued (NGN)',
      ],
      filteredCommissions.map((c) => {
        const tenant = state.tenants.find((t) => t.id === c.tenantId);
        const agreement = state.agreements.find((a) => a.id === c.agreementId);
        const unit = agreement ? state.units.find((u) => u.id === agreement.unitId) : undefined;
        return [
          c.createdAt,
          tenant ? formatTenantName(tenant) : '',
          unit?.code || '',
          unit?.name || '',
          c.note,
          c.isReversalAdjustment ? 'Yes' : 'No',
          c.ratePercent,
          c.eligibleRentCollected,
          c.accruedAmount,
        ];
      })
    );
  };

  const handleExportPayoutsCsv = () => {
    exportFilteredCsv(
      `propledger-commission-payouts-${state.referenceDate}.csv`,
      ['Payout Date', 'Lawyer', 'Reference', 'Notes', 'Recorded By', 'Amount Paid (NGN)'],
      filteredPayouts.map((cp) => {
        const cpLawyer = state.contacts.find((c) => c.id === cp.lawyerContactId);
        return [
          cp.payoutDate,
          cpLawyer?.name || '',
          cp.reference || '',
          cp.notes || '',
          cp.recordedBy,
          cp.amount,
        ];
      })
    );
  };

  const handleSubmitPayout = (e: React.FormEvent) => {
    e.preventDefault();
    const res = recordCommissionPayout({
      amount: parseCurrencyValue(amount),
      payoutDate,
      reference: ref,
      notes,
    });
    if (res.ok) {
      setShowPayoutModal(false);
      setRef('');
      setNotes('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="hig-title-1">Lawyer Commission Ledger</h1>
          <p className="hig-callout mt-1">
            Calculated at {state.settings.lawyerCommissionRatePercent}% strictly on eligible rent &amp; commission-eligible custom charges collected (Security Levy excluded) · Assigned lawyer: {lawyer?.name || 'Not set'}.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setAmount(String(summaryMetrics.commissionOutstanding));
            setShowPayoutModal(true);
          }}
          className="hig-btn-primary whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Record Commission Payout</span>
        </button>
      </div>

      {/* Commission Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="hig-card p-5">
          <span className="hig-footnote block">Total Accrued</span>
          <p className="hig-title-2 font-mono-nums mt-1">
            {formatNaira(summaryMetrics.commissionAccrued)}
          </p>
        </div>
        <div className="hig-card p-5">
          <span className="hig-footnote block">Total Paid to Lawyer</span>
          <p
            className="hig-title-2 font-mono-nums mt-1"
            style={{ color: 'var(--status-success-ink)' }}
          >
            {formatNaira(summaryMetrics.commissionPaid)}
          </p>
        </div>
        <div className="hig-card-inset p-5">
          <span className="hig-footnote block">Commission Outstanding</span>
          <p className="hig-title-2 font-mono-nums mt-1">
            {formatNaira(summaryMetrics.commissionOutstanding)}
          </p>
        </div>
      </div>

      {/* Real-time Search & CSV Export Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search unit number, tenant name, or reference..."
          ariaLabel="Search commissions by unit number, tenant name, or reference"
          className="w-full sm:w-80"
        />
        <div className="flex flex-wrap items-center gap-2">
          <ExportCsvButton
            onClick={handleExportAccrualsCsv}
            disabled={filteredCommissions.length === 0}
            count={filteredCommissions.length}
            label="Export Accruals CSV"
          />
          <ExportCsvButton
            onClick={handleExportPayoutsCsv}
            disabled={filteredPayouts.length === 0}
            count={filteredPayouts.length}
            label="Export Payouts CSV"
          />
        </div>
      </div>

      {/* Accrual Ledger */}
      <div className="hig-card overflow-hidden">
        <div
          className="px-4 sm:px-6 py-4 border-b"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <h2 className="hig-headline">
            Commission Accruals & Reversal Adjustments ({filteredCommissions.length})
          </h2>
        </div>

        {/* Mobile Stacked Cards */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {filteredCommissions.length === 0 ? (
            <p className="py-8 px-4 text-center hig-subhead">
              No commission accruals match your filter.
            </p>
          ) : (
            filteredCommissions.map((c) => {
              const tenant = state.tenants.find((t) => t.id === c.tenantId);
              const agreement = state.agreements.find((a) => a.id === c.agreementId);
              const unit = agreement ? state.units.find((u) => u.id === agreement.unitId) : undefined;
              return (
                <div key={c.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="hig-headline block">
                        {formatTenantName(tenant)}
                      </span>
                      <span className="hig-footnote tabular-nums">
                        {formatDateShort(c.createdAt)}
                        {unit ? ` · ${unit.code}` : ''}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className="hig-headline font-mono-nums block"
                        style={
                          c.accruedAmount < 0 ? { color: 'var(--status-danger-ink)' } : undefined
                        }
                      >
                        {formatNaira(c.accruedAmount)}
                      </span>
                      <span className="hig-caption font-mono-nums">
                        {c.ratePercent}% of {formatNaira(c.eligibleRentCollected)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="hig-footnote">{c.note}</p>
                    {c.isReversalAdjustment && <StatusBadge label="Reversed" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className="border-b text-[0.75rem] font-semibold uppercase tracking-[0.03em]"
                style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-tertiary)' }}
              >
                <th className="py-3 px-5">Date, Tenant & Unit</th>
                <th className="py-3 px-4">Calculation Note</th>
                <th className="py-3 px-4 text-right">Rate</th>
                <th className="py-3 px-4 text-right">Eligible Rent</th>
                <th className="py-3 px-5 text-right">Commission Accrued</th>
              </tr>
            </thead>
            <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
              {filteredCommissions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center hig-subhead">
                    No commission accruals match your filter.
                  </td>
                </tr>
              ) : (
                filteredCommissions.map((c) => {
                  const tenant = state.tenants.find((t) => t.id === c.tenantId);
                  const agreement = state.agreements.find((a) => a.id === c.agreementId);
                  const unit = agreement ? state.units.find((u) => u.id === agreement.unitId) : undefined;
                  return (
                    <tr key={c.id} className="hover:bg-[var(--bg-hover)]">
                      <td className="py-3.5 px-5">
                        <span className="font-semibold text-[var(--ink-primary)] block">
                          {formatTenantName(tenant)}
                        </span>
                        <span className="hig-footnote tabular-nums">
                          {formatDateShort(c.createdAt)}
                          {unit ? ` · ${unit.code}` : ''}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-[var(--ink-secondary)]">
                        {c.note}
                        {c.isReversalAdjustment && (
                          <span className="ml-2">
                            <StatusBadge label="Reversed" />
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-nums text-[var(--ink-secondary)]">
                        {c.ratePercent}%
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-nums text-[var(--ink-primary)]">
                        {formatNaira(c.eligibleRentCollected)}
                      </td>
                      <td
                        className="py-3.5 px-5 text-right font-mono-nums font-semibold text-[var(--ink-primary)]"
                        style={
                          c.accruedAmount < 0 ? { color: 'var(--status-danger-ink)' } : undefined
                        }
                      >
                        {formatNaira(c.accruedAmount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payouts History */}
      <div className="hig-card overflow-hidden">
        <div
          className="px-4 sm:px-6 py-4 border-b"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <h2 className="hig-headline">
            Commission Payout History ({filteredPayouts.length})
          </h2>
        </div>

        {/* Mobile Stacked Cards */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {filteredPayouts.length === 0 ? (
            <p className="py-8 px-4 text-center hig-subhead">
              No commission payouts match your filter.
            </p>
          ) : (
            filteredPayouts.map((cp) => (
              <div key={cp.id} className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="hig-subhead font-mono-nums text-[var(--ink-primary)]">
                    {formatDateShort(cp.payoutDate)}
                  </span>
                  <span
                    className="hig-headline font-mono-nums"
                    style={{ color: 'var(--status-success-ink)' }}
                  >
                    {formatNaira(cp.amount)}
                  </span>
                </div>
                <p className="hig-footnote font-mono-nums">Ref: {cp.reference || '—'}</p>
                {cp.notes && <p className="hig-footnote">{cp.notes}</p>}
              </div>
            ))
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className="border-b text-[0.75rem] font-semibold uppercase tracking-[0.03em]"
                style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-tertiary)' }}
              >
                <th className="py-3 px-5">Payout Date</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-5 text-right">Amount Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
              {filteredPayouts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center hig-subhead">
                    No commission payouts match your filter.
                  </td>
                </tr>
              ) : (
                filteredPayouts.map((cp) => (
                  <tr key={cp.id} className="hover:bg-[var(--bg-hover)]">
                    <td className="py-3.5 px-5 font-mono-nums text-[var(--ink-primary)]">
                      {formatDateShort(cp.payoutDate)}
                    </td>
                    <td className="py-3.5 px-4 font-mono-nums text-[var(--ink-secondary)]">
                      {cp.reference || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-[var(--ink-secondary)]">{cp.notes || '—'}</td>
                    <td
                      className="py-3.5 px-5 text-right font-mono-nums font-semibold"
                      style={{ color: 'var(--status-success-ink)' }}
                    >
                      {formatNaira(cp.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showPayoutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border overflow-hidden max-h-[92vh] flex flex-col"
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
              <h3 className="hig-headline">Record Commission Payout</h3>
              <button
                type="button"
                onClick={() => setShowPayoutModal(false)}
                className="hig-touch-icon"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitPayout} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block hig-footnote mb-1.5">Amount Paid (₦)</label>
                  <CurrencyInput
                    min={1}
                    value={amount}
                    onValueChange={(raw) => setAmount(raw)}
                    placeholder="e.g. 4,000,000"
                    className="hig-input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block hig-footnote mb-1.5">Payout Date</label>
                  <input
                    type="date"
                    value={payoutDate}
                    onChange={(e) => setPayoutDate(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">Transfer Reference</label>
                <input
                  type="text"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="e.g. GTB-COMM-2026-11"
                  className="hig-input w-full font-mono-nums"
                />
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="hig-input w-full min-h-[72px]"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPayoutModal(false)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="hig-btn-primary">
                  Save Payout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
