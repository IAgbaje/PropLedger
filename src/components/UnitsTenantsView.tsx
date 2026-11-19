import React, { useMemo, useState } from 'react';
import { Plus, Send, X } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import type { RentCycle, UnitOccupancyStatus, UnitType } from '../types/rental';
import { exportFilteredCsv } from '../utils/csvExport';
import { formatDateShort, formatNaira, parseCurrencyValue } from '../utils/format';
import { buildAllTenantArrearsMap } from '../utils/multiYearArrears';
import {
  filterAgreementsByQuery,
  filterTenantsByQuery,
  filterUnitsByQuery,
} from '../utils/unitsTenantsSearch';
import { CurrencyInput } from './CurrencyInput';
import { StatusBadge } from './StatusBadge';
import { ExportCsvButton, SearchInput } from './TableToolbarControls';

type SubView = 'tenants' | 'units' | 'agreements';
type QuickDebtorFilter = 'all' | 'multi-year' | 'all-arrears' | 'needs-review';

const UNIT_TYPES: UnitType[] = [
  'Bedroom',
  'Room',
  'Room & Parlour',
  'Shop',
  'Kiosk',
  'Container Shop',
  'Other',
];

export function UnitsTenantsView() {
  const {
    state,
    computedObligations,
    tenantBehaviours,
    setSelectedTenantIdForDrawer,
    openComposerFor,
    createUnit,
    updateUnitStatus,
    createTenant,
    createAgreement,
  } = useRentalStore();

  const [subView, setSubView] = useState<SubView>('tenants');
  const [quickFilter, setQuickFilter] = useState<QuickDebtorFilter>('all');
  const [search, setSearch] = useState('');

  // Modal states
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [unitCode, setUnitCode] = useState('');
  const [unitName, setUnitName] = useState('');
  const [unitType, setUnitType] = useState<UnitType>('Bedroom');
  const [unitWing, setUnitWing] = useState('First Floor');
  const [unitStatus, setUnitStatus] = useState<UnitOccupancyStatus>('Vacant');
  const [unitError, setUnitError] = useState('');

  const [showAddTenancy, setShowAddTenancy] = useState(false);
  const [tenancyMode, setTenancyMode] = useState<'new-tenant' | 'existing-tenant'>('new-tenant');
  const [existingTenantId, setExistingTenantId] = useState('');
  const [tFirst, setTFirst] = useState('');
  const [tLast, setTLast] = useState('');
  const [tPhone, setTPhone] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [agUnitId, setAgUnitId] = useState('');
  const [agRent, setAgRent] = useState('');
  const [agLevy, setAgLevy] = useState(String(state.settings.securityLevyAmount));
  const [agCycle, setAgCycle] = useState<RentCycle>(state.settings.defaultRentCycle);
  const [agStart, setAgStart] = useState('2026-11-18');
  const [agEnd, setAgEnd] = useState('2027-11-17');
  const [agDue, setAgDue] = useState('2026-11-18');
  const [agLabel, setAgLabel] = useState('2026/2027 Annual Rent');
  const [agException, setAgException] = useState('');
  const [tenancyError, setTenancyError] = useState('');

  const arrearsMap = useMemo(
    () => buildAllTenantArrearsMap(state.tenants, computedObligations),
    [state.tenants, computedObligations]
  );

  const handleCreateUnit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createUnit({
      code: unitCode,
      name: unitName,
      type: unitType,
      floorOrWing: unitWing,
      occupancyStatus: unitStatus,
    });
    if (!res.ok) {
      setUnitError(res.error || 'Could not create unit.');
      return;
    }
    setUnitCode('');
    setUnitName('');
    setUnitError('');
    setShowAddUnit(false);
  };

  const handleCreateTenancy = (e: React.FormEvent) => {
    e.preventDefault();
    setTenancyError('');

    let targetTenantId = existingTenantId;
    if (tenancyMode === 'new-tenant') {
      const tRes = createTenant({
        firstName: tFirst,
        lastName: tLast,
        phone: tPhone,
        email: tEmail,
      });
      if (!tRes.ok || !tRes.tenantId) {
        setTenancyError(tRes.error || 'Could not create tenant.');
        return;
      }
      targetTenantId = tRes.tenantId;
    }

    if (!targetTenantId || !agUnitId) {
      setTenancyError('Select both a tenant and a unit.');
      return;
    }

    const agRes = createAgreement({
      tenantId: targetTenantId,
      unitId: agUnitId,
      rentCycle: agCycle,
      agreedRent: parseCurrencyValue(agRent),
      securityLevy: parseCurrencyValue(agLevy),
      startDate: agStart,
      endDate: agEnd,
      dueDate: agDue,
      rentalPeriodLabel: agLabel,
      exceptionNote: agException,
    });

    if (!agRes.ok) {
      setTenancyError(agRes.error || 'Could not create tenancy agreement.');
      return;
    }

    setTFirst('');
    setTLast('');
    setTPhone('');
    setTEmail('');
    setAgRent('');
    setAgException('');
    setShowAddTenancy(false);
  };

  const queriedTenants = filterTenantsByQuery(state.tenants, state.agreements, state.units, search);
  const filteredTenants = useMemo(() => {
    if (quickFilter === 'all') return queriedTenants;
    return queriedTenants.filter((t) => {
      const prof = arrearsMap[t.id];
      const hasDraftAg = state.agreements.some((a) => a.tenantId === t.id && a.status === 'Draft');
      if (quickFilter === 'multi-year') return Boolean(prof?.isMultiYear);
      if (quickFilter === 'all-arrears') return Boolean(prof && prof.totalOutstanding > 0);
      if (quickFilter === 'needs-review') return Boolean(prof?.hasUnderReview) || hasDraftAg;
      return true;
    });
  }, [queriedTenants, quickFilter, arrearsMap, state.agreements]);

  const filteredUnits = filterUnitsByQuery(state.units, state.agreements, state.tenants, search);
  const filteredAgreements = filterAgreementsByQuery(state.agreements, state.units, state.tenants, search)
    .slice()
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  const activeExportCount =
    subView === 'tenants'
      ? filteredTenants.length
      : subView === 'units'
      ? filteredUnits.length
      : filteredAgreements.length;

  const handleOpenTenantComposer = (tenantId: string) => {
    const t = state.tenants.find((x) => x.id === tenantId);
    const prof = arrearsMap[tenantId];
    const activeAg = state.agreements.find(
      (a) => a.tenantId === tenantId && (a.status === 'Active' || a.status === 'Draft')
    );
    const unit = activeAg ? state.units.find((u) => u.id === activeAg.unitId) : undefined;
    if (!t) return;

    const hasBal = Boolean(prof && prof.totalOutstanding > 0);
    openComposerFor({
      directoryRecipientIds: [`tenant:${t.id}`],
      linkedTenantId: t.id,
      channelMode: 'Both',
      intent: prof?.isMultiYear ? 'Multi-Year Arrears Notice' : 'Tenant Notice',
      subject: hasBal
        ? `${prof?.isMultiYear ? 'Multi-Year Arrears Notice' : 'Balance Reminder'}: ${unit?.code || 'Unit'} — ${t.firstName} ${t.lastName}`
        : `Tenancy Update: ${unit?.code || 'Unit'} — ${state.property.name}`,
      emailBody: hasBal && prof
        ? `Dear ${t.firstName} ${t.lastName},\n\nThis is a notice regarding your open balance at ${state.property.name} (${unit?.code || ''}) totaling ${formatNaira(prof.totalOutstanding)} (Rent: ${formatNaira(prof.unpaidRentAmount)}, Security Levy: ${formatNaira(prof.unpaidLevyAmount)}).\n\nKindly settle and confirm receipt with ${state.property.managerName}.\n\nRegards,\n${state.property.managerName}`
        : `Dear ${t.firstName} ${t.lastName},\n\nWriting from ${state.property.name} management regarding ${unit?.code || 'your tenancy'}.\n\nRegards,\n${state.property.managerName}`,
      smsBody: hasBal && prof
        ? `${state.property.name}: Dear ${t.firstName}, your ${unit?.code || ''} balance is ${formatNaira(prof.totalOutstanding)}. Kindly remit & notify ${state.property.managerName}.`
        : `${state.property.name}: Hello ${t.firstName}, please contact ${state.property.managerName} regarding ${unit?.code || 'your unit'}.`,
    });
  };

  const handleExportCsv = () => {
    if (subView === 'tenants') {
      exportFilteredCsv(
        `propledger-tenants-${state.referenceDate}.csv`,
        [
          'Tenant Name',
          'Phone',
          'Email',
          'Active Unit Code',
          'Active Unit Name',
          'Unit Type',
          'Arrears Tier',
          'Years Owed',
          'Behaviour Indicator',
          'Historical Late Cycles',
          'Reminders Paused',
          'Annual Rent (NGN)',
          'Rent Outstanding (NGN)',
          'Levy Outstanding (NGN)',
          'Total Outstanding (NGN)',
        ],
        filteredTenants.map((t) => {
          const activeAg = state.agreements.find(
            (a) => a.tenantId === t.id && (a.status === 'Active' || a.status === 'Draft')
          );
          const unit = activeAg ? state.units.find((u) => u.id === activeAg.unitId) : undefined;
          const prof = arrearsMap[t.id];
          return [
            `${t.firstName} ${t.lastName}`,
            t.phone,
            t.email,
            unit?.code || '',
            unit?.name || '',
            unit?.type || '',
            prof?.tier || 'Clear',
            prof?.unpaidYears.join(', ') || '',
            tenantBehaviours[t.id] || 'Current',
            t.historicalLateCycles,
            t.notificationsPaused ? 'Yes' : 'No',
            activeAg ? activeAg.agreedRent : 0,
            prof?.unpaidRentAmount || 0,
            prof?.unpaidLevyAmount || 0,
            prof?.totalOutstanding || 0,
          ];
        })
      );
      return;
    }

    if (subView === 'units') {
      exportFilteredCsv(
        `propledger-units-${state.referenceDate}.csv`,
        ['Unit Code', 'Unit Name', 'Unit Type', 'Floor / Wing', 'Current Tenant', 'Occupancy Status'],
        filteredUnits.map((u) => {
          const activeAg = state.agreements.find(
            (a) => a.unitId === u.id && (a.status === 'Active' || a.status === 'Draft')
          );
          const tenant = activeAg ? state.tenants.find((t) => t.id === activeAg.tenantId) : undefined;
          return [
            u.code,
            u.name,
            u.type,
            u.floorOrWing,
            tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Unoccupied',
            u.occupancyStatus,
          ];
        })
      );
      return;
    }

    exportFilteredCsv(
      `propledger-agreements-${state.referenceDate}.csv`,
      [
        'Unit Code',
        'Unit Name',
        'Tenant Name',
        'Start Date',
        'End Date',
        'Rent Cycle',
        'Status',
        'Agreed Rent (NGN)',
        'Security Levy (NGN)',
      ],
      filteredAgreements.map((ag) => {
        const unit = state.units.find((u) => u.id === ag.unitId);
        const tenant = state.tenants.find((t) => t.id === ag.tenantId);
        return [
          unit?.code || '',
          unit?.name || '',
          tenant ? `${tenant.firstName} ${tenant.lastName}` : '',
          ag.startDate,
          ag.endDate,
          ag.rentCycle,
          ag.status,
          ag.agreedRent,
          ag.securityLevy,
        ];
      })
    );
  };

  const multiYearCount = state.tenants.filter((t) => arrearsMap[t.id]?.isMultiYear).length;
  const anyArrearsCount = state.tenants.filter((t) => (arrearsMap[t.id]?.totalOutstanding ?? 0) > 0).length;
  const needsReviewCount = state.tenants.filter(
    (t) =>
      arrearsMap[t.id]?.hasUnderReview ||
      state.agreements.some((a) => a.tenantId === t.id && a.status === 'Draft')
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="hig-title-1">
            Units, Tenants &amp; Tenancy Agreements
          </h1>
          <p className="hig-subhead mt-1">
            {state.units.length} units across Bedroom, Room, Room &amp; Parlour, Shop, Kiosk &amp; Container Shop · Multi-year arrears tracked per cycle.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setUnitError('');
              setShowAddUnit(true);
            }}
            className="hig-btn-secondary whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Unit</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const firstVacant = state.units.find((u) => u.occupancyStatus === 'Vacant');
              setAgUnitId(firstVacant?.id || state.units[0]?.id || '');
              setExistingTenantId(state.tenants[0]?.id || '');
              setTenancyError('');
              setShowAddTenancy(true);
            }}
            className="hig-btn-primary whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New Tenancy</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="hig-segmented w-fit">
          {(
            [
              { id: 'tenants', label: `Tenants (${state.tenants.length})` },
              { id: 'units', label: `Units (${state.units.length})` },
              { id: 'agreements', label: `Agreements (${state.agreements.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              data-active={subView === t.id}
              onClick={() => setSubView(t.id)}
              className="hig-segmented-item whitespace-nowrap"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search unit number or tenant name..."
            ariaLabel="Search units and tenants by unit number or tenant name"
            className="w-full sm:w-80"
          />
          <ExportCsvButton
            onClick={handleExportCsv}
            disabled={activeExportCount === 0}
            count={activeExportCount}
          />
        </div>
      </div>

      {/* Quick Debtor Identification Filters on Tenants tab */}
      {subView === 'tenants' && (
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Quick debtor filters">
          {(
            [
              { id: 'all', label: `All Tenants (${queriedTenants.length})` },
              { id: 'multi-year', label: `Multi-Year Debtors (${multiYearCount})` },
              { id: 'all-arrears', label: `All Arrears & Dues (${anyArrearsCount})` },
              { id: 'needs-review', label: `Needs Cleanup / Review (${needsReviewCount})` },
            ] as const
          ).map((pill) => {
            const active = quickFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setQuickFilter(pill.id)}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-[0.8125rem] font-medium transition-colors ${
                  active
                    ? pill.id === 'multi-year'
                      ? 'bg-[#FF3B30] text-white font-semibold'
                      : 'bg-[var(--accent)] text-white font-semibold'
                    : 'bg-[var(--bg-surface-secondary)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Tenants View: Mobile Cards + Desktop Table */}
      {subView === 'tenants' && (
        <>
          <div className="md:hidden space-y-3">
            {filteredTenants.length === 0 ? (
              <div className="hig-card p-8 text-center hig-footnote">
                No tenants match the current filter.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setQuickFilter('all');
                  }}
                  className="text-[var(--accent-ink)] font-semibold underline ml-1"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              filteredTenants.map((t) => {
                const activeAg = state.agreements.find(
                  (a) => a.tenantId === t.id && (a.status === 'Active' || a.status === 'Draft')
                );
                const unit = activeAg
                  ? state.units.find((u) => u.id === activeAg.unitId)
                  : undefined;
                const prof = arrearsMap[t.id];
                const outstanding = prof?.totalOutstanding ?? 0;
                const behaviour = tenantBehaviours[t.id] || 'Current';

                return (
                  <div key={t.id} className="hig-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-semibold text-[1rem] text-[var(--ink-primary)] block truncate">
                          {t.firstName} {t.lastName}
                        </span>
                        <span className="hig-caption block truncate">
                          {unit ? `${unit.code} · ${unit.name} (${unit.type})` : 'No active lease'}
                        </span>
                        <span className="hig-caption font-mono-nums block truncate mt-0.5">
                          {t.phone}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className="font-mono-nums font-bold text-[1rem] block"
                          style={{
                            color: prof?.isMultiYear
                              ? 'var(--status-danger-ink)'
                              : outstanding > 0
                              ? 'var(--ink-primary)'
                              : 'var(--status-success-ink)',
                          }}
                        >
                          {formatNaira(outstanding)}
                        </span>
                        <span className="hig-caption font-mono-nums">
                          Rent {activeAg ? formatNaira(activeAg.agreedRent) : '—'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <StatusBadge label={behaviour} />
                      {prof?.isMultiYear && (
                        <StatusBadge label={`${prof.unpaidYears.length} Years Owed (${prof.unpaidYears.join(', ')})`} tone="danger" />
                      )}
                      {!prof?.isMultiYear && prof?.hasMultipleDues && (
                        <StatusBadge label="Multiple Dues (Rent + Levy)" />
                      )}
                      {prof?.hasUnderReview && <StatusBadge label="Under Review" />}
                      {activeAg?.status === 'Draft' && <StatusBadge label="Draft" />}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenTenantComposer(t.id)}
                        className="hig-btn-secondary w-full"
                        title={`Send SMS or Email to ${t.firstName} ${t.lastName}`}
                      >
                        <Send className="w-4 h-4" />
                        <span>Message</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTenantIdForDrawer(t.id)}
                        className="hig-btn-primary w-full"
                      >
                        Open Profile
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden md:block hig-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className="border-b hig-caption uppercase tracking-[0.03em]"
                    style={{ borderColor: 'var(--border-hairline)' }}
                  >
                    <th className="py-3 px-5">Tenant &amp; Arrears Flags</th>
                    <th className="py-3 px-4">Active Unit</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4 max-w-[140px] whitespace-normal leading-snug">Behaviour Indicator</th>
                    <th className="py-3 px-4 text-right">Annual Rent</th>
                    <th className="py-3 px-4 text-right">Outstanding</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody
                  className="divide-y text-[0.875rem]"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center hig-footnote">
                        No tenants match the current filter.{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setSearch('');
                            setQuickFilter('all');
                          }}
                          className="text-[var(--accent-ink)] font-semibold underline underline-offset-2 ml-1"
                        >
                          Reset filters
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map((t) => {
                      const activeAg = state.agreements.find(
                        (a) => a.tenantId === t.id && (a.status === 'Active' || a.status === 'Draft')
                      );
                      const unit = activeAg
                        ? state.units.find((u) => u.id === activeAg.unitId)
                        : undefined;
                      const prof = arrearsMap[t.id];
                      const outstanding = prof?.totalOutstanding ?? 0;
                      const behaviour = tenantBehaviours[t.id] || 'Current';

                      return (
                        <tr
                          key={t.id}
                          className="hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <td className="py-3.5 px-5">
                            <span className="font-medium text-[var(--ink-primary)] block">
                              {t.firstName} {t.lastName}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              {prof?.isMultiYear && (
                                <span
                                  className="px-2 py-0.5 rounded-lg text-[0.75rem] font-semibold"
                                  style={{
                                    backgroundColor: 'var(--status-danger-bg)',
                                    color: 'var(--status-danger-ink)',
                                  }}
                                >
                                  {prof.unpaidYears.length} Years Owed ({prof.unpaidYears.join(', ')})
                                </span>
                              )}
                              {!prof?.isMultiYear && prof?.hasMultipleDues && (
                                <StatusBadge label="Multiple Dues (Rent + Levy)" />
                              )}
                              {prof?.hasUnderReview && <StatusBadge label="Under Review" />}
                              {activeAg?.status === 'Draft' && <StatusBadge label="Draft" />}
                            </div>
                            <span className="hig-caption block mt-0.5">
                              Late cycles: {t.historicalLateCycles}
                              {t.notificationsPaused && ' · Reminders Paused'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {unit ? (
                              <div>
                                <span className="font-medium text-[var(--ink-primary)] block">
                                  {unit.code} · {unit.name}
                                </span>
                                <span className="hig-caption">{unit.type}</span>
                              </div>
                            ) : (
                              <span className="hig-caption">No active lease</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-[var(--ink-secondary)]">
                            <span className="block font-mono-nums text-[0.8125rem]">{t.phone}</span>
                            <span className="block hig-caption">{t.email}</span>
                          </td>
                          <td className="py-3.5 px-4 max-w-[140px] whitespace-normal">
                            <StatusBadge label={behaviour} wrap />
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono-nums text-[var(--ink-primary)]">
                            {activeAg ? formatNaira(activeAg.agreedRent) : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span
                              className="font-mono-nums font-semibold block"
                              style={{
                                color: prof?.isMultiYear
                                  ? 'var(--status-danger-ink)'
                                  : outstanding > 0
                                  ? 'var(--ink-primary)'
                                  : 'var(--status-success-ink)',
                              }}
                            >
                              {formatNaira(outstanding)}
                            </span>
                            {outstanding > 0 && prof && (
                              <span className="text-[0.75rem] text-[var(--ink-tertiary)] font-mono-nums block">
                                Rent {formatNaira(prof.unpaidRentAmount)}
                                {prof.unpaidLevyAmount > 0 ? ` + Levy ${formatNaira(prof.unpaidLevyAmount)}` : ''}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenTenantComposer(t.id)}
                                className="hig-btn-secondary !px-3"
                                title={`Send SMS or Email to ${t.firstName} ${t.lastName}`}
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>Message</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedTenantIdForDrawer(t.id)}
                                className="hig-btn-primary !px-3.5"
                              >
                                Open Profile
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Units View: Mobile Cards + Desktop Table */}
      {subView === 'units' && (
        <>
          <div className="md:hidden space-y-3">
            {filteredUnits.length === 0 ? (
              <div className="hig-card p-8 text-center hig-footnote">
                No units match "{search.trim()}".
              </div>
            ) : (
              filteredUnits.map((u) => {
                const activeAg = state.agreements.find(
                  (a) => a.unitId === u.id && a.status === 'Active'
                );
                const tenant = activeAg
                  ? state.tenants.find((t) => t.id === activeAg.tenantId)
                  : undefined;
                return (
                  <div key={u.id} className="hig-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono-nums font-semibold text-[1rem] text-[var(--ink-primary)] block">
                          {u.code} · {u.name}
                        </span>
                        <span className="hig-caption">
                          {u.type} · {u.floorOrWing}
                        </span>
                      </div>
                      <StatusBadge label={u.occupancyStatus} />
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-1">
                      {tenant ? (
                        <button
                          type="button"
                          onClick={() => setSelectedTenantIdForDrawer(tenant.id)}
                          className="text-[0.875rem] font-medium text-[var(--accent-ink)] hover:underline min-h-[44px]"
                        >
                          {tenant.firstName} {tenant.lastName}
                        </button>
                      ) : (
                        <span className="hig-caption">Unoccupied</span>
                      )}
                      <select
                        aria-label={`Change status for ${u.code}`}
                        value={u.occupancyStatus}
                        onChange={(e) =>
                          updateUnitStatus(u.id, e.target.value as UnitOccupancyStatus)
                        }
                        className="hig-input !py-1.5"
                      >
                        <option value="Occupied">Occupied</option>
                        <option value="Vacant">Vacant</option>
                        <option value="Under Maintenance">Under Maintenance</option>
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden md:block hig-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className="border-b hig-caption uppercase tracking-[0.03em]"
                    style={{ borderColor: 'var(--border-hairline)' }}
                  >
                    <th className="py-3 px-5">Code &amp; Name</th>
                    <th className="py-3 px-4">Unit Type</th>
                    <th className="py-3 px-4">Location / Wing</th>
                    <th className="py-3 px-4">Current Tenant</th>
                    <th className="py-3 px-4">Occupancy Status</th>
                    <th className="py-3 px-5 text-right">Change Status</th>
                  </tr>
                </thead>
                <tbody
                  className="divide-y text-[0.875rem]"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {filteredUnits.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center hig-footnote">
                        No units match "{search.trim()}".{' '}
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          className="text-[var(--accent-ink)] font-semibold underline underline-offset-2 ml-1"
                        >
                          Clear search
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredUnits.map((u) => {
                      const activeAg = state.agreements.find(
                        (a) => a.unitId === u.id && a.status === 'Active'
                      );
                      const tenant = activeAg
                        ? state.tenants.find((t) => t.id === activeAg.tenantId)
                        : undefined;
                      return (
                        <tr key={u.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                          <td className="py-3.5 px-5">
                            <span className="font-mono-nums font-semibold text-[var(--ink-primary)] mr-2">
                              {u.code}
                            </span>
                            <span className="font-medium text-[var(--ink-primary)]">{u.name}</span>
                          </td>
                          <td className="py-3.5 px-4 text-[var(--ink-secondary)]">{u.type}</td>
                          <td className="py-3.5 px-4 text-[var(--ink-tertiary)]">{u.floorOrWing}</td>
                          <td className="py-3.5 px-4">
                            {tenant ? (
                              <button
                                type="button"
                                onClick={() => setSelectedTenantIdForDrawer(tenant.id)}
                                className="font-medium text-[var(--ink-primary)] hover:underline min-h-[44px]"
                              >
                                {tenant.firstName} {tenant.lastName}
                              </button>
                            ) : (
                              <span className="hig-caption">Unoccupied</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusBadge label={u.occupancyStatus} />
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <select
                              aria-label={`Change status for ${u.code}`}
                              value={u.occupancyStatus}
                              onChange={(e) =>
                                updateUnitStatus(u.id, e.target.value as UnitOccupancyStatus)
                              }
                              className="hig-input !py-1.5"
                            >
                              <option value="Occupied">Occupied</option>
                              <option value="Vacant">Vacant</option>
                              <option value="Under Maintenance">Under Maintenance</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Agreements View: Mobile Cards + Desktop Table */}
      {subView === 'agreements' && (
        <>
          <div className="md:hidden space-y-3">
            {filteredAgreements.length === 0 ? (
              <div className="hig-card p-8 text-center hig-footnote">
                No tenancy agreements match "{search.trim()}".
              </div>
            ) : (
              filteredAgreements.map((ag) => {
                const unit = state.units.find((u) => u.id === ag.unitId);
                const tenant = state.tenants.find((t) => t.id === ag.tenantId);
                return (
                  <div key={ag.id} className="hig-card p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-semibold text-[1rem] text-[var(--ink-primary)] block">
                          {unit?.code} · {unit?.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                          className="hig-footnote text-[var(--accent-ink)] hover:underline min-h-[36px]"
                        >
                          {tenant?.firstName} {tenant?.lastName}
                        </button>
                      </div>
                      <StatusBadge label={ag.status} />
                    </div>
                    <p className="hig-caption tabular-nums">
                      {formatDateShort(ag.startDate)} – {formatDateShort(ag.endDate)} · {ag.rentCycle}
                    </p>
                    <div className="flex items-center justify-between text-[0.875rem] font-mono-nums pt-1">
                      <span className="font-semibold text-[var(--ink-primary)]">
                        Rent: {formatNaira(ag.agreedRent)}
                      </span>
                      <span className="text-[var(--ink-secondary)]">
                        Levy: {formatNaira(ag.securityLevy)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden md:block hig-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className="border-b hig-caption uppercase tracking-[0.03em]"
                    style={{ borderColor: 'var(--border-hairline)' }}
                  >
                    <th className="py-3 px-5">Unit</th>
                    <th className="py-3 px-4">Tenant</th>
                    <th className="py-3 px-4">Term &amp; Cycle</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Agreed Rent</th>
                    <th className="py-3 px-5 text-right">Security Levy</th>
                  </tr>
                </thead>
                <tbody
                  className="divide-y text-[0.875rem]"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {filteredAgreements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center hig-footnote">
                        No tenancy agreements match "{search.trim()}".{' '}
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          className="text-[var(--accent-ink)] font-semibold underline underline-offset-2 ml-1"
                        >
                          Clear search
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredAgreements.map((ag) => {
                      const unit = state.units.find((u) => u.id === ag.unitId);
                      const tenant = state.tenants.find((t) => t.id === ag.tenantId);
                      return (
                        <tr key={ag.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                          <td className="py-3.5 px-5 font-medium text-[var(--ink-primary)]">
                            {unit?.code} · {unit?.name}
                          </td>
                          <td className="py-3.5 px-4">
                            <button
                              type="button"
                              onClick={() => tenant && setSelectedTenantIdForDrawer(tenant.id)}
                              className="text-[var(--ink-primary)] hover:underline font-medium min-h-[44px]"
                            >
                              {tenant?.firstName} {tenant?.lastName}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-[var(--ink-secondary)] tabular-nums">
                            {formatDateShort(ag.startDate)} – {formatDateShort(ag.endDate)} · {ag.rentCycle}
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusBadge label={ag.status} />
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono-nums font-semibold text-[var(--ink-primary)]">
                            {formatNaira(ag.agreedRent)}
                          </td>
                          <td className="py-3.5 px-5 text-right font-mono-nums text-[var(--ink-secondary)]">
                            {formatNaira(ag.securityLevy)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add Unit Modal */}
      {showAddUnit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[6px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-unit-title"
        >
          <div
            className="w-full max-w-md hig-card overflow-hidden"
            style={{ boxShadow: 'var(--shadow-sheet)' }}
          >
            <div
              className="px-6 py-4 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <h3 id="add-unit-title" className="hig-headline">
                Add Property Unit
              </h3>
              <button
                type="button"
                onClick={() => setShowAddUnit(false)}
                className="hig-touch-icon"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateUnit} className="p-6 space-y-4">
              {unitError && (
                <p className="hig-footnote" style={{ color: 'var(--status-danger-ink)' }}>
                  {unitError}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block hig-caption mb-1.5">Unit Code</label>
                  <input
                    type="text"
                    value={unitCode}
                    onChange={(e) => setUnitCode(e.target.value)}
                    placeholder="e.g. C-301"
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block hig-caption mb-1.5">Unit Type</label>
                  <select
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value as UnitType)}
                    className="hig-input w-full"
                  >
                    {UNIT_TYPES.map((ut) => (
                      <option key={ut} value={ut}>
                        {ut}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block hig-caption mb-1.5">Unit Name</label>
                <input
                  type="text"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="e.g. Flat C1 (2-Bed)"
                  className="hig-input w-full"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block hig-caption mb-1.5">Floor / Wing</label>
                  <input
                    type="text"
                    value={unitWing}
                    onChange={(e) => setUnitWing(e.target.value)}
                    className="hig-input w-full"
                  />
                </div>
                <div>
                  <label className="block hig-caption mb-1.5">Occupancy</label>
                  <select
                    value={unitStatus}
                    onChange={(e) => setUnitStatus(e.target.value as UnitOccupancyStatus)}
                    className="hig-input w-full"
                  >
                    <option value="Vacant">Vacant</option>
                    <option value="Occupied">Occupied</option>
                    <option value="Under Maintenance">Under Maintenance</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUnit(false)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="hig-btn-primary">
                  Save Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Tenancy Modal */}
      {showAddTenancy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[6px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-tenancy-title"
        >
          <div
            className="w-full max-w-xl hig-card max-h-[92vh] flex flex-col overflow-hidden"
            style={{ boxShadow: 'var(--shadow-sheet)' }}
          >
            <div
              className="px-6 py-4 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              <h3 id="new-tenancy-title" className="hig-headline">
                Create Tenancy Agreement &amp; Obligation
              </h3>
              <button
                type="button"
                onClick={() => setShowAddTenancy(false)}
                className="hig-touch-icon"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTenancy} className="p-6 overflow-y-auto space-y-4">
              {tenancyError && (
                <p
                  className="p-3 rounded-xl hig-footnote"
                  style={{
                    backgroundColor: 'var(--status-danger-bg)',
                    color: 'var(--status-danger-ink)',
                  }}
                >
                  {tenancyError}
                </p>
              )}

              <div className="hig-segmented w-fit">
                <button
                  type="button"
                  data-active={tenancyMode === 'new-tenant'}
                  onClick={() => setTenancyMode('new-tenant')}
                  className="hig-segmented-item"
                >
                  New Tenant
                </button>
                <button
                  type="button"
                  data-active={tenancyMode === 'existing-tenant'}
                  onClick={() => setTenancyMode('existing-tenant')}
                  className="hig-segmented-item"
                >
                  Existing Tenant
                </button>
              </div>

              {tenancyMode === 'new-tenant' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block hig-caption mb-1.5">First Name</label>
                    <input
                      type="text"
                      value={tFirst}
                      onChange={(e) => setTFirst(e.target.value)}
                      className="hig-input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block hig-caption mb-1.5">Last Name</label>
                    <input
                      type="text"
                      value={tLast}
                      onChange={(e) => setTLast(e.target.value)}
                      className="hig-input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block hig-caption mb-1.5">Phone</label>
                    <input
                      type="text"
                      value={tPhone}
                      onChange={(e) => setTPhone(e.target.value)}
                      placeholder="+234 80..."
                      className="hig-input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block hig-caption mb-1.5">Email</label>
                    <input
                      type="email"
                      value={tEmail}
                      onChange={(e) => setTEmail(e.target.value)}
                      className="hig-input w-full"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block hig-caption mb-1.5">Select Tenant</label>
                  <select
                    value={existingTenantId}
                    onChange={(e) => setExistingTenantId(e.target.value)}
                    className="hig-input w-full"
                  >
                    {state.tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName} ({t.phone})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block hig-caption mb-1.5">Unit</label>
                  <select
                    value={agUnitId}
                    onChange={(e) => setAgUnitId(e.target.value)}
                    className="hig-input w-full"
                  >
                    {state.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} · {u.name} ({u.occupancyStatus})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block hig-caption mb-1.5">Rent Cycle</label>
                  <select
                    value={agCycle}
                    onChange={(e) => setAgCycle(e.target.value as RentCycle)}
                    className="hig-input w-full"
                  >
                    <option value="Yearly">Yearly</option>
                    <option value="Bi-Annual">Bi-Annual</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block hig-caption mb-1.5">Agreed Rent (₦)</label>
                  <CurrencyInput
                    min={1}
                    value={agRent}
                    onValueChange={(raw) => setAgRent(raw)}
                    placeholder="e.g. 4,000,000"
                    required
                  />
                </div>
                <div>
                  <label className="block hig-caption mb-1.5">Security Levy (₦)</label>
                  <CurrencyInput
                    min={0}
                    value={agLevy}
                    onValueChange={(raw) => setAgLevy(raw)}
                    placeholder="e.g. 4,000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block hig-caption mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={agStart}
                    onChange={(e) => setAgStart(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block hig-caption mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={agEnd}
                    onChange={(e) => setAgEnd(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block hig-caption mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={agDue}
                    onChange={(e) => setAgDue(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block hig-caption mb-1.5">Period Label</label>
                  <input
                    type="text"
                    value={agLabel}
                    onChange={(e) => setAgLabel(e.target.value)}
                    className="hig-input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block hig-caption mb-1.5">
                    Overlap Exception Note (if occupied)
                  </label>
                  <input
                    type="text"
                    value={agException}
                    onChange={(e) => setAgException(e.target.value)}
                    placeholder="Optional unless unit already active"
                    className="hig-input w-full"
                  />
                </div>
              </div>

              <div
                className="flex justify-end gap-2 pt-3 border-t"
                style={{ borderColor: 'var(--border-hairline)' }}
              >
                <button
                  type="button"
                  onClick={() => setShowAddTenancy(false)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="hig-btn-primary">
                  Create Tenancy &amp; Obligations
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
