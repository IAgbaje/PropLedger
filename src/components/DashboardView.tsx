import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building,
  Calendar,
  CalendarClock,
  Send,
  Users,
} from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import type { AgeingBucket } from '../types/rental';
import { exportFilteredCsv } from '../utils/csvExport';
import { formatDateShort, formatNaira } from '../utils/format';
import {
  buildAllTenantArrearsMap,
  buildMonthlyCollectionsSeries,
  buildPropertyTypeContribution,
  buildTenantPaymentStatusBreakdown,
  buildUpcomingDueDates,
} from '../utils/multiYearArrears';
import { StatusBadge } from './StatusBadge';
import {
  ExportCsvButton,
  FilterMenuButton,
  SearchInput,
  type FilterMenuSection,
} from './TableToolbarControls';

type DashboardFilter =
  | 'All'
  | 'Multi-Year Debtor'
  | 'Multiple Dues (Rent + Levy)'
  | 'Overdue'
  | 'Partially Paid'
  | 'Due'
  | 'Upcoming'
  | 'Under Review'
  | 'Paid / Settled'
  | 'Repeated Late Payment'
  | 'Persistent Arrears'
  | 'Chronic Delinquency'
  | 'Promise Pending/Breached'
  | 'Receipt Pending/Overdue';

const FILTER_SECTIONS: FilterMenuSection[] = [
  {
    options: [{ value: 'All', label: 'All Obligations' }],
  },
  {
    title: 'Debt Profile',
    options: [
      { value: 'Multi-Year Debtor', label: 'Multi-Year Debtor' },
      { value: 'Multiple Dues (Rent + Levy)', label: 'Multiple Dues (Rent + Levy)' },
    ],
  },
  {
    title: 'Settlement & Due Status',
    options: [
      { value: 'Overdue', label: 'Overdue' },
      { value: 'Partially Paid', label: 'Partially Paid' },
      { value: 'Due', label: 'Due' },
      { value: 'Upcoming', label: 'Upcoming' },
      { value: 'Under Review', label: 'Under Review' },
      { value: 'Paid / Settled', label: 'Paid / Settled' },
    ],
  },
  {
    title: 'Behaviour & Queues',
    options: [
      { value: 'Repeated Late Payment', label: 'Repeated Late Payment' },
      { value: 'Persistent Arrears', label: 'Persistent Arrears' },
      { value: 'Chronic Delinquency', label: 'Chronic Delinquency' },
      { value: 'Promise Pending/Breached', label: 'Promise Pending/Breached' },
      { value: 'Receipt Pending/Overdue', label: 'Receipt Pending/Overdue' },
    ],
  },
];

