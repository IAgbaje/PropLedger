import React, { useMemo, useState } from 'react';
import { Check, FileCheck2, X } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import { exportFilteredCsv } from '../utils/csvExport';
import { formatDateShort, formatDateTimeShort, formatNaira, formatTenantName } from '../utils/format';
import { StatusBadge } from './StatusBadge';
import { ExportCsvButton, SearchInput } from './TableToolbarControls';

export function ReceiptsView() {
  const {
    state,
    effectiveReceipts,
    acknowledgeReceipt,
    issueReceipt,
    cancelReceipt,
  } = useRentalStore();

  const [filter, setFilter] = useState<'All' | 'Pending' | 'Overdue' | 'Issued'>('All');
  const [search, setSearch] = useState('');
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [receiptNo, setReceiptNo] = useState('');
  const [issuedDate, setIssuedDate] = useState(state.referenceDate);
  const [evidenceNote, setEvidenceNote] = useState('');

  const [ackId, setAckId] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return effectiveReceipts.filter((r) => {
      if (filter === 'Pending' && (r.status === 'Issued' || r.status === 'Cancelled')) {
        return false;
      }
      if (filter === 'Overdue' && r.status !== 'Overdue') return false;
      if (filter === 'Issued' && r.status !== 'Issued') return false;

      if (q) {
        const tenant = state.tenants.find((t) => t.id === r.tenantId);
        const unit = state.units.find((u) => u.id === r.unitId);
        const issuer = state.contacts.find((c) => c.id === r.issuerContactId);
        const searchable = `${r.paymentRef} ${r.officialReceiptNumber || ''} ${r.rentalPeriodCovered} ${r.status} ${formatTenantName(tenant)} ${tenant?.alias || ''} ${unit?.code || ''} ${unit?.name || ''} ${unit?.type || ''} ${issuer?.name || ''}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [effectiveReceipts, filter, search, state.tenants, state.units, state.contacts]);

  const handleExportCsv = () => {
    exportFilteredCsv(
      `propledger-receipts-${state.referenceDate}.csv`,
      [
        'Payment Ref',
        'Date Paid',
        'Tenant Name',
        'Unit Code',
        'Unit Name',
        'Unit Type',
        'Rental Period Covered',
        'Issuer',
        'Notification Delivery',
        'Receipt Status',
        'Official Receipt No',
        'Issued Date',
        'SLA Deadline',
        'Security Levy Included (NGN)',
        'Remaining Balance After Payment (NGN)',
        'Amount Paid (NGN)',
      ],
      filtered.map((req) => {
        const tenant = state.tenants.find((t) => t.id === req.tenantId);
        const unit = state.units.find((u) => u.id === req.unitId);
        const issuer = state.contacts.find((c) => c.id === req.issuerContactId);
        const linkedNotifs = state.notifications.filter((n) => n.relatedRecordId === req.id);
        const notifSummary =
          linkedNotifs.length === 0
            ? 'No dispatch logged'
            : linkedNotifs.map((n) => `${n.channel}: ${n.status}`).join('; ');

        return [
          req.paymentRef,
          req.datePaid,
          tenant ? formatTenantName(tenant) : '',
          unit?.code || '',
          unit?.name || '',
          unit?.type || '',
          req.rentalPeriodCovered,
          issuer?.name || 'Unassigned',
          notifSummary,
          req.status,
          req.officialReceiptNumber || '',
          req.issuedDate || '',
          req.slaDeadlineAt,
          req.securityLevyIncluded,
          req.remainingBalanceAtPayment,
          req.amount,
        ];
      })
    );
  };

  const handleConfirmIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!issuingId || !receiptNo.trim()) return;
    issueReceipt(issuingId, receiptNo, issuedDate, evidenceNote);
    setIssuingId(null);
    setReceiptNo('');
    setEvidenceNote('');
  };

  const handleConfirmAck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ackId) return;
    acknowledgeReceipt(ackId, ackNote);
    setAckId(null);
    setAckNote('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="hig-title-1">Receipt Issuance Queue</h1>
        <p className="hig-callout mt-1">
          Notification delivery is tracked separately from official receipt issuance (SLA: {state.settings.receiptSlaHours}h). A delivered message never closes a receipt request.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="hig-segmented w-full sm:w-fit" role="tablist" aria-label="Receipt filter">
          {(['All', 'Pending', 'Overdue', 'Issued'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={filter === tab}
              data-active={filter === tab}
              onClick={() => setFilter(tab)}
              className="hig-segmented-item flex-1 sm:flex-initial"
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
            ariaLabel="Search receipts by unit number, tenant name, or payment reference"
            className="w-full sm:w-72"
          />
          <ExportCsvButton
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            count={filtered.length}
          />
        </div>
      </div>

      <div className="hig-card overflow-hidden">
        {/* Mobile Stacked Cards */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {filtered.length === 0 ? (
            <p className="py-10 px-4 text-center hig-subhead">No receipt requests in this view.</p>
          ) : (
            filtered.map((req) => {
              const tenant = state.tenants.find((t) => t.id === req.tenantId);
              const unit = state.units.find((u) => u.id === req.unitId);
              const issuer = state.contacts.find((c) => c.id === req.issuerContactId);
              const linkedNotifs = state.notifications.filter((n) => n.relatedRecordId === req.id);

              return (
                <div key={req.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-mono-nums font-semibold text-[var(--ink-primary)] block">
                        {req.paymentRef}
                      </span>
                      <span className="hig-subhead text-[var(--ink-primary)] block mt-0.5">
                        {formatTenantName(tenant)} · {unit?.code}
                      </span>
                      <span className="hig-caption tabular-nums">
                        Paid {formatDateShort(req.datePaid)} · {req.rentalPeriodCovered}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="hig-headline font-mono-nums block">
                        {formatNaira(req.amount)}
                      </span>
                      <div className="mt-1">
                        <StatusBadge label={req.status} />
                      </div>
                    </div>
                  </div>

                  <div className="hig-card-inset p-3 space-y-1 text-[0.8125rem]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="hig-caption">Issuer</span>
                      <span className="font-medium text-[var(--ink-primary)]">
                        {issuer?.name || 'Unassigned'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="hig-caption">Levy / Remaining Bal</span>
                      <span className="font-mono-nums text-[var(--ink-secondary)]">
                        {formatNaira(req.securityLevyIncluded)} / {formatNaira(req.remainingBalanceAtPayment)}
                      </span>
                    </div>
                    {req.status === 'Issued' ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="hig-caption">Issued Ref</span>
                        <span
                          className="font-mono-nums font-medium"
                          style={{ color: 'var(--status-success-ink)' }}
                        >
                          #{req.officialReceiptNumber} · {formatDateShort(req.issuedDate || '')}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="hig-caption">SLA Deadline</span>
                        <span className="font-mono-nums text-[var(--ink-secondary)]">
                          {formatDateTimeShort(req.slaDeadlineAt)}
                        </span>
                      </div>
                    )}
                    {linkedNotifs.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {linkedNotifs.map((n) => (
                          <span key={n.id} className="hig-caption">
                            {n.channel}: <strong className="font-semibold">{n.status}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {req.status !== 'Issued' && req.status !== 'Cancelled' && (
                    <div className="flex flex-wrap gap-2">
                      {!req.acknowledgedAt && req.status !== 'Correction Required' && (
                        <button
                          type="button"
                          onClick={() => {
                            setAckId(req.id);
                            setAckNote('');
                          }}
                          className="flex-1 hig-btn-secondary"
                        >
                          <Check className="w-4 h-4" />
                          <span>Acknowledge</span>
                        </button>
                      )}
                      {req.status !== 'Correction Required' && (
                        <button
                          type="button"
                          onClick={() => {
                            setIssuingId(req.id);
                            setReceiptNo(`RCP-2026-${String(state.receiptRequests.length + 115)}`);
                            setIssuedDate(state.referenceDate);
                            setEvidenceNote('');
                          }}
                          className="flex-1 hig-btn-primary"
                        >
                          <FileCheck2 className="w-4 h-4" />
                          <span>Mark Issued</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => cancelReceipt(req.id, 'Cancelled by Property Manager')}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl text-[0.875rem] font-semibold"
                        style={{
                          backgroundColor: 'var(--status-danger-bg)',
                          color: 'var(--status-danger-ink)',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
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
                className="border-b text-[0.75rem] font-semibold uppercase tracking-[0.03em] whitespace-nowrap"
                style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-tertiary)' }}
              >
                <th className="py-3 px-5">Payment Ref & Tenant</th>
                <th className="py-3 px-4">Period & Levy</th>
                <th className="py-3 px-4">Issuer & Notification</th>
                <th className="py-3 px-4">Receipt Status & SLA</th>
                <th className="py-3 px-4 text-right">Amount Paid</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center hig-subhead">
                    No receipt requests in this view.
                  </td>
                </tr>
              ) : (
                filtered.map((req) => {
                  const tenant = state.tenants.find((t) => t.id === req.tenantId);
                  const unit = state.units.find((u) => u.id === req.unitId);
                  const issuer = state.contacts.find((c) => c.id === req.issuerContactId);
                  const linkedNotifs = state.notifications.filter(
                    (n) => n.relatedRecordId === req.id
                  );

                  return (
                    <tr key={req.id} className="hover:bg-[var(--bg-hover)]">
                      <td className="py-3.5 px-5">
                        <span className="font-mono-nums font-semibold text-[var(--ink-primary)] block">
                          {req.paymentRef}
                        </span>
                        <span className="text-[var(--ink-primary)] block">
                          {formatTenantName(tenant)} · {unit?.code} ({unit?.type})
                        </span>
                        <span className="hig-footnote tabular-nums">
                          Paid {formatDateShort(req.datePaid)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[var(--ink-primary)] block">{req.rentalPeriodCovered}</span>
                        <span className="hig-footnote tabular-nums">
                          Levy: {formatNaira(req.securityLevyIncluded)} · Bal after pay:{' '}
                          {formatNaira(req.remainingBalanceAtPayment)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-[var(--ink-primary)] block">
                          {issuer?.name || 'Unassigned'}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {linkedNotifs.length === 0 ? (
                            <span className="hig-caption">No dispatch logged</span>
                          ) : (
                            linkedNotifs.map((n) => (
                              <span key={n.id} className="hig-caption">
                                {n.channel}: <strong className="font-semibold">{n.status}</strong>
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge label={req.status} />
                        {req.status === 'Issued' ? (
                          <span
                            className="block text-[0.8125rem] font-mono-nums mt-1"
                            style={{ color: 'var(--status-success-ink)' }}
                          >
                            #{req.officialReceiptNumber} · {formatDateShort(req.issuedDate || '')}
                          </span>
                        ) : (
                          <span className="block hig-caption mt-1 tabular-nums">
                            SLA deadline: {formatDateTimeShort(req.slaDeadlineAt)}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-nums font-semibold text-[var(--ink-primary)]">
                        {formatNaira(req.amount)}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        {req.status !== 'Issued' && req.status !== 'Cancelled' ? (
                          <div className="inline-flex items-center gap-2">
                            {!req.acknowledgedAt && req.status !== 'Correction Required' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAckId(req.id);
                                  setAckNote('');
                                }}
                                className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] text-[0.8125rem] font-medium hover:bg-[var(--bg-surface-tertiary)]"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Acknowledge</span>
                              </button>
                            )}
                            {req.status !== 'Correction Required' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIssuingId(req.id);
                                  setReceiptNo(`RCP-2026-${String(state.receiptRequests.length + 115)}`);
                                  setIssuedDate(state.referenceDate);
                                  setEvidenceNote('');
                                }}
                                className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-[0.8125rem] font-semibold hover:bg-[var(--accent-hover)]"
                              >
                                <FileCheck2 className="w-3.5 h-3.5" />
                                <span>Mark Issued</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                cancelReceipt(req.id, 'Cancelled by Property Manager')
                              }
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-[0.8125rem] font-medium"
                              style={{ color: 'var(--status-danger-ink)' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="hig-footnote">Closed</span>
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

      {/* Acknowledge Modal */}
      {ackId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-hairline)',
              boxShadow: 'var(--shadow-sheet)',
            }}
          >
            <h3 className="hig-headline">Record Issuer Acknowledgement</h3>
            <form onSubmit={handleConfirmAck} className="space-y-4">
              <div>
                <label className="block hig-footnote mb-1.5">Acknowledgement Note</label>
                <input
                  type="text"
                  value={ackNote}
                  onChange={(e) => setAckNote(e.target.value)}
                  placeholder="e.g. Folake confirmed on call; issuing this afternoon"
                  className="hig-input w-full"
                />
              </div>
              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setAckId(null)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="hig-btn-primary">
                  Confirm Acknowledgement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark Receipt Issued Modal */}
      {issuingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-receipt-title"
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
              <h3 id="issue-receipt-title" className="hig-headline">
                Confirm Official Receipt Issuance
              </h3>
              <button
                type="button"
                onClick={() => setIssuingId(null)}
                className="hig-touch-icon"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmIssue} className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label htmlFor="rcp-num" className="block hig-footnote mb-1.5">
                  Official Receipt Number / Reference
                </label>
                <input
                  id="rcp-num"
                  type="text"
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                  placeholder="e.g. RCP-2026-118"
                  className="hig-input w-full font-mono-nums"
                  required
                />
              </div>
              <div>
                <label htmlFor="rcp-date" className="block hig-footnote mb-1.5">
                  Issue Date
                </label>
                <input
                  id="rcp-date"
                  type="date"
                  value={issuedDate}
                  onChange={(e) => setIssuedDate(e.target.value)}
                  className="hig-input w-full font-mono-nums"
                  required
                />
              </div>
              <div>
                <label htmlFor="rcp-ev" className="block hig-footnote mb-1.5">
                  Supporting Evidence / Delivery Note
                </label>
                <textarea
                  id="rcp-ev"
                  rows={2}
                  value={evidenceNote}
                  onChange={(e) => setEvidenceNote(e.target.value)}
                  placeholder="e.g. Signed hardcopy handed to tenant; PDF archived in folder."
                  className="hig-input w-full min-h-[72px]"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIssuingId(null)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="hig-btn-primary">
                  Close Request as Issued
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
