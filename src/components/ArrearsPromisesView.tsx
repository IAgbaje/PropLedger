import React, { useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CalendarPlus, Plus, Send, X } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import { exportFilteredCsv } from '../utils/csvExport';
import { formatDateShort, formatNaira, parseCurrencyValue } from '../utils/format';
import { buildAllTenantArrearsMap } from '../utils/multiYearArrears';
import { CurrencyInput } from './CurrencyInput';
import { StatusBadge } from './StatusBadge';
import { ExportCsvButton, SearchInput } from './TableToolbarControls';

type ArrearsScopeFilter = 'all' | 'multi-year' | 'levy-dues' | 'under-review';

export function ArrearsPromisesView() {
  const {
    state,
    computedObligations,
    evaluatedCommitments,
    tenantBehaviours,
    setSelectedTenantIdForDrawer,
    setPreselectedTenantForPayment,
    setOpenRecordPaymentModal,
    openComposerFor,
    openCalendarSyncFor,
    recordCommitment,
    extendCommitment,
    cancelCommitment,
  } = useRentalStore();

  const [showPromiseModal, setShowPromiseModal] = useState(false);
  const [pTenantId, setPTenantId] = useState('');
  const [pObligationIds, setPObligationIds] = useState<string[]>([]);
  const [pAmount, setPAmount] = useState('');
  const [pDate, setPDate] = useState('2026-11-28');
  const [pNotes, setPNotes] = useState('');
  const [pError, setPError] = useState('');

  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [extDate, setExtDate] = useState('2026-12-05');
  const [extReason, setExtReason] = useState('');
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<ArrearsScopeFilter>('all');

  const q = search.trim().toLowerCase();

  const arrearsMap = useMemo(
    () => buildAllTenantArrearsMap(state.tenants, computedObligations),
    [state.tenants, computedObligations]
  );

  const groupedDebtors = useMemo(() => {
    return state.tenants
      .filter((t) => !t.archived)
      .map((t) => {
        const prof = arrearsMap[t.id];
        const activeAg = state.agreements.find(
          (a) => a.tenantId === t.id && (a.status === 'Active' || a.status === 'Draft')
        );
        const unit = activeAg
          ? state.units.find((u) => u.id === activeAg.unitId)
          : undefined;
        return { tenant: t, prof, unit };
      })
      .filter(({ tenant, prof, unit }) => {
        if (!prof || prof.totalOutstanding <= 0) return false;
        if (scopeFilter === 'multi-year' && !prof.isMultiYear) return false;
        if (scopeFilter === 'levy-dues' && !prof.hasUnpaidSecurityLevy) return false;
        if (scopeFilter === 'under-review' && !prof.hasUnderReview) return false;
        if (!q) return true;
        const text = `${tenant.firstName} ${tenant.lastName} ${unit?.code || ''} ${unit?.name || ''} ${prof.unpaidYears.join(' ')}`.toLowerCase();
        return text.includes(q);
      })
      .sort((a, b) => {
        if (a.prof.isMultiYear !== b.prof.isMultiYear) return a.prof.isMultiYear ? -1 : 1;
        if (a.prof.hasMultipleDues !== b.prof.hasMultipleDues) return a.prof.hasMultipleDues ? -1 : 1;
        return b.prof.maxDaysPastDue - a.prof.maxDaysPastDue || b.prof.totalOutstanding - a.prof.totalOutstanding;
      });
  }, [state.tenants, state.agreements, state.units, arrearsMap, scopeFilter, q]);

  const overdueObligations = useMemo(() => {
    return computedObligations
      .filter((c) => {
        if (c.amountOutstanding <= 0) return false;
        const prof = arrearsMap[c.obligation.tenantId];
        if (
          c.dueDatePosition !== 'Overdue' &&
          c.dueDatePosition !== 'Due' &&
          c.dueDatePosition !== 'Under Review' &&
          !prof?.isMultiYear
        ) {
          return false;
        }
        if (scopeFilter === 'multi-year' && !prof?.isMultiYear) return false;
        if (scopeFilter === 'levy-dues' && c.obligation.chargeType !== 'Security Levy' && !prof?.hasUnpaidSecurityLevy) return false;
        if (scopeFilter === 'under-review' && !c.obligation.underReview) return false;

        if (!q) return true;
        const tenant = state.tenants.find((t) => t.id === c.obligation.tenantId);
        const unit = state.units.find((u) => u.id === c.obligation.unitId);
        const text = `${tenant?.firstName} ${tenant?.lastName} ${unit?.code} ${unit?.name} ${c.obligation.rentalPeriodLabel}`.toLowerCase();
        return text.includes(q);
      })
      .sort((a, b) => b.daysPastDue - a.daysPastDue);
  }, [computedObligations, arrearsMap, scopeFilter, q, state.tenants, state.units]);

  const filteredCommitments = useMemo(() => {
    if (!q) return evaluatedCommitments;
    return evaluatedCommitments.filter((ec) => {
      const tenant = state.tenants.find((t) => t.id === ec.commitment.tenantId);
      const linkedUnitIds = new Set(
        ec.commitment.obligationIds
          .map((id) => state.obligations.find((o) => o.id === id)?.unitId)
          .filter(Boolean)
      );
      const activeAg = state.agreements.find(
        (a) => a.tenantId === ec.commitment.tenantId && a.status === 'Active'
      );
      if (activeAg) linkedUnitIds.add(activeAg.unitId);
      const unitText = Array.from(linkedUnitIds)
        .map((uid) => {
          const u = state.units.find((item) => item.id === uid);
          return u ? `${u.code} ${u.name}` : '';
        })
        .join(' ');
      const text = `${tenant?.firstName} ${tenant?.lastName} ${unitText} ${ec.commitment.notes}`.toLowerCase();
      return text.includes(q);
    });
  }, [evaluatedCommitments, q, state.tenants, state.obligations, state.agreements, state.units]);

  const tenantsWithOpenObs = useMemo(() => {
    const ids = new Set(
      computedObligations.filter((c) => c.amountOutstanding > 0).map((c) => c.obligation.tenantId)
    );
    return state.tenants.filter((t) => ids.has(t.id));
  }, [computedObligations, state.tenants]);

  const openModalForTenant = (tenantId?: string) => {
    const targetId = tenantId || tenantsWithOpenObs[0]?.id || '';
    setPTenantId(targetId);
    const obs = computedObligations.filter(
      (c) => c.obligation.tenantId === targetId && c.amountOutstanding > 0
    );
    setPObligationIds(obs.map((o) => o.obligation.id));
    setPAmount(String(obs.reduce((s, o) => s + o.amountOutstanding, 0)));
    setPNotes('');
    setPError('');
    setShowPromiseModal(true);
  };

  const handleOpenEscalateComposer = (tenantId: string) => {
    const tenant = state.tenants.find((t) => t.id === tenantId);
    const prof = arrearsMap[tenantId];
    const activeAg = state.agreements.find((a) => a.tenantId === tenantId && a.status === 'Active');
    const unit = activeAg ? state.units.find((u) => u.id === activeAg.unitId) : undefined;
    const lawyer = state.contacts.find((c) => c.role === 'Lawyer');
    if (!tenant || !prof) return;

    const itemLines = [
      ...prof.unpaidRentCycles.map(
        (c) => `• ${c.periodLabel}: ${formatNaira(c.amountOutstanding)} (Due ${formatDateShort(c.dueDate)}${c.daysPastDue > 0 ? `, ${c.daysPastDue}d overdue` : ''})`
      ),
      ...prof.unpaidLevyCycles.map(
        (c) => `• ${c.periodLabel}: ${formatNaira(c.amountOutstanding)}`
      ),
    ];

    const recipientIds = [`tenant:${tenant.id}`];
    if (prof.isMultiYear && lawyer) {
      recipientIds.push(`contact:${lawyer.id}`);
    }

    openComposerFor({
      directoryRecipientIds: recipientIds,
      linkedTenantId: tenant.id,
      channelMode: 'Both',
      intent: prof.isMultiYear ? 'Multi-Year Arrears & Legal Escalation' : 'Overdue Rent & Levy Reminder',
      subject: `${prof.isMultiYear ? 'URGENT Multi-Year Arrears Notice' : 'Overdue Arrears Reminder'}: ${unit?.code || 'Unit'} — ${tenant.firstName} ${tenant.lastName}`,
      emailBody: `Dear ${tenant.firstName} ${tenant.lastName},\n\nThis notice outlines the total unpaid balance of ${formatNaira(prof.totalOutstanding)} on ${unit?.code || 'your unit'} at ${state.property.name}:\n\n${itemLines.join('\n')}\n\nKindly arrange immediate settlement or reach out to ${state.property.managerName}${lawyer ? ` / Legal Counsel (${lawyer.name})` : ''} with your payment schedule.\n\nRegards,\n${state.property.managerName}\n${state.property.name}`,
      smsBody: `${state.property.name}: ${tenant.firstName} (${unit?.code || ''}), balance ${formatNaira(prof.totalOutstanding)} across ${prof.unpaidYears.length ? prof.unpaidYears.join(' & ') : 'open dues'} is past due. Please remit & confirm with ${state.property.managerName}.`,
    });
  };

  const handleTenantChange = (newTenantId: string) => {
    setPTenantId(newTenantId);
    const obs = computedObligations.filter(
      (c) => c.obligation.tenantId === newTenantId && c.amountOutstanding > 0
    );
    setPObligationIds(obs.map((o) => o.obligation.id));
    setPAmount(String(obs.reduce((s, o) => s + o.amountOutstanding, 0)));
  };

  const handleSavePromise = (e: React.FormEvent) => {
    e.preventDefault();
    const res = recordCommitment({
      tenantId: pTenantId,
      obligationIds: pObligationIds,
      promisedAmount: parseCurrencyValue(pAmount),
      promisedDate: pDate,
      notes: pNotes,
    });
    if (!res.ok) {
      setPError(res.error || 'Could not record promise.');
      return;
    }
    setShowPromiseModal(false);
  };

  const selectedTenantOpenObs = computedObligations.filter(
    (c) => c.obligation.tenantId === pTenantId && c.amountOutstanding > 0
  );

  const handleExportArrearsCsv = () => {
    exportFilteredCsv(
      `propledger-arrears-${state.referenceDate}.csv`,
      [
        'Tenant Name',
        'Unit Code',
        'Unit Name',
        'Arrears Tier',
        'Obligation Period',
        'Due Date',
        'Due Position',
        'Days Past Due',
        'Ageing Bucket',
        'Internal Behaviour',
        'Paid So Far (NGN)',
        'Remaining Balance (NGN)',
      ],
      overdueObligations.map((co) => {
        const tenant = state.tenants.find((t) => t.id === co.obligation.tenantId);
        const unit = state.units.find((u) => u.id === co.obligation.unitId);
        const tier = tenant ? arrearsMap[tenant.id]?.tier || 'Overdue' : 'Overdue';
        return [
          tenant ? `${tenant.firstName} ${tenant.lastName}` : '',
          unit?.code || '',
          unit?.name || '',
          tier,
          co.obligation.rentalPeriodLabel,
          co.obligation.dueDate,
          co.dueDatePosition,
          co.daysPastDue,
          co.ageingBucket,
          tenant ? tenantBehaviours[tenant.id] : 'Current',
          co.amountAllocated,
          co.amountOutstanding,
        ];
      })
    );
  };

  const handleExportCommitmentsCsv = () => {
    exportFilteredCsv(
      `propledger-commitments-${state.referenceDate}.csv`,
      [
        'Tenant Name',
        'Unit Code',
        'Promised Date',
        'Extended Until',
        'Status',
        'Promised Amount (NGN)',
        'Confirmed Paid (NGN)',
        'Notes',
      ],
      filteredCommitments.map((ec) => {
        const tenant = state.tenants.find((t) => t.id === ec.commitment.tenantId);
        const activeAg = state.agreements.find(
          (a) => a.tenantId === ec.commitment.tenantId && a.status === 'Active'
        );
        const unit = activeAg ? state.units.find((u) => u.id === activeAg.unitId) : undefined;
        return [
          tenant ? `${tenant.firstName} ${tenant.lastName}` : '',
          unit?.code || '',
          ec.commitment.promisedDate,
          ec.commitment.extendedUntilDate || '',
          ec.effectiveStatus,
          ec.commitment.promisedAmount,
          ec.amountPaidTowardsObligations,
          ec.commitment.notes,
        ];
      })
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="hig-title-1">Arrears & Payment Commitments</h1>
          <p className="hig-callout mt-1">
            Track multi-year debtors, unpaid rent & security levies, internal behaviour flags, and promises to pay.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openCalendarSyncFor()}
            className="hig-btn-secondary whitespace-nowrap"
          >
            <Calendar className="w-4 h-4" />
            <span>Calendar Reminders</span>
          </button>
          <button
            type="button"
            onClick={() => openModalForTenant()}
            disabled={tenantsWithOpenObs.length === 0}
            className="hig-btn-primary whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Record Promise to Pay</span>
          </button>
        </div>
      </div>

      {/* Real-time Search + Quick Scope Filter */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search unit number or tenant name..."
            ariaLabel="Search arrears and commitments by unit number or tenant name"
            className="w-full sm:w-80"
          />
          <div className="flex flex-wrap items-center gap-2">
            <ExportCsvButton
              onClick={handleExportArrearsCsv}
              disabled={overdueObligations.length === 0}
              count={overdueObligations.length}
              label="Export Arrears CSV"
            />
            <ExportCsvButton
              onClick={handleExportCommitmentsCsv}
              disabled={filteredCommitments.length === 0}
              count={filteredCommitments.length}
              label="Export Promises CSV"
            />
          </div>
        </div>

        <div className="hig-segmented w-full sm:w-fit" role="group" aria-label="Arrears scope filter">
          {(
            [
              { id: 'all', label: 'All Open Arrears' },
              { id: 'multi-year', label: 'Multi-Year Debtors Only' },
              { id: 'levy-dues', label: 'With Security Levy Dues' },
              { id: 'under-review', label: 'Under Review (Aisha)' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setScopeFilter(f.id)}
              data-active={scopeFilter === f.id}
              className="hig-segmented-item"
              style={
                scopeFilter === f.id && f.id === 'multi-year'
                  ? {
                      backgroundColor: 'var(--status-danger-bg)',
                      color: 'var(--status-danger-ink)',
                    }
                  : undefined
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped Tenant Arrears Summary (Multi-Year & Multiple Dues) */}
      <section className="hig-card overflow-hidden">
        <div
          className="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--bg-surface-secondary)',
            borderColor: 'var(--border-hairline)',
          }}
        >
          <div className="flex items-start sm:items-center gap-2.5">
            <AlertTriangle
              className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0"
              style={{ color: 'var(--status-danger-ink)' }}
            />
            <div>
              <h2 className="hig-headline">
                Tenants Grouped by Total Arrears & Multiple Years ({groupedDebtors.length})
              </h2>
              <p className="hig-footnote mt-0.5">
                Consolidated tenant view showing owed years (e.g. 2025, 2026) and Rent vs Security Levy split.
              </p>
            </div>
          </div>
        </div>

        {/* Mobile Stacked Cards */}
        <div
          className="md:hidden divide-y"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {groupedDebtors.length === 0 ? (
            <p className="py-8 px-4 text-center hig-subhead">
              No tenants match the selected arrears filter.
            </p>
          ) : (
            groupedDebtors.map(({ tenant, prof, unit }) => (
              <div
                key={tenant.id}
                className="p-4 space-y-3"
                style={{
                  backgroundColor: prof.isMultiYear ? 'var(--status-danger-bg)' : undefined,
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedTenantIdForDrawer(tenant.id)}
                    className="text-left min-h-[44px] flex flex-col justify-center"
                  >
                    <span className="hig-headline block">
                      {tenant.firstName} {tenant.lastName}
                    </span>
                    <span className="hig-footnote">
                      {unit?.code} · {unit?.name}
                    </span>
                  </button>
                  <div className="text-right shrink-0">
                    <span
                      className="hig-headline font-mono-nums block"
                      style={{ color: 'var(--status-danger-ink)' }}
                    >
                      {formatNaira(prof.totalOutstanding)}
                    </span>
                    <span className="hig-caption font-mono-nums">
                      {prof.maxDaysPastDue > 0 ? `${prof.maxDaysPastDue}d overdue` : 'Due Soon'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <StatusBadge label={prof.tier} />
                  {prof.isMultiYear && (
                    <span
                      className="px-2 py-0.5 rounded-md text-[0.75rem] font-mono-nums font-semibold"
                      style={{
                        backgroundColor: 'var(--ink-primary)',
                        color: 'var(--bg-surface)',
                      }}
                    >
                      {prof.unpaidYears.length} Years: {prof.unpaidYears.join(', ')}
                    </span>
                  )}
                  {prof.hasUnderReview && <StatusBadge label="Under Review" />}
                </div>

                <div className="grid grid-cols-2 gap-2 hig-card-inset p-3">
                  <div>
                    <span className="hig-caption block">Rent Owed</span>
                    <span className="hig-subhead font-mono-nums font-semibold text-[var(--ink-primary)]">
                      {formatNaira(prof.unpaidRentAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="hig-caption block">Security Levy</span>
                    <span
                      className="hig-subhead font-mono-nums font-semibold"
                      style={{ color: 'var(--status-warning-ink)' }}
                    >
                      {formatNaira(prof.unpaidLevyAmount)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEscalateComposer(tenant.id)}
                    className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[0.8125rem] font-semibold transition-transform active:scale-[0.98]"
                    style={{
                      backgroundColor: 'var(--status-danger-bg)',
                      color: 'var(--status-danger-ink)',
                    }}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{prof.isMultiYear ? 'Escalate / SMS' : 'Message'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openModalForTenant(tenant.id)}
                    className="flex-1 hig-btn-secondary"
                  >
                    Promise
                  </button>
                </div>
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
                style={{
                  borderColor: 'var(--border-hairline)',
                  color: 'var(--ink-tertiary)',
                }}
              >
                <th className="py-3 px-5">Tenant & Unit</th>
                <th className="py-3 px-4">Tier & Owed Cycles</th>
                <th className="py-3 px-4 text-right">Rent Owed</th>
                <th className="py-3 px-4 text-right">Security Levy</th>
                <th className="py-3 px-4 text-right">Total Balance</th>
                <th className="py-3 px-4 text-right">Oldest Overdue</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
              {groupedDebtors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center hig-subhead">
                    No tenants match the selected arrears filter.
                  </td>
                </tr>
              ) : (
                groupedDebtors.map(({ tenant, prof, unit }) => (
                  <tr
                    key={tenant.id}
                    className="transition-colors hover:bg-[var(--bg-hover)]"
                    style={
                      prof.isMultiYear
                        ? { backgroundColor: 'color-mix(in srgb, var(--status-danger-bg) 35%, transparent)' }
                        : undefined
                    }
                  >
                    <td className="py-3.5 px-5">
                      <button
                        type="button"
                        onClick={() => setSelectedTenantIdForDrawer(tenant.id)}
                        className="text-left hover:underline"
                      >
                        <span className="font-semibold text-[var(--ink-primary)] block">
                          {tenant.firstName} {tenant.lastName}
                        </span>
                        <span className="hig-footnote">
                          {unit?.code} · {unit?.name}
                        </span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge label={prof.tier} />
                        {prof.isMultiYear && (
                          <span
                            className="px-2 py-0.5 rounded-md text-[0.75rem] font-mono-nums font-medium"
                            style={{
                              backgroundColor: 'var(--ink-primary)',
                              color: 'var(--bg-surface)',
                            }}
                          >
                            {prof.unpaidYears.length} Years: {prof.unpaidYears.join(', ')}
                          </span>
                        )}
                        {prof.hasUnderReview && <StatusBadge label="Under Review" />}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-nums text-[var(--ink-primary)]">
                      {formatNaira(prof.unpaidRentAmount)}
                    </td>
                    <td
                      className="py-3.5 px-4 text-right font-mono-nums"
                      style={{ color: 'var(--status-warning-ink)' }}
                    >
                      {formatNaira(prof.unpaidLevyAmount)}
                    </td>
                    <td
                      className="py-3.5 px-4 text-right font-mono-nums font-semibold"
                      style={{ color: 'var(--status-danger-ink)' }}
                    >
                      {formatNaira(prof.totalOutstanding)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-nums text-[var(--ink-secondary)]">
                      {prof.maxDaysPastDue > 0 ? `${prof.maxDaysPastDue}d` : 'Due Soon'}
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEscalateComposer(tenant.id)}
                          className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg text-[0.8125rem] font-medium transition-opacity hover:opacity-85"
                          style={{
                            backgroundColor: 'var(--status-danger-bg)',
                            color: 'var(--status-danger-ink)',
                          }}
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{prof.isMultiYear ? 'Escalate / SMS' : 'Message'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openModalForTenant(tenant.id)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] text-[0.8125rem] font-medium hover:bg-[var(--bg-surface-tertiary)]"
                        >
                          Promise
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Overdue & Due Arrears Queue */}
      <section className="hig-card overflow-hidden">
        <div
          className="px-4 sm:px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <div>
            <h2 className="hig-headline">
              Individual Due & Overdue Obligations ({overdueObligations.length})
            </h2>
            <p className="hig-footnote mt-0.5">
              Ordered by longest days past due. Promises to pay never reduce balances before funds are confirmed.
            </p>
          </div>
        </div>

        {/* Mobile Stacked Cards */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {overdueObligations.length === 0 ? (
            <p className="py-8 px-4 text-center hig-subhead">
              No due or overdue obligations at this time.
            </p>
          ) : (
            overdueObligations.map((co) => {
              const tenant = state.tenants.find((t) => t.id === co.obligation.tenantId);
              const unit = state.units.find((u) => u.id === co.obligation.unitId);
              const behaviour = tenant ? tenantBehaviours[tenant.id] : 'Current';

              return (
                <div key={co.obligation.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                      className="text-left min-h-[44px] flex flex-col justify-center"
                    >
                      <span className="hig-headline block">
                        {tenant?.firstName} {tenant?.lastName}
                      </span>
                      <span className="hig-footnote">
                        {unit?.code} · {co.obligation.rentalPeriodLabel}
                      </span>
                    </button>
                    <div className="text-right shrink-0">
                      <span className="hig-headline font-mono-nums block">
                        {formatNaira(co.amountOutstanding)}
                      </span>
                      <span className="hig-caption">Due {formatDateShort(co.obligation.dueDate)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge label={co.dueDatePosition} />
                    <StatusBadge label={behaviour} />
                    {co.daysPastDue > 0 && (
                      <span
                        className="text-[0.75rem] font-mono-nums font-semibold"
                        style={{ color: 'var(--status-danger-ink)' }}
                      >
                        {co.daysPastDue}d ({co.ageingBucket})
                      </span>
                    )}
                  </div>

                  {tenant && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openModalForTenant(tenant.id)}
                        className="flex-1 hig-btn-secondary"
                      >
                        Log Promise
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreselectedTenantForPayment(tenant.id);
                          setOpenRecordPaymentModal(true);
                        }}
                        className="flex-1 hig-btn-primary"
                      >
                        Record Pay
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
                className="border-b text-[0.75rem] font-semibold uppercase tracking-[0.03em]"
                style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-tertiary)' }}
              >
                <th className="py-3 px-5">Tenant & Unit</th>
                <th className="py-3 px-4">Obligation</th>
                <th className="py-3 px-4">Ageing & Days Overdue</th>
                <th className="py-3 px-4">Internal Behaviour</th>
                <th className="py-3 px-4 text-right">Paid So Far</th>
                <th className="py-3 px-4 text-right">Remaining Balance</th>
                <th className="py-3 px-5 text-right">Follow-Up</th>
              </tr>
            </thead>
            <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
              {overdueObligations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center hig-subhead">
                    No due or overdue obligations at this time.
                  </td>
                </tr>
              ) : (
                overdueObligations.map((co) => {
                  const tenant = state.tenants.find((t) => t.id === co.obligation.tenantId);
                  const unit = state.units.find((u) => u.id === co.obligation.unitId);
                  const behaviour = tenant ? tenantBehaviours[tenant.id] : 'Current';

                  return (
                    <tr key={co.obligation.id} className="hover:bg-[var(--bg-hover)]">
                      <td className="py-3.5 px-5">
                        <button
                          type="button"
                          onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                          className="text-left hover:underline"
                        >
                          <span className="font-semibold text-[var(--ink-primary)] block">
                            {tenant?.firstName} {tenant?.lastName}
                          </span>
                          <span className="hig-footnote">
                            {unit?.code} · {unit?.name}
                          </span>
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[var(--ink-primary)] block">{co.obligation.rentalPeriodLabel}</span>
                        <span className="hig-footnote">
                          Due {formatDateShort(co.obligation.dueDate)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <StatusBadge label={co.dueDatePosition} />
                          {co.daysPastDue > 0 && (
                            <span
                              className="text-[0.8125rem] font-mono-nums font-medium"
                              style={{ color: 'var(--status-danger-ink)' }}
                            >
                              {co.daysPastDue}d ({co.ageingBucket})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge label={behaviour} />
                      </td>
                      <td
                        className="py-3.5 px-4 text-right font-mono-nums"
                        style={{ color: 'var(--status-success-ink)' }}
                      >
                        {formatNaira(co.amountAllocated)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-nums font-semibold text-[var(--ink-primary)]">
                        {formatNaira(co.amountOutstanding)}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {tenant && (
                            <>
                              <button
                                type="button"
                                onClick={() => openModalForTenant(tenant.id)}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] text-[0.8125rem] font-medium hover:bg-[var(--bg-surface-tertiary)]"
                              >
                                Log Promise
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPreselectedTenantForPayment(tenant.id);
                                  setOpenRecordPaymentModal(true);
                                }}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-[0.8125rem] font-semibold hover:bg-[var(--accent-hover)]"
                              >
                                Record Pay
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payment Commitments (Promise to Pay) Section */}
      <section className="hig-card overflow-hidden">
        <div
          className="px-4 sm:px-6 py-4 border-b"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <h2 className="hig-headline">
            Tenant Payment Commitments ({filteredCommitments.length})
          </h2>
          <p className="hig-footnote mt-0.5">
            Automatically marked Fulfilled, Partially Fulfilled, or Breached based on confirmed payment allocations.
          </p>
        </div>

        {/* Mobile Stacked Cards */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {filteredCommitments.length === 0 ? (
            <p className="py-8 px-4 text-center hig-subhead">
              No payment commitments match your filter.
            </p>
          ) : (
            filteredCommitments.map((ec) => {
              const { commitment, effectiveStatus, amountPaidTowardsObligations } = ec;
              const tenant = state.tenants.find((t) => t.id === commitment.tenantId);
              const deadline = commitment.extendedUntilDate || commitment.promisedDate;

              return (
                <div key={commitment.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                      className="text-left min-h-[44px] flex flex-col justify-center"
                    >
                      <span className="hig-headline block">
                        {tenant?.firstName} {tenant?.lastName}
                      </span>
                      <span className="hig-footnote font-mono-nums">
                        Deadline: {formatDateShort(deadline)}
                      </span>
                    </button>
                    <StatusBadge label={effectiveStatus} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 hig-card-inset p-3">
                    <div>
                      <span className="hig-caption block">Promised</span>
                      <span className="hig-subhead font-mono-nums font-semibold text-[var(--ink-primary)]">
                        {formatNaira(commitment.promisedAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="hig-caption block">Confirmed Paid</span>
                      <span
                        className="hig-subhead font-mono-nums font-semibold"
                        style={{ color: 'var(--status-success-ink)' }}
                      >
                        {formatNaira(amountPaidTowardsObligations)}
                      </span>
                    </div>
                  </div>

                  {commitment.notes && (
                    <p className="hig-footnote">{commitment.notes}</p>
                  )}

                  {effectiveStatus !== 'Fulfilled' && effectiveStatus !== 'Cancelled' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setExtendingId(commitment.id);
                          setExtDate('2026-12-05');
                          setExtReason('');
                        }}
                        className="flex-1 hig-btn-secondary"
                      >
                        <CalendarPlus className="w-4 h-4" />
                        <span>Extend</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          cancelCommitment(commitment.id, 'Cancelled by Property Manager')
                        }
                        className="flex-1 min-h-[44px] px-3 py-2 rounded-xl text-[0.875rem] font-semibold"
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
                className="border-b text-[0.75rem] font-semibold uppercase tracking-[0.03em]"
                style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-tertiary)' }}
              >
                <th className="py-3 px-5">Tenant</th>
                <th className="py-3 px-4">Promised Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Promised Amount</th>
                <th className="py-3 px-4 text-right">Confirmed Paid</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
              {filteredCommitments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center hig-subhead">
                    No payment commitments match your filter.
                  </td>
                </tr>
              ) : (
                filteredCommitments.map((ec) => {
                  const { commitment, effectiveStatus, amountPaidTowardsObligations } = ec;
                  const tenant = state.tenants.find((t) => t.id === commitment.tenantId);
                  const deadline = commitment.extendedUntilDate || commitment.promisedDate;

                  return (
                    <tr key={commitment.id} className="hover:bg-[var(--bg-hover)]">
                      <td className="py-3.5 px-5 font-semibold text-[var(--ink-primary)]">
                        <button
                          type="button"
                          onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                          className="hover:underline"
                        >
                          {tenant?.firstName} {tenant?.lastName}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 font-mono-nums text-[var(--ink-primary)]">
                        {formatDateShort(deadline)}
                        {commitment.extendedUntilDate && (
                          <span className="block hig-caption">
                            Extended from {formatDateShort(commitment.promisedDate)}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge label={effectiveStatus} />
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-nums font-semibold text-[var(--ink-primary)]">
                        {formatNaira(commitment.promisedAmount)}
                      </td>
                      <td
                        className="py-3.5 px-4 text-right font-mono-nums"
                        style={{ color: 'var(--status-success-ink)' }}
                      >
                        {formatNaira(amountPaidTowardsObligations)}
                      </td>
                      <td className="py-3.5 px-4 text-[0.8125rem] text-[var(--ink-secondary)] max-w-[260px]">
                        {commitment.notes || '—'}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        {effectiveStatus !== 'Fulfilled' && effectiveStatus !== 'Cancelled' && (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setExtendingId(commitment.id);
                                setExtDate('2026-12-05');
                                setExtReason('');
                              }}
                              className="inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] text-[0.8125rem] font-medium hover:bg-[var(--bg-surface-tertiary)]"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                              <span>Extend</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                cancelCommitment(commitment.id, 'Cancelled by Property Manager')
                              }
                              className="min-h-[36px] px-3 py-1.5 rounded-lg text-[0.8125rem] font-medium"
                              style={{
                                backgroundColor: 'var(--status-danger-bg)',
                                color: 'var(--status-danger-ink)',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Record Promise Modal */}
      {showPromiseModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="promise-modal-title"
        >
          <div
            className="w-full max-w-lg rounded-2xl border overflow-hidden max-h-[92vh] flex flex-col"
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
              <h3 id="promise-modal-title" className="hig-headline">
                Record Tenant Payment Commitment
              </h3>
              <button
                type="button"
                onClick={() => setShowPromiseModal(false)}
                className="hig-touch-icon"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSavePromise} className="p-5 space-y-4 overflow-y-auto">
              {pError && (
                <p className="hig-subhead" style={{ color: 'var(--status-danger-ink)' }}>
                  {pError}
                </p>
              )}
              <div>
                <label className="block hig-footnote mb-1.5">Tenant</label>
                <select
                  value={pTenantId}
                  onChange={(e) => handleTenantChange(e.target.value)}
                  className="hig-input w-full"
                >
                  {tenantsWithOpenObs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block hig-footnote mb-1.5">Linked Obligations</span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto p-3 hig-card-inset">
                  {selectedTenantOpenObs.map((co) => (
                    <label
                      key={co.obligation.id}
                      className="flex items-center justify-between min-h-[36px] text-[0.875rem] cursor-pointer gap-2"
                    >
                      <span className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={pObligationIds.includes(co.obligation.id)}
                          onChange={(e) => {
                            setPObligationIds((prev) =>
                              e.target.checked
                                ? [...prev, co.obligation.id]
                                : prev.filter((id) => id !== co.obligation.id)
                            );
                          }}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-[var(--ink-primary)]">{co.obligation.rentalPeriodLabel}</span>
                      </span>
                      <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
                        {formatNaira(co.amountOutstanding)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block hig-footnote mb-1.5">Promised Amount (₦)</label>
                  <CurrencyInput
                    min={1}
                    value={pAmount}
                    onValueChange={(raw) => setPAmount(raw)}
                    placeholder="e.g. 4,000,000"
                    className="hig-input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block hig-footnote mb-1.5">Promised Date</label>
                  <input
                    type="date"
                    value={pDate}
                    onChange={(e) => setPDate(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block hig-footnote mb-1.5">Follow-up Notes</label>
                <textarea
                  rows={2}
                  value={pNotes}
                  onChange={(e) => setPNotes(e.target.value)}
                  placeholder="Summary of phone call or written arrangement..."
                  className="hig-input w-full min-h-[72px]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPromiseModal(false)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="hig-btn-primary">
                  Save Commitment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Extend Commitment Modal */}
      {extendingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-5 space-y-4"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-hairline)',
              boxShadow: 'var(--shadow-sheet)',
            }}
          >
            <h3 className="hig-headline">Extend Commitment Deadline</h3>
            <div className="space-y-3">
              <div>
                <label className="block hig-footnote mb-1.5">Approved New Date</label>
                <input
                  type="date"
                  value={extDate}
                  onChange={(e) => setExtDate(e.target.value)}
                  className="hig-input w-full font-mono-nums"
                />
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">Reason</label>
                <input
                  type="text"
                  value={extReason}
                  onChange={(e) => setExtReason(e.target.value)}
                  placeholder="Approved 7-day extension..."
                  className="hig-input w-full"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setExtendingId(null)}
                className="hig-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  extendCommitment(extendingId, extDate, extReason || 'Approved extension');
                  setExtendingId(null);
                }}
                className="hig-btn-primary"
              >
                Save Extension
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