export function DashboardView() {
  const {
    state,
    computedObligations,
    effectiveReceipts,
    evaluatedCommitments,
    tenantBehaviours,
    summaryMetrics,
    ageingSummary,
    setActiveTab,
    setSelectedTenantIdForDrawer,
    setOpenRecordPaymentModal,
    setPreselectedTenantForPayment,
    openComposerFor,
    openCalendarSyncFor,
  } = useRentalStore();

  const [selectedFilter, setSelectedFilter] = useState<DashboardFilter>('All');
  const [selectedBucket, setSelectedBucket] = useState<AgeingBucket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const arrearsMap = useMemo(
    () => buildAllTenantArrearsMap(state.tenants, computedObligations),
    [state.tenants, computedObligations]
  );

  const monthlySeries = useMemo(
    () => buildMonthlyCollectionsSeries(state.payments),
    [state.payments]
  );

  const propertyContribution = useMemo(
    () => buildPropertyTypeContribution(state.units, computedObligations),
    [state.units, computedObligations]
  );

  const statusBreakdown = useMemo(
    () => buildTenantPaymentStatusBreakdown(state.tenants, computedObligations, arrearsMap),
    [state.tenants, computedObligations, arrearsMap]
  );

  const upcomingDueDates = useMemo(
    () =>
      buildUpcomingDueDates(
        state.agreements,
        computedObligations,
        state.units,
        state.tenants,
        state.referenceDate
      ),
    [state.agreements, computedObligations, state.units, state.tenants, state.referenceDate]
  );

  const multiYearAndMultiDueTenants = useMemo(() => {
    return state.tenants
      .filter((t) => !t.archived)
      .map((t) => {
        const profile = arrearsMap[t.id];
        const activeAg = state.agreements.find(
          (a) => a.tenantId === t.id && a.status === 'Active'
        );
        const unit = activeAg
          ? state.units.find((u) => u.id === activeAg.unitId)
          : undefined;
        return { tenant: t, profile, unit };
      })
      .filter(
        ({ profile }) =>
          profile && profile.totalOutstanding > 0 && (profile.isMultiYear || profile.hasMultipleDues)
      )
      .sort((a, b) => {
        if (a.profile.isMultiYear !== b.profile.isMultiYear) {
          return a.profile.isMultiYear ? -1 : 1;
        }
        return b.profile.totalOutstanding - a.profile.totalOutstanding;
      });
  }, [state.tenants, state.agreements, state.units, arrearsMap]);

  const topOutstandingTenants = useMemo(() => {
    return state.tenants
      .filter((t) => !t.archived)
      .map((t) => {
        const profile = arrearsMap[t.id];
        const activeAg = state.agreements.find(
          (a) => a.tenantId === t.id && a.status === 'Active'
        );
        const unit = activeAg
          ? state.units.find((u) => u.id === activeAg.unitId)
          : undefined;
        return { tenant: t, profile, unit };
      })
      .filter(({ profile }) => profile && profile.totalOutstanding > 0)
      .sort((a, b) => b.profile.totalOutstanding - a.profile.totalOutstanding);
  }, [state.tenants, state.agreements, state.units, arrearsMap]);

  const multiYearOnlyCount = multiYearAndMultiDueTenants.filter(
    (x) => x.profile.isMultiYear
  ).length;
  const multiYearTotalOwed = multiYearAndMultiDueTenants
    .filter((x) => x.profile.isMultiYear)
    .reduce((s, x) => s + x.profile.totalOutstanding, 0);

  const collectionRate =
    summaryMetrics.expectedRent > 0
      ? Math.round((summaryMetrics.rentCollected / summaryMetrics.expectedRent) * 1000) / 10
      : 0;

  const tenantIdsWithPromiseIssue = useMemo(() => {
    const set = new Set<string>();
    for (const ec of evaluatedCommitments) {
      if (
        ec.effectiveStatus === 'Open' ||
        ec.effectiveStatus === 'Partially Fulfilled' ||
        ec.effectiveStatus === 'Breached'
      ) {
        set.add(ec.commitment.tenantId);
      }
    }
    return set;
  }, [evaluatedCommitments]);

  const tenantIdsWithPendingReceipt = useMemo(() => {
    const set = new Set<string>();
    for (const r of effectiveReceipts) {
      if (r.status !== 'Issued' && r.status !== 'Cancelled') {
        set.add(r.tenantId);
      }
    }
    return set;
  }, [effectiveReceipts]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return computedObligations
      .filter((co) => {
        const tenant = state.tenants.find((t) => t.id === co.obligation.tenantId);
        const unit = state.units.find((u) => u.id === co.obligation.unitId);
        const behaviour = tenant ? tenantBehaviours[tenant.id] : 'Current';
        const arrearsProf = tenant ? arrearsMap[tenant.id] : undefined;

        if (q) {
          const text = `${tenant?.firstName} ${tenant?.lastName} ${unit?.code} ${unit?.name} ${co.obligation.rentalPeriodLabel}`.toLowerCase();
          if (!text.includes(q)) return false;
        }

        if (selectedBucket && co.ageingBucket !== selectedBucket) return false;
        if (selectedBucket && co.amountOutstanding <= 0) return false;

        switch (selectedFilter) {
          case 'Multi-Year Debtor':
            return Boolean(arrearsProf?.isMultiYear) && co.amountOutstanding > 0;
          case 'Multiple Dues (Rent + Levy)':
            return Boolean(arrearsProf?.hasMultipleDues) && co.amountOutstanding > 0;
          case 'Upcoming':
            return co.dueDatePosition === 'Upcoming' && co.amountOutstanding > 0;
          case 'Due':
            return co.dueDatePosition === 'Due' && co.amountOutstanding > 0;
          case 'Under Review':
            return (co.obligation.underReview || co.dueDatePosition === 'Under Review') && co.amountOutstanding > 0;
          case 'Partially Paid':
            return co.settlementPosition === 'Partially Paid';
          case 'Overdue':
            return co.dueDatePosition === 'Overdue' && co.amountOutstanding > 0;
          case 'Paid / Settled':
            return co.settlementPosition === 'Paid / Settled';
          case 'Repeated Late Payment':
            return behaviour === 'Repeated Late Payment';
          case 'Persistent Arrears':
            return behaviour === 'Persistent Arrears';
          case 'Chronic Delinquency':
            return behaviour === 'Chronic Delinquency';
          case 'Promise Pending/Breached':
            return tenant ? tenantIdsWithPromiseIssue.has(tenant.id) : false;
          case 'Receipt Pending/Overdue':
            return tenant ? tenantIdsWithPendingReceipt.has(tenant.id) : false;
          case 'All':
          default:
            return true;
        }
      })
      .sort(
        (a, b) =>
          b.daysPastDue - a.daysPastDue ||
          a.obligation.dueDate.localeCompare(b.obligation.dueDate)
      );
  }, [
    computedObligations,
    state.tenants,
    state.units,
    tenantBehaviours,
    arrearsMap,
    searchQuery,
    selectedBucket,
    selectedFilter,
    tenantIdsWithPromiseIssue,
    tenantIdsWithPendingReceipt,
  ]);

  const urgentReceipts = effectiveReceipts.filter(
    (r) => r.status !== 'Issued' && r.status !== 'Cancelled'
  );
  const breachedOrDuePromises = evaluatedCommitments.filter(
    (c) =>
      c.effectiveStatus === 'Breached' ||
      c.effectiveStatus === 'Open' ||
      c.effectiveStatus === 'Partially Fulfilled'
  );
  const failedNotifications = state.notifications.filter(
    (n) => n.status === 'Failed' || n.status === 'Exhausted / Action Required'
  );

  const maxAgeingAmount = Math.max(1, ...ageingSummary.map((a) => a.amount));
  const maxMonthlyCollected = Math.max(1, ...monthlySeries.map((m) => m.amount));
  const maxTenantOwed = Math.max(
    1,
    ...topOutstandingTenants.map((item) => item.profile.totalOutstanding)
  );

  const handleOpenDebtorComposer = (tenantId: string) => {
    const tenant = state.tenants.find((t) => t.id === tenantId);
    const prof = arrearsMap[tenantId];
    const activeAg = state.agreements.find((a) => a.tenantId === tenantId && a.status === 'Active');
    const unit = activeAg ? state.units.find((u) => u.id === activeAg.unitId) : undefined;
    if (!tenant || !prof) return;

    const lines = [
      ...prof.unpaidRentCycles.map(
        (c) => `• ${c.periodLabel}: ${formatNaira(c.amountOutstanding)} (Due ${formatDateShort(c.dueDate)}${c.daysPastDue > 0 ? `, ${c.daysPastDue}d overdue` : ''})`
      ),
      ...prof.unpaidLevyCycles.map(
        (c) => `• ${c.periodLabel}: ${formatNaira(c.amountOutstanding)}`
      ),
    ];

    openComposerFor({
      directoryRecipientIds: [`tenant:${tenant.id}`],
      linkedTenantId: tenant.id,
      channelMode: 'Both',
      intent: prof.isMultiYear ? 'Multi-Year Arrears Notice' : 'Arrears & Levy Reminder',
      subject: `${prof.isMultiYear ? 'URGENT Multi-Year' : 'Outstanding'} Arrears Notice: ${unit?.code || 'Unit'} — ${tenant.firstName} ${tenant.lastName}`,
      emailBody: `Dear ${tenant.firstName} ${tenant.lastName},\n\nOur records at ${state.property.name} (${unit?.code || ''}) reflect an outstanding balance totaling ${formatNaira(prof.totalOutstanding)}:\n\n${lines.join('\n')}\n\nPlease remit payment promptly or contact ${state.property.managerName} to confirm settlement details.\n\nRegards,\n${state.property.managerName}\n${state.property.name}`,
      smsBody: `${state.property.name}: Dear ${tenant.firstName}, your ${unit?.code || ''} balance is ${formatNaira(prof.totalOutstanding)} (${prof.unpaidYears.length ? `cycles: ${prof.unpaidYears.join(', ')}` : 'open dues'}). Please remit & confirm with ${state.property.managerName}.`,
    });
  };

  const handleExportObligationsCsv = () => {
    exportFilteredCsv(
      `propledger-obligations-${state.referenceDate}.csv`,
      [
        'Tenant Name',
        'Unit Code',
        'Unit Name',
        'Unit Type',
        'Arrears Tier',
        'Obligation Period',
        'Charge Type',
        'Due Date',
        'Days Overdue',
        'Ageing Bucket',
        'Settlement Status',
        'Due Status',
        'Behaviour Indicator',
        'Amount Due (NGN)',
        'Amount Paid (NGN)',
        'Outstanding Balance (NGN)',
      ],
      filteredRows.map((co) => {
        const tenant = state.tenants.find((t) => t.id === co.obligation.tenantId);
        const unit = state.units.find((u) => u.id === co.obligation.unitId);
        const behaviour = tenant ? tenantBehaviours[tenant.id] : 'Current';
        const tier = tenant ? arrearsMap[tenant.id]?.tier || 'Clear' : 'Clear';
        return [
          tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Unknown Tenant',
          unit?.code || '',
          unit?.name || '',
          unit?.type || '',
          tier,
          co.obligation.rentalPeriodLabel,
          co.obligation.chargeType,
          co.obligation.dueDate,
          co.daysPastDue,
          co.ageingBucket,
          co.settlementPosition,
          co.dueDatePosition,
          behaviour,
          co.obligation.originalAmount,
          co.amountAllocated,
          co.amountOutstanding,
        ];
      })
    );
  };

  const totalStatusTenants = Math.max(
    1,
    statusBreakdown.fullyPaidCount +
      statusBreakdown.partiallyPaidCount +
      statusBreakdown.notPaidCount
  );

  return (
    <div className="space-y-8 min-w-0">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="hig-large-title">
            Rent Collection &amp; Operations Overview
          </h1>
          <p className="hig-subhead mt-1.5 leading-relaxed">
            {state.property.name} · {state.property.address} <span aria-hidden="true">·</span> As of{' '}
            {formatDateShort(state.referenceDate)} <span aria-hidden="true">·</span>{' '}
            {state.units.filter((u) => u.occupancyStatus === 'Occupied').length} of{' '}
            {state.units.length} units occupied
          </p>
        </div>
        <div className="flex items-center gap-2 hig-footnote shrink-0">
          <span>Collection rate</span>
          <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">{collectionRate}%</span>
          <span aria-hidden="true">·</span>
          <span>Grace period {state.settings.gracePeriodDays}d</span>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <section
        aria-label="Primary financial metrics"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <div className="hig-card p-5">
          <span className="hig-caption block">Expected Annual Rent</span>
          <p className="hig-title-1 font-mono-nums mt-1.5">
            {formatNaira(summaryMetrics.expectedRent)}
          </p>
          <p className="hig-caption mt-2.5">
            Total charges incl. levies:{' '}
            <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
              {formatNaira(summaryMetrics.totalChargesExpected)}
            </span>
          </p>
        </div>

        <div className="hig-card p-5">
          <span className="hig-caption block">Rent Collected</span>
          <p
            className="hig-title-1 font-mono-nums mt-1.5"
            style={{ color: 'var(--status-success-ink)' }}
          >
            {formatNaira(summaryMetrics.rentCollected)}
          </p>
          <p className="hig-caption mt-2.5">
            Allocated across{' '}
            {state.payments.filter((p) => p.status === 'Confirmed').length} confirmed payments (
            {formatNaira(summaryMetrics.totalChargesCollected)} incl. levies)
          </p>
        </div>

        <div className="hig-card p-5">
          <span className="hig-caption block">
            Outstanding Balance (Rent + Levies)
          </span>
          <p className="hig-title-1 font-mono-nums mt-1.5">
            {formatNaira(summaryMetrics.totalOutstanding)}
          </p>
          <div className="hig-caption mt-2.5 flex items-center flex-wrap gap-x-1.5 gap-y-1">
            <span className="font-semibold" style={{ color: 'var(--status-danger-ink)' }}>
              {summaryMetrics.overdueTenantCount} tenant(s)
            </span>
            <span>past grace ·</span>
            <button
              type="button"
              onClick={() => setSelectedFilter('Multi-Year Debtor')}
              className="font-semibold underline underline-offset-2 min-h-[36px] inline-flex items-center hover:opacity-80"
              style={{ color: 'var(--status-danger-ink)' }}
            >
              {multiYearOnlyCount} multi-year ({formatNaira(multiYearTotalOwed)})
            </button>
          </div>
        </div>

        <div className="hig-card p-5">
          <span className="hig-caption block mb-2">
            Operational Payables &amp; Outgoings
          </span>
          <div className="space-y-1.5 hig-footnote">
            <div className="flex items-center justify-between gap-2 min-h-[32px]">
              <span className="text-[var(--ink-secondary)]">Lawyer Commission Bal.</span>
              <button
                type="button"
                onClick={() => setActiveTab('commissions')}
                className="font-mono-nums font-semibold text-[var(--ink-primary)] hover:underline whitespace-nowrap"
              >
                {formatNaira(summaryMetrics.commissionOutstanding)}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 min-h-[32px]">
              <span className="text-[var(--ink-secondary)]">
                Property Expenses ({summaryMetrics.propertyOperatingExpenseCount})
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('expenses')}
                className="font-mono-nums font-semibold text-[var(--ink-primary)] hover:underline whitespace-nowrap"
              >
                {formatNaira(summaryMetrics.propertyOperatingExpenses)}
              </button>
            </div>
            {summaryMetrics.nonPropertyOutgoingCount > 0 && (
              <div className="flex items-center justify-between gap-2 min-h-[32px]">
                <span className="text-[var(--ink-secondary)]">
                  Purse Outgoings ({summaryMetrics.nonPropertyOutgoingCount})
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('expenses')}
                  className="font-mono-nums font-semibold hover:underline whitespace-nowrap"
                  style={{ color: 'var(--status-warning-ink)' }}
                >
                  {formatNaira(summaryMetrics.nonPropertyOutgoings)}
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 min-h-[32px]">
              <span className="text-[var(--ink-secondary)]">Receipts Queue</span>
              <button
                type="button"
                onClick={() => setActiveTab('receipts')}
                className="font-mono-nums font-semibold hover:underline whitespace-nowrap"
                style={{
                  color:
                    summaryMetrics.overdueReceiptCount > 0
                      ? 'var(--status-danger-ink)'
                      : 'var(--ink-primary)',
                }}
              >
                {summaryMetrics.pendingReceiptCount} open · {summaryMetrics.overdueReceiptCount} SLA
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Prominent Multi-Year & Multiple-Dues Debtors Watchlist */}
      <section
        aria-label="Multi-Year Debtors Watchlist"
        className="hig-card overflow-hidden"
        style={{ borderColor: 'color-mix(in srgb, var(--status-danger-ink) 26%, transparent)' }}
      >
        <div
          className="px-5 sm:px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--status-danger-bg)',
            borderColor: 'color-mix(in srgb, var(--status-danger-ink) 16%, transparent)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="p-2 rounded-xl shrink-0 mt-0.5 bg-[var(--bg-surface)]"
              style={{ color: 'var(--status-danger-ink)' }}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="hig-headline">
                Multi-Year &amp; Multiple-Dues Debtors Watchlist ({multiYearAndMultiDueTenants.length})
              </h2>
              <p className="hig-footnote mt-0.5 text-[var(--ink-secondary)]">
                Tenants owing across multiple rent years (e.g. 2025 &amp; 2026) or combined Rent + ₦4,000 Security Levy arrears.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('arrears-promises')}
              className="hig-btn-secondary !bg-[var(--bg-surface)]"
            >
              Open Full Arrears View
            </button>
          </div>
        </div>

        {/* Mobile Multi-Year Cards (< md) */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {multiYearAndMultiDueTenants.map(({ tenant, profile, unit }) => (
            <div key={tenant.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedTenantIdForDrawer(tenant.id)}
                  className="text-left min-w-0 min-h-[44px]"
                >
                  <span className="font-semibold text-[1rem] text-[var(--ink-primary)] block truncate">
                    {tenant.firstName} {tenant.lastName}
                  </span>
                  <span className="hig-caption block truncate">
                    {unit?.code} · {unit?.name}
                  </span>
                </button>
                <div className="text-right shrink-0">
                  <span
                    className="font-mono-nums font-bold text-[1.0625rem] block"
                    style={{ color: 'var(--status-danger-ink)' }}
                  >
                    {formatNaira(profile.totalOutstanding)}
                  </span>
                  <span className="hig-caption font-mono-nums">
                    {profile.maxDaysPastDue > 0 ? `${profile.maxDaysPastDue}d past due` : 'Upcoming'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <StatusBadge label={profile.tier} />
                {profile.isMultiYear && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] border border-[var(--border-hairline)] text-[0.75rem] font-mono-nums font-semibold">
                    {profile.unpaidYears.length} Years: {profile.unpaidYears.join(', ')}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between hig-caption pt-1">
                <span>Rent: {formatNaira(profile.unpaidRentAmount)}</span>
                <span style={{ color: 'var(--status-warning-ink)' }}>
                  Levy: {formatNaira(profile.unpaidLevyAmount)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleOpenDebtorComposer(tenant.id)}
                  className="hig-btn-secondary w-full"
                >
                  <Send className="w-4 h-4" />
                  <span>Message</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreselectedTenantForPayment(tenant.id);
                    setOpenRecordPaymentModal(true);
                  }}
                  className="hig-btn-primary w-full"
                >
                  Pay
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Multi-Year Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className="border-b hig-caption uppercase tracking-[0.03em]"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <th className="py-3 px-5">Tenant &amp; Unit</th>
                <th className="py-3 px-4">Debt Tier &amp; Years Owed</th>
                <th className="py-3 px-4 text-right">Rent Owed</th>
                <th className="py-3 px-4 text-right">Security Levy</th>
                <th className="py-3 px-4 text-right">Total Balance</th>
                <th className="py-3 px-4 text-right">Oldest Overdue</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody
              className="divide-y text-[0.875rem]"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {multiYearAndMultiDueTenants.map(({ tenant, profile, unit }) => (
                <tr
                  key={tenant.id}
                  className="hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <td className="py-3.5 px-5">
                    <button
                      type="button"
                      onClick={() => setSelectedTenantIdForDrawer(tenant.id)}
                      className="text-left group min-h-[44px] flex flex-col justify-center"
                    >
                      <span className="font-semibold text-[var(--ink-primary)] group-hover:underline block">
                        {tenant.firstName} {tenant.lastName}
                      </span>
                      <span className="hig-caption">
                        {unit?.code} · {unit?.name}
                      </span>
                    </button>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge label={profile.tier} />
                      {profile.isMultiYear && (
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--bg-surface-secondary)] text-[var(--ink-primary)] border border-[var(--border-hairline)] text-[0.75rem] font-mono-nums font-semibold">
                          {profile.unpaidYears.length} Years: {profile.unpaidYears.join(', ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-nums text-[var(--ink-primary)]">
                    {formatNaira(profile.unpaidRentAmount)}
                  </td>
                  <td
                    className="py-3.5 px-4 text-right font-mono-nums"
                    style={{ color: 'var(--status-warning-ink)' }}
                  >
                    {formatNaira(profile.unpaidLevyAmount)}
                  </td>
                  <td
                    className="py-3.5 px-4 text-right font-mono-nums font-semibold"
                    style={{ color: 'var(--status-danger-ink)' }}
                  >
                    {formatNaira(profile.totalOutstanding)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-nums text-[var(--ink-secondary)]">
                    {profile.maxDaysPastDue > 0 ? `${profile.maxDaysPastDue}d past due` : 'Upcoming'}
                  </td>
                  <td className="py-3.5 px-5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenDebtorComposer(tenant.id)}
                        className="hig-btn-secondary !px-3"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Message</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreselectedTenantForPayment(tenant.id);
                          setOpenRecordPaymentModal(true);
                        }}
                        className="hig-btn-primary !px-3.5"
                      >
                        Pay
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5 Main Analytics Charts */}
      <section aria-label="Main portfolio analytics charts" className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Chart 1: Total Rent Collected per Month (6 cols) */}
        <div className="lg:col-span-6 hig-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 shrink-0" style={{ color: 'var(--status-success-ink)' }} />
              <h2 className="hig-headline">Total Rent Collected per Month</h2>
            </div>
            <span className="hig-caption font-mono-nums">
              {monthlySeries.length} active months
            </span>
          </div>
          <div
            className="h-44 flex items-end gap-2 pt-4 pb-1 border-b"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            {monthlySeries.map((pt) => {
              const heightPct = Math.max(8, Math.round((pt.amount / maxMonthlyCollected) * 100));
              return (
                <div
                  key={pt.monthKey}
                  className="flex-1 flex flex-col items-center justify-end h-full min-w-0 group"
                  title={`${pt.label}: ${formatNaira(pt.amount)} (${pt.count} payments)`}
                >
                  <span className="text-[0.6875rem] font-mono-nums text-[var(--ink-secondary)] mb-1 truncate">
                    {pt.amount >= 1000 ? `${Math.round(pt.amount / 1000)}k` : pt.amount}
                  </span>
                  <div
                    className="w-full max-w-[36px] rounded-t-md bg-[#34C759]/85 group-hover:bg-[#28A745] transition-colors"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 pt-2">
            {monthlySeries.map((pt) => (
              <span
                key={pt.monthKey}
                className="flex-1 text-center text-[0.6875rem] font-mono-nums text-[var(--ink-tertiary)] truncate"
              >
                {pt.label}
              </span>
            ))}
          </div>
        </div>

        {/* Chart 2: Outstanding Amount by Tenant (6 cols) */}
        <div className="lg:col-span-6 hig-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <h2 className="hig-headline">Outstanding Amount by Tenant</h2>
            <div className="flex items-center gap-3 hig-caption">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#FF3B30]" aria-hidden="true" /> Multi-Year
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#FF9500]" aria-hidden="true" /> Rent + Levy
              </span>
            </div>
          </div>
          <div className="space-y-1.5 max-h-[224px] overflow-y-auto pr-1">
            {topOutstandingTenants.slice(0, 8).map(({ tenant, profile, unit }) => {
              const widthPct = Math.max(
                6,
                Math.round((profile.totalOutstanding / maxTenantOwed) * 100)
              );
              const barColor = profile.isMultiYear
                ? 'bg-[#FF3B30]'
                : profile.hasMultipleDues
                ? 'bg-[#FF9500]'
                : 'bg-[var(--accent)]';
              return (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => setSelectedTenantIdForDrawer(tenant.id)}
                  className="w-full text-left group min-h-[44px] py-1.5 px-2 -mx-2 rounded-xl hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="flex items-center justify-between text-[0.8125rem] mb-1.5 gap-2">
                    <span className="font-medium text-[var(--ink-primary)] group-hover:underline truncate">
                      {tenant.firstName} {tenant.lastName}{' '}
                      <span className="text-[var(--ink-tertiary)] font-normal">({unit?.code})</span>
                      {profile.isMultiYear && (
                        <span
                          className="ml-1.5 text-[0.6875rem] font-semibold"
                          style={{ color: 'var(--status-danger-ink)' }}
                        >
                          [{profile.unpaidYears.join(', ')}]
                        </span>
                      )}
                    </span>
                    <span className="font-mono-nums font-semibold text-[var(--ink-primary)] shrink-0">
                      {formatNaira(profile.totalOutstanding)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[var(--bg-surface-secondary)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart 3: Shops vs Apartments Contribution (4 cols) */}
        <div className="lg:col-span-4 hig-card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building className="w-4 h-4 text-[var(--accent-ink)] shrink-0" />
            <h2 className="hig-headline">Shops vs Apartments Contribution</h2>
          </div>
          <div className="space-y-3.5">
            {propertyContribution.map((seg) => (
              <div key={seg.segment} className="hig-card-inset p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.875rem] font-semibold text-[var(--ink-primary)]">
                    {seg.segment}
                  </span>
                  <span className="hig-caption font-mono-nums shrink-0">
                    {seg.unitCount} units · {seg.collectionRatePct}% paid
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[var(--bg-surface-tertiary)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${seg.collectionRatePct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[0.75rem] font-mono-nums">
                  <span style={{ color: 'var(--status-success-ink)' }}>
                    Collected: {formatNaira(seg.collected)}
                  </span>
                  <span style={{ color: 'var(--status-danger-ink)' }}>
                    Owed: {formatNaira(seg.outstanding)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 4: Number of Tenants in Arrears & Payment Status Breakdown (4 cols) */}
        <div className="lg:col-span-4 hig-card p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--status-danger-ink)' }} />
            <h2 className="hig-headline">Number of Tenants in Arrears</h2>
          </div>
          <div className="h-3.5 w-full rounded-full bg-[var(--bg-surface-secondary)] overflow-hidden flex mb-4">
            <div
              className="bg-[#34C759]"
              style={{
                width: `${Math.round((statusBreakdown.fullyPaidCount / totalStatusTenants) * 100)}%`,
              }}
              title={`Fully Paid: ${statusBreakdown.fullyPaidCount}`}
            />
            <div
              className="bg-[#FF9500]"
              style={{
                width: `${Math.round((statusBreakdown.partiallyPaidCount / totalStatusTenants) * 100)}%`,
              }}
              title={`Partially Paid: ${statusBreakdown.partiallyPaidCount}`}
            />
            <div
              className="bg-[#FF3B30]"
              style={{
                width: `${Math.round((statusBreakdown.notPaidCount / totalStatusTenants) * 100)}%`,
              }}
              title={`Not Paid / Open Dues: ${statusBreakdown.notPaidCount}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--status-success-bg)' }}>
              <span className="block text-[0.75rem] font-medium" style={{ color: 'var(--status-success-ink)' }}>
                Fully Settled
              </span>
              <span className="hig-title-2 font-mono-nums mt-0.5 block">
                {statusBreakdown.fullyPaidCount}
              </span>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--status-warning-bg)' }}>
              <span className="block text-[0.75rem] font-medium" style={{ color: 'var(--status-warning-ink)' }}>
                Partially Paid
              </span>
              <span className="hig-title-2 font-mono-nums mt-0.5 block">
                {statusBreakdown.partiallyPaidCount}
              </span>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--status-danger-bg)' }}>
              <span className="block text-[0.75rem] font-medium" style={{ color: 'var(--status-danger-ink)' }}>
                Past Due / Unpaid
              </span>
              <span className="hig-title-2 font-mono-nums mt-0.5 block">
                {statusBreakdown.inArrearsCount}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-surface-secondary)]">
              <span className="block text-[0.75rem] font-medium text-[var(--ink-secondary)]">
                Multi-Year Debtors
              </span>
              <span
                className="hig-title-2 font-mono-nums mt-0.5 block"
                style={{ color: 'var(--status-danger-ink)' }}
              >
                {statusBreakdown.multiYearCount}
              </span>
            </div>
          </div>
        </div>

        {/* Chart 5: Upcoming Due Dates Calendar (4 cols) */}
        <div className="lg:col-span-4 hig-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <CalendarClock className="w-4 h-4 text-[var(--accent-ink)] shrink-0" />
              <h2 className="hig-headline truncate">Upcoming Due Dates Calendar</h2>
            </div>
            <button
              type="button"
              onClick={() => openCalendarSyncFor()}
              className="hig-btn-primary !px-3 !text-[0.8125rem] whitespace-nowrap shrink-0"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Sync Calendar</span>
            </button>
          </div>
          <div className="space-y-2 max-h-[224px] overflow-y-auto pr-1">
            {upcomingDueDates.length === 0 ? (
              <p className="hig-footnote">No upcoming renewals or open dues.</p>
            ) : (
              upcomingDueDates.slice(0, 7).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedTenantIdForDrawer(item.tenantId)}
                  className="w-full min-h-[48px] text-left p-2.5 rounded-xl bg-[var(--bg-surface-secondary)] hover:bg-[var(--bg-surface-tertiary)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="text-[0.875rem] font-medium text-[var(--ink-primary)] block truncate">
                      {item.tenantName}
                    </span>
                    <span className="hig-caption font-mono-nums block truncate">
                      {item.unitCode} · {formatDateShort(item.dueDate)} (
                      {item.daysUntilDue >= 0 ? `in ${item.daysUntilDue}d` : `${Math.abs(item.daysUntilDue)}d ago`})
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[0.875rem] font-mono-nums font-semibold text-[var(--ink-primary)] block">
                      {formatNaira(item.amount)}
                    </span>
                    <span
                      className="text-[0.6875rem] font-semibold"
                      style={{ color: 'var(--status-warning-ink)' }}
                    >
                      {item.statusLabel}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Arrears Ageing & Attention Queues Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Arrears Ageing Breakdown (7 cols) */}
        <div className="lg:col-span-7 hig-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="hig-headline">Arrears Ageing Buckets</h2>
              <p className="hig-footnote mt-0.5">
                Click any bucket to filter the rental obligations ledger below.
              </p>
            </div>
            {selectedBucket && (
              <button
                type="button"
                onClick={() => setSelectedBucket(null)}
                className="min-h-[44px] px-3 rounded-xl hig-footnote font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-soft)]"
              >
                Clear bucket filter
              </button>
            )}
          </div>

          <div className="space-y-2">
            {ageingSummary.map((row) => {
              const isSelected = selectedBucket === row.bucket;
              const widthPct =
                row.amount > 0 ? Math.max(4, Math.round((row.amount / maxAgeingAmount) * 100)) : 0;
              const isHighRisk = row.bucket === '61–90 days' || row.bucket === '> 90 days';
              const isMidRisk = row.bucket === '8–30 days' || row.bucket === '31–60 days';

              return (
                <button
                  key={row.bucket}
                  type="button"
                  onClick={() => setSelectedBucket(isSelected ? null : row.bucket)}
                  className={`w-full min-h-[48px] text-left p-3 rounded-xl transition-all border ${
                    isSelected
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                      : 'bg-[var(--bg-surface)] border-transparent hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[0.875rem] mb-1.5 gap-2">
                    <span className="font-medium text-[var(--ink-primary)]">
                      {row.bucket}
                      <span className="ml-2 hig-caption tabular-nums">
                        {row.count} obligation{row.count === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="font-mono-nums font-semibold text-[var(--ink-primary)]">
                      {formatNaira(row.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--bg-surface-secondary)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        row.bucket === 'Not Yet Due'
                          ? 'bg-[var(--ink-tertiary)]'
                          : isHighRisk
                          ? 'bg-[#FF3B30]'
                          : isMidRisk
                          ? 'bg-[#FF9500]'
                          : 'bg-[var(--accent)]'
                      }`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Immediate Action Queue (5 cols) */}
        <div className="lg:col-span-5 hig-card flex flex-col overflow-hidden">
          <div className="px-5 sm:px-6 pt-5 pb-4 border-b" style={{ borderColor: 'var(--border-hairline)' }}>
            <h2 className="hig-headline">Action &amp; Escalation Queue</h2>
            <p className="hig-footnote mt-0.5">
              Items requiring Property Manager confirmation or follow-up.
            </p>
          </div>

          <div className="divide-y flex-1" style={{ borderColor: 'var(--border-subtle)' }}>
            {urgentReceipts.slice(0, 2).map((req) => {
              const tenant = state.tenants.find((t) => t.id === req.tenantId);
              return (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => setActiveTab('receipts')}
                  className="w-full min-h-[60px] text-left px-5 sm:px-6 py-3.5 hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[0.875rem] font-medium text-[var(--ink-primary)] truncate">
                        Receipt {req.paymentRef} · {tenant?.firstName} {tenant?.lastName}
                      </span>
                      <StatusBadge label={req.status} />
                    </div>
                    <p className="hig-caption mt-0.5 tabular-nums">
                      {formatNaira(req.amount)} paid {formatDateShort(req.datePaid)}
                    </p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-[var(--ink-tertiary)] shrink-0" />
                </button>
              );
            })}

            {breachedOrDuePromises.slice(0, 2).map((ec) => {
              const tenant = state.tenants.find((t) => t.id === ec.commitment.tenantId);
              return (
                <button
                  key={ec.commitment.id}
                  type="button"
                  onClick={() => setActiveTab('arrears-promises')}
                  className="w-full min-h-[60px] text-left px-5 sm:px-6 py-3.5 hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[0.875rem] font-medium text-[var(--ink-primary)] truncate">
                        Promise · {tenant?.firstName} {tenant?.lastName}
                      </span>
                      <StatusBadge label={ec.effectiveStatus} />
                    </div>
                    <p className="hig-caption mt-0.5 tabular-nums">
                      {formatNaira(ec.commitment.promisedAmount)} promised for{' '}
                      {formatDateShort(
                        ec.commitment.extendedUntilDate || ec.commitment.promisedDate
                      )}
                    </p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-[var(--ink-tertiary)] shrink-0" />
                </button>
              );
            })}

            {failedNotifications.slice(0, 1).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setActiveTab('notifications')}
                className="w-full min-h-[60px] text-left px-5 sm:px-6 py-3.5 hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[0.875rem] font-medium text-[var(--ink-primary)] truncate">
                      {n.channel} Failed · {n.recipientName}
                    </span>
                    <StatusBadge label={n.status} />
                  </div>
                  <p className="hig-caption mt-0.5 truncate">
                    {n.failureReason || n.eventType}
                  </p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-[var(--ink-tertiary)] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Operational Obligations & Tenant Status Table / Mobile Card Stack */}
      <section className="hig-card w-full min-w-0">
        <div className="p-5 sm:p-6 border-b rounded-t-2xl" style={{ borderColor: 'var(--border-hairline)' }}>
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="hig-headline">Rental Obligations Ledger</h2>
              <p className="hig-footnote mt-0.5">
                Settlement status and due-date status tracked independently per policy.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 shrink-0">
              <FilterMenuButton
                label="Filter"
                value={selectedFilter}
                defaultValue="All"
                onChange={(val) => setSelectedFilter(val as DashboardFilter)}
                sections={FILTER_SECTIONS}
                ariaLabel="Filter rental obligations"
              />
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search unit number or tenant name..."
                ariaLabel="Search obligations by unit number or tenant name"
                className="w-full sm:w-56"
              />
              <ExportCsvButton
                onClick={handleExportObligationsCsv}
                disabled={filteredRows.length === 0}
                count={filteredRows.length}
              />
            </div>
          </div>
        </div>

        {/* Mobile Cards (< md) */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {filteredRows.length === 0 ? (
            <div className="py-10 px-6 text-center hig-footnote">
              No obligations match the current filter criteria.
            </div>
          ) : (
            filteredRows.map((co) => {
              const tenant = state.tenants.find((t) => t.id === co.obligation.tenantId);
              const unit = state.units.find((u) => u.id === co.obligation.unitId);
              const prof = tenant ? arrearsMap[tenant.id] : undefined;

              return (
                <div key={co.obligation.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                      className="text-left min-w-0 min-h-[44px]"
                    >
                      <span className="font-semibold text-[1rem] text-[var(--ink-primary)] block truncate">
                        {tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Unknown Tenant'}
                      </span>
                      <span className="hig-caption block truncate">
                        {unit?.code} · {unit?.name} · {co.obligation.rentalPeriodLabel}
                      </span>
                    </button>
                    <div className="text-right shrink-0">
                      <span className="font-mono-nums font-bold text-[1rem] text-[var(--ink-primary)] block">
                        {formatNaira(co.amountOutstanding)}
                      </span>
                      <span className="hig-caption font-mono-nums">
                        Due {formatDateShort(co.obligation.dueDate)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge label={co.settlementPosition} />
                    {co.settlementPosition !== 'Paid / Settled' && (
                      <StatusBadge label={co.dueDatePosition} />
                    )}
                    {prof?.isMultiYear && co.amountOutstanding > 0 && (
                      <StatusBadge label={`Multi-Year (${prof.unpaidYears.join(', ')})`} tone="danger" />
                    )}
                  </div>

                  <div className="flex items-center justify-between hig-caption font-mono-nums">
                    <span>Total Due: {formatNaira(co.obligation.originalAmount)}</span>
                    <span style={{ color: 'var(--status-success-ink)' }}>
                      Paid: {formatNaira(co.amountAllocated)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                      className="hig-btn-secondary flex-1"
                    >
                      Inspect
                    </button>
                    {co.amountOutstanding > 0 && tenant && (
                      <button
                        type="button"
                        onClick={() => {
                          setPreselectedTenantForPayment(tenant.id);
                          setOpenRecordPaymentModal(true);
                        }}
                        className="hig-btn-primary flex-1"
                      >
                        Pay
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block w-full overflow-x-auto rounded-b-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr
                className="border-b hig-caption uppercase tracking-[0.03em]"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <th className="py-3 px-5">Tenant &amp; Unit</th>
                <th className="py-3 px-4">Obligation &amp; Period</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4">Settlement / Due Status</th>
                <th className="py-3 px-4">Behaviour (Internal)</th>
                <th className="py-3 px-4 text-right">Amount Due</th>
                <th className="py-3 px-4 text-right">Paid</th>
                <th className="py-3 px-4 text-right">Outstanding</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody
              className="divide-y text-[0.875rem]"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 px-6 text-center hig-footnote">
                    No obligations match the current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRows.map((co) => {
                  const tenant = state.tenants.find((t) => t.id === co.obligation.tenantId);
                  const unit = state.units.find((u) => u.id === co.obligation.unitId);
                  const behaviour = tenant ? tenantBehaviours[tenant.id] : 'Current';
                  const prof = tenant ? arrearsMap[tenant.id] : undefined;

                  return (
                    <tr key={co.obligation.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                      <td className="py-3.5 px-5">
                        <button
                          type="button"
                          onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                          className="text-left group min-h-[44px] flex flex-col justify-center"
                        >
                          <span className="font-medium text-[var(--ink-primary)] group-hover:underline block">
                            {tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Unknown Tenant'}
                          </span>
                          <span className="hig-caption">
                            {unit?.code} · {unit?.name} · {unit?.type}
                          </span>
                          {prof?.isMultiYear && co.amountOutstanding > 0 && (
                            <span
                              className="block text-[0.75rem] font-semibold mt-0.5"
                              style={{ color: 'var(--status-danger-ink)' }}
                            >
                              Multi-Year Debtor ({prof.unpaidYears.join(', ')})
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[var(--ink-primary)] font-medium block">
                          {co.obligation.rentalPeriodLabel}
                        </span>
                        <span className="hig-caption">
                          {co.obligation.chargeType}
                          {co.obligation.reviewReason ? ` · ${co.obligation.reviewReason}` : ''}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono-nums text-[var(--ink-primary)] block">
                          {formatDateShort(co.obligation.dueDate)}
                        </span>
                        {co.daysPastDue > 0 && (
                          <span
                            className="text-[0.75rem] font-medium tabular-nums"
                            style={{ color: 'var(--status-danger-ink)' }}
                          >
                            {co.daysPastDue}d overdue ({co.ageingBucket})
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusBadge label={co.settlementPosition} />
                          {co.settlementPosition !== 'Paid / Settled' && (
                            <StatusBadge label={co.dueDatePosition} />
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge label={behaviour} />
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-nums text-[var(--ink-secondary)]">
                        {formatNaira(co.obligation.originalAmount)}
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
                          <button
                            type="button"
                            onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                            className="hig-btn-secondary !px-3"
                          >
                            Inspect
                          </button>
                          {co.amountOutstanding > 0 && tenant && (
                            <button
                              type="button"
                              onClick={() => {
                                setPreselectedTenantForPayment(tenant.id);
                                setOpenRecordPaymentModal(true);
                              }}
                              className="hig-btn-primary !px-3.5"
                            >
                              Pay
                            </button>
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
    </div>
  );
}
