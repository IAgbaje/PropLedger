import React, { useMemo, useState } from 'react';
import { CheckCircle2, Link2, Pencil, Plus, X } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import type { MaintenanceRecord, PaymentMethod, PropertyExpense } from '../types/rental';
import { exportFilteredCsv } from '../utils/csvExport';
import {
  MAINTENANCE_SCOPE_PRESETS,
  OTHER_SCOPE_KEY,
  SHARED_SCOPE_PRESETS,
  computeExpenseBreakdown,
  getScopeSelectorState,
  resolveExpenseCategoryLabel,
  resolveExpenseDisplayScope,
  resolveMaintenanceDisplayScope,
} from '../utils/expensesMaintenance';
import { formatDateShort, formatNaira, parseCurrencyValue } from '../utils/format';
import { CurrencyInput } from './CurrencyInput';
import { StatusBadge } from './StatusBadge';
import { ExportCsvButton, FilterMenuButton, SearchInput } from './TableToolbarControls';

type AccountingFilter = 'All' | 'Operating' | 'NonProperty';
type ScopeFilter = 'All' | 'Common Area' | 'Unit' | 'Other';
type MaintenanceStatusFilter = 'All' | MaintenanceRecord['status'];

export function ExpensesMaintenanceView() {
  const {
    state,
    recordExpense,
    editExpense,
    recordMaintenance,
    editMaintenance,
    updateMaintenanceStatus,
  } = useRentalStore();

  const [subTab, setSubTab] = useState<'expenses' | 'maintenance'>('expenses');

  // Expenses Filters
  const [accountingFilter, setAccountingFilter] = useState<AccountingFilter>('All');
  const [catFilter, setCatFilter] = useState<string>('All');
  const [expScopeFilter, setExpScopeFilter] = useState<ScopeFilter>('All');

  // Maintenance Filters
  const [mntStatusFilter, setMntStatusFilter] = useState<MaintenanceStatusFilter>('All');
  const [mntScopeFilter, setMntScopeFilter] = useState<ScopeFilter>('All');

  const [search, setSearch] = useState('');

  // Add / Edit Expense Modal State
  const [showExpModal, setShowExpModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expError, setExpError] = useState<string | null>(null);
  const [eDate, setEDate] = useState(state.referenceDate);
  const [eAmount, setEAmount] = useState('');
  const [eCategory, setECategory] = useState<PropertyExpense['category']>('Repairs');
  const [eCustomCategoryLabel, setECustomCategoryLabel] = useState('');
  const [eIsNonProperty, setEIsNonProperty] = useState(false);
  const [eScopeKey, setEScopeKey] = useState<string>('Compound Area / Exterior');
  const [eCustomScope, setECustomScope] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eVendor, setEVendor] = useState('');
  const [eMethod, setEMethod] = useState<PaymentMethod>('Bank Transfer');
  const [eRef, setERef] = useState('');

  // Add / Edit Maintenance Modal State
  const [showMntModal, setShowMntModal] = useState(false);
  const [editingMaintenanceId, setEditingMaintenanceId] = useState<string | null>(null);
  const [mntError, setMntError] = useState<string | null>(null);
  const [mScopeKey, setMScopeKey] = useState<string>('Compound Area / Exterior');
  const [mCustomScope, setMCustomScope] = useState('');
  const [mDateReported, setMDateReported] = useState(state.referenceDate);
  const [mStatus, setMStatus] = useState<MaintenanceRecord['status']>('Open');
  const [mIssue, setMIssue] = useState('');
  const [mVendor, setMVendor] = useState('');
  const [mCost, setMCost] = useState('');
  const [mResolutionDetails, setMResolutionDetails] = useState('');
  const [mResolvedDate, setMResolvedDate] = useState('');
  const [mAlreadyLinkedExpenseId, setMAlreadyLinkedExpenseId] = useState<string | undefined>(
    undefined
  );
  const [mAlsoPostExpense, setMAlsoPostExpense] = useState(false);
  const [mExpenseMethod, setMExpenseMethod] = useState<PaymentMethod>('Cash');
  const [mExpenseRef, setMExpenseRef] = useState('');

  const q = search.trim().toLowerCase();

  const expenseBreakdown = useMemo(
    () => computeExpenseBreakdown(state.expenses),
    [state.expenses]
  );

  const filteredExpenses = useMemo(() => {
    return state.expenses.filter((e) => {
      if (accountingFilter === 'Operating' && e.isNonPropertyOutgoing) return false;
      if (accountingFilter === 'NonProperty' && !e.isNonPropertyOutgoing) return false;
      if (catFilter !== 'All' && e.category !== catFilter) return false;
      const scopeCat = e.scopeCategory || (e.unitId ? 'Unit' : 'Common Area');
      if (expScopeFilter !== 'All' && scopeCat !== expScopeFilter) return false;

      if (q) {
        const displayScope = resolveExpenseDisplayScope(e, state.units);
        const catLabel = resolveExpenseCategoryLabel(e);
        const searchable =
          `${e.vendor} ${e.description} ${e.category} ${catLabel} ${displayScope} ${e.paymentMethod || ''} ${e.reference || ''} ${e.isNonPropertyOutgoing ? 'non-property purse outgoing' : ''}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [state.expenses, state.units, accountingFilter, catFilter, expScopeFilter, q]);

  const filteredMaintenance = useMemo(() => {
    return state.maintenance.filter((m) => {
      if (mntStatusFilter !== 'All' && m.status !== mntStatusFilter) return false;
      const scopeInfo = resolveMaintenanceDisplayScope(
        m,
        state.units,
        state.agreements,
        state.tenants
      );
      if (mntScopeFilter !== 'All' && scopeInfo.scopeCategory !== mntScopeFilter) return false;

      if (q) {
        const searchable =
          `${scopeInfo.primaryScope} ${scopeInfo.unitCode} ${scopeInfo.tenantName || ''} ${m.issue} ${m.assignedTo} ${m.resolutionDetails || ''} ${m.status}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [
    state.maintenance,
    state.units,
    state.agreements,
    state.tenants,
    mntStatusFilter,
    mntScopeFilter,
    q,
  ]);

  const filteredExpenseTotal = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const filteredMaintenanceCost = filteredMaintenance.reduce(
    (s, m) => s + (m.estimatedOrActualCost || 0),
    0
  );

  const openCreateExpense = () => {
    setEditingExpenseId(null);
    setExpError(null);
    setEDate(state.referenceDate);
    setEAmount('');
    setECategory('Repairs');
    setECustomCategoryLabel('');
    setEIsNonProperty(false);
    setEScopeKey('Compound Area / Exterior');
    setECustomScope('');
    setEDesc('');
    setEVendor('');
    setEMethod('Bank Transfer');
    setERef('');
    setShowExpModal(true);
  };

  const openEditExpense = (exp: PropertyExpense) => {
    const scopeSel = getScopeSelectorState(exp, state.units, 'Compound Area / Exterior');
    setEditingExpenseId(exp.id);
    setExpError(null);
    setEDate(exp.date);
    setEAmount(String(exp.amount));
    setECategory(exp.category);
    setECustomCategoryLabel(exp.customCategoryLabel || '');
    setEIsNonProperty(Boolean(exp.isNonPropertyOutgoing));
    setEScopeKey(scopeSel.selectionKey);
    setECustomScope(scopeSel.customScope);
    setEDesc(exp.description);
    setEVendor(exp.vendor);
    setEMethod(exp.paymentMethod || 'Bank Transfer');
    setERef(exp.reference || '');
    setShowExpModal(true);
  };

  const openCreateMaintenance = () => {
    setEditingMaintenanceId(null);
    setMntError(null);
    setMScopeKey('Compound Area / Exterior');
    setMCustomScope('');
    setMDateReported(state.referenceDate);
    setMStatus('Open');
    setMIssue('');
    setMVendor('');
    setMCost('');
    setMResolutionDetails('');
    setMResolvedDate('');
    setMAlreadyLinkedExpenseId(undefined);
    setMAlsoPostExpense(false);
    setMExpenseMethod('Cash');
    setMExpenseRef('');
    setShowMntModal(true);
  };

  const openEditMaintenance = (mnt: MaintenanceRecord) => {
    const scopeSel = getScopeSelectorState(mnt, state.units, 'Compound Area / Exterior');
    setEditingMaintenanceId(mnt.id);
    setMntError(null);
    setMScopeKey(scopeSel.selectionKey);
    setMCustomScope(scopeSel.customScope);
    setMDateReported(mnt.dateReported);
    setMStatus(mnt.status);
    setMIssue(mnt.issue);
    setMVendor(mnt.assignedTo === 'Pending Assignment' ? '' : mnt.assignedTo);
    setMCost(mnt.estimatedOrActualCost > 0 ? String(mnt.estimatedOrActualCost) : '');
    setMResolutionDetails(mnt.resolutionDetails || '');
    setMResolvedDate(mnt.resolvedDate || state.referenceDate);
    setMAlreadyLinkedExpenseId(mnt.linkedExpenseId);
    setMAlsoPostExpense(false);
    setMExpenseMethod('Cash');
    setMExpenseRef('');
    setShowMntModal(true);
  };

  const handleExportExpensesCsv = () => {
    exportFilteredCsv(
      `propledger-expenses-${state.referenceDate}.csv`,
      [
        'Date',
        'Accounting Type',
        'Category',
        'Purpose / Detail',
        'Scope',
        'Description',
        'Vendor / Paid To',
        'Payment Method',
        'Reference',
        'Amount (NGN)',
      ],
      filteredExpenses.map((exp) => [
        exp.date,
        exp.isNonPropertyOutgoing ? 'Non-Property Purse' : 'Property Operating',
        exp.category,
        exp.category === 'Other' ? exp.customCategoryLabel || '' : '',
        resolveExpenseDisplayScope(exp, state.units),
        exp.description,
        exp.vendor,
        exp.paymentMethod || '',
        exp.reference || '',
        exp.amount,
      ])
    );
  };

  const handleExportMaintenanceCsv = () => {
    exportFilteredCsv(
      `propledger-maintenance-${state.referenceDate}.csv`,
      [
        'Date Reported',
        'Scope Category',
        'Scope / Unit',
        'Occupant Tenant',
        'Issue',
        'Resolution Details',
        'Assigned To',
        'Status',
        'Resolved Date',
        'Est / Actual Cost (NGN)',
        'Linked Expense ID',
      ],
      filteredMaintenance.map((m) => {
        const scopeInfo = resolveMaintenanceDisplayScope(
          m,
          state.units,
          state.agreements,
          state.tenants
        );
        return [
          m.dateReported,
          scopeInfo.scopeCategory,
          scopeInfo.primaryScope,
          scopeInfo.tenantName || '',
          m.issue,
          m.resolutionDetails || '',
          m.assignedTo,
          m.status,
          m.resolvedDate || '',
          m.estimatedOrActualCost,
          m.linkedExpenseId || '',
        ];
      })
    );
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    setExpError(null);

    const payload = {
      date: eDate,
      amount: parseCurrencyValue(eAmount),
      category: eCategory,
      customCategoryLabel: eCategory === 'Other' ? eCustomCategoryLabel : undefined,
      isNonPropertyOutgoing: eIsNonProperty,
      scopeSelectionKey: eScopeKey,
      customScope: eScopeKey === OTHER_SCOPE_KEY ? eCustomScope : undefined,
      description: eDesc,
      vendor: eVendor,
      paymentMethod: eMethod,
      reference: eRef || undefined,
    };

    const res = editingExpenseId
      ? editExpense(editingExpenseId, payload)
      : recordExpense(payload);

    if (!res.ok) {
      setExpError(res.error || 'Could not save expense record.');
      return;
    }

    setShowExpModal(false);
    setEditingExpenseId(null);
  };

  const handleSaveMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    setMntError(null);

    const costNum = parseCurrencyValue(mCost);
    const payload = {
      scopeSelectionKey: mScopeKey,
      customScope: mScopeKey === OTHER_SCOPE_KEY ? mCustomScope : undefined,
      issue: mIssue,
      dateReported: mDateReported || state.referenceDate,
      status: mStatus,
      assignedTo: mVendor || 'Pending Assignment',
      estimatedOrActualCost: costNum,
      resolutionDetails: mResolutionDetails || undefined,
      resolvedDate: mStatus === 'Resolved' ? mResolvedDate || state.referenceDate : undefined,
      alsoRecordExpense: !mAlreadyLinkedExpenseId && costNum > 0 && mAlsoPostExpense,
      expensePaymentMethod: mExpenseMethod,
      expenseReference: mExpenseRef || undefined,
    };

    const res = editingMaintenanceId
      ? editMaintenance(editingMaintenanceId, payload)
      : recordMaintenance(payload);

    if (!res.ok) {
      setMntError(res.error || 'Could not save maintenance ticket.');
      return;
    }

    setShowMntModal(false);
    setEditingMaintenanceId(null);
  };

  const parsedMntCost = parseCurrencyValue(mCost);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="hig-title-1">Expenses &amp; Maintenance Log</h1>
          <p className="hig-callout mt-1">
            Compound upkeep, unit repairs, and non-property purse outgoings tracked clearly and separately from tenant rent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={openCreateMaintenance}
            className="hig-btn-secondary whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Log Maintenance</span>
          </button>
          <button
            type="button"
            onClick={openCreateExpense}
            className="hig-btn-primary whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs + Search + Export */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="hig-segmented w-full sm:w-fit" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'expenses'}
            data-active={subTab === 'expenses'}
            onClick={() => setSubTab('expenses')}
            className="hig-segmented-item flex-1 sm:flex-initial"
          >
            Expenses ({state.expenses.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'maintenance'}
            data-active={subTab === 'maintenance'}
            onClick={() => setSubTab('maintenance')}
            className="hig-segmented-item flex-1 sm:flex-initial"
          >
            Maintenance ({state.maintenance.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={
              subTab === 'expenses'
                ? 'Search purpose, scope, vendor, description...'
                : 'Search scope, unit, tenant, or issue...'
            }
            ariaLabel="Search expenses and maintenance records"
            className="w-full sm:w-72"
          />
          <ExportCsvButton
            onClick={subTab === 'expenses' ? handleExportExpensesCsv : handleExportMaintenanceCsv}
            disabled={
              subTab === 'expenses'
                ? filteredExpenses.length === 0
                : filteredMaintenance.length === 0
            }
            count={
              subTab === 'expenses' ? filteredExpenses.length : filteredMaintenance.length
            }
          />
        </div>
      </div>

      {/* Sub-Tab Filter Controls */}
      {subTab === 'expenses' ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <FilterMenuButton
            label="Type"
            value={accountingFilter}
            defaultValue="All"
            onChange={(val) => setAccountingFilter(val as AccountingFilter)}
            ariaLabel="Filter expenses by accounting type"
            align="left"
            options={[
              { value: 'All', label: 'All Outgoings', count: state.expenses.length },
              {
                value: 'Operating',
                label: 'Property Operating',
                count: expenseBreakdown.propertyOperatingCount,
              },
              {
                value: 'NonProperty',
                label: 'Non-Property Purse',
                count: expenseBreakdown.nonPropertyOutgoingCount,
              },
            ]}
          />
          <FilterMenuButton
            label="Category"
            value={catFilter}
            defaultValue="All"
            onChange={setCatFilter}
            ariaLabel="Filter expenses by category"
            align="left"
            options={[
              { value: 'All', label: 'All Categories' },
              { value: 'Repairs', label: 'Repairs' },
              { value: 'Security', label: 'Security' },
              { value: 'Utilities', label: 'Utilities' },
              { value: 'Cleaning', label: 'Cleaning' },
              { value: 'Legal & Admin', label: 'Legal & Admin' },
              { value: 'Other', label: 'Other' },
            ]}
          />
          <FilterMenuButton
            label="Scope"
            value={expScopeFilter}
            defaultValue="All"
            onChange={(val) => setExpScopeFilter(val as ScopeFilter)}
            ariaLabel="Filter expenses by scope"
            align="left"
            options={[
              { value: 'All', label: 'All Scopes' },
              { value: 'Common Area', label: 'Compound / Shared Areas' },
              { value: 'Unit', label: 'Unit-Specific' },
              { value: 'Other', label: 'Other / Purse' },
            ]}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <FilterMenuButton
            label="Status"
            value={mntStatusFilter}
            defaultValue="All"
            onChange={(val) => setMntStatusFilter(val as MaintenanceStatusFilter)}
            ariaLabel="Filter maintenance by status"
            align="left"
            options={[
              { value: 'All', label: 'All Statuses', count: state.maintenance.length },
              {
                value: 'Open',
                label: 'Open',
                count: state.maintenance.filter((m) => m.status === 'Open').length,
              },
              {
                value: 'In Progress',
                label: 'In Progress',
                count: state.maintenance.filter((m) => m.status === 'In Progress').length,
              },
              {
                value: 'Resolved',
                label: 'Resolved',
                count: state.maintenance.filter((m) => m.status === 'Resolved').length,
              },
            ]}
          />
          <FilterMenuButton
            label="Scope"
            value={mntScopeFilter}
            defaultValue="All"
            onChange={(val) => setMntScopeFilter(val as ScopeFilter)}
            ariaLabel="Filter maintenance by scope"
            align="left"
            options={[
              { value: 'All', label: 'All Scopes' },
              { value: 'Common Area', label: 'Compound / Shared Areas' },
              { value: 'Unit', label: 'Unit-Specific' },
              { value: 'Other', label: 'Other Custom Scope' },
            ]}
          />
        </div>
      )}

      {subTab === 'expenses' ? (
        <div className="hig-card overflow-hidden">
          {/* Separated Operating vs Non-Property Purse Breakdown Header */}
          <div
            className="px-4 sm:px-6 py-4 border-b grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6"
            style={{
              backgroundColor: 'var(--bg-surface-secondary)',
              borderColor: 'var(--border-hairline)',
            }}
          >
            <div>
              <span className="hig-caption block">
                Property Operating ({expenseBreakdown.propertyOperatingCount})
              </span>
              <span className="hig-headline font-mono-nums block mt-0.5">
                {formatNaira(expenseBreakdown.propertyOperatingTotal)}
              </span>
            </div>
            <div>
              <span className="hig-caption block">
                Non-Property Purse ({expenseBreakdown.nonPropertyOutgoingCount})
              </span>
              <span
                className="hig-headline font-mono-nums block mt-0.5"
                style={{
                  color:
                    expenseBreakdown.nonPropertyOutgoingCount > 0
                      ? 'var(--status-warning-ink)'
                      : 'var(--ink-primary)',
                }}
              >
                {formatNaira(expenseBreakdown.nonPropertyOutgoingTotal)}
              </span>
            </div>
            <div className="sm:text-right">
              <span className="hig-caption block">
                Combined Outflow
                {filteredExpenses.length !== state.expenses.length
                  ? ` · Filtered (${filteredExpenses.length}): ${formatNaira(filteredExpenseTotal)}`
                  : ''}
              </span>
              <span className="hig-headline font-mono-nums block mt-0.5">
                {formatNaira(expenseBreakdown.combinedTotal)}
              </span>
            </div>
          </div>

          {/* Mobile Stacked Cards */}
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {filteredExpenses.length === 0 ? (
              <p className="py-10 px-4 text-center hig-subhead">
                No expense records match your filter.
              </p>
            ) : (
              filteredExpenses.map((exp) => {
                const scopeText = resolveExpenseDisplayScope(exp, state.units);
                const customPurpose =
                  exp.category === 'Other' ? exp.customCategoryLabel?.trim() : undefined;
                return (
                  <div key={exp.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="hig-headline block">{exp.description}</span>
                        <span className="hig-footnote font-mono-nums block mt-0.5">
                          {formatDateShort(exp.date)} · {exp.vendor}
                        </span>
                      </div>
                      <span className="hig-headline font-mono-nums shrink-0">
                        {formatNaira(exp.amount)}
                      </span>
                    </div>

                    <div className="text-[0.8125rem] text-[var(--ink-secondary)]">
                      <span>{scopeText}</span>
                      {customPurpose && (
                        <span>
                          {' '}
                          · <strong className="font-semibold text-[var(--ink-primary)]">{customPurpose}</strong>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge label={exp.category} tone="neutral" />
                        {exp.isNonPropertyOutgoing && (
                          <span
                            className="text-[0.75rem] font-semibold"
                            style={{ color: 'var(--status-warning-ink)' }}
                          >
                            Non-Property Purse
                          </span>
                        )}
                        {exp.linkedMaintenanceId && (
                          <span className="text-[0.75rem] font-medium text-[var(--accent-ink)]">
                            From Maintenance
                          </span>
                        )}
                      </div>
                      <span className="hig-caption font-mono-nums">
                        {exp.paymentMethod || '—'} {exp.reference ? `· ${exp.reference}` : ''}
                      </span>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => openEditExpense(exp)}
                        className="hig-btn-secondary w-full"
                      >
                        <Pencil className="w-4 h-4" />
                        <span>Edit Expense</span>
                      </button>
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
                  <th className="py-3 px-5">Date</th>
                  <th className="py-3 px-4">Category &amp; Purpose</th>
                  <th className="py-3 px-4">Scope / Area</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Vendor / Paid To</th>
                  <th className="py-3 px-4">Method &amp; Ref</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center hig-subhead">
                      No expense records match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => {
                    const scopeText = resolveExpenseDisplayScope(exp, state.units);
                    const customPurpose =
                      exp.category === 'Other' ? exp.customCategoryLabel?.trim() : undefined;
                    return (
                      <tr key={exp.id} className="hover:bg-[var(--bg-hover)]">
                        <td className="py-3.5 px-5 font-mono-nums text-[var(--ink-primary)] whitespace-nowrap">
                          {formatDateShort(exp.date)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <StatusBadge label={exp.category} tone="neutral" />
                            {customPurpose && (
                              <span className="block text-[0.8125rem] font-medium text-[var(--ink-primary)]">
                                {customPurpose}
                              </span>
                            )}
                            {exp.isNonPropertyOutgoing && (
                              <span
                                className="block text-[0.75rem] font-semibold"
                                style={{ color: 'var(--status-warning-ink)' }}
                              >
                                Non-Property Purse
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-[var(--ink-secondary)]">
                          <span className="block text-[var(--ink-primary)] font-medium">
                            {scopeText}
                          </span>
                          <span className="hig-caption">
                            {exp.scopeCategory || (exp.unitId ? 'Unit' : 'Common Area')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-[var(--ink-primary)]">
                          <span className="block">{exp.description}</span>
                          {exp.linkedMaintenanceId && (
                            <span className="hig-caption inline-flex items-center gap-1 text-[var(--accent-ink)] mt-0.5">
                              <Link2 className="w-3 h-3" />
                              From Maintenance Ticket
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--ink-secondary)]">{exp.vendor}</td>
                        <td className="py-3.5 px-4 hig-footnote">
                          {exp.paymentMethod || '—'} {exp.reference ? `· ${exp.reference}` : ''}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-nums font-semibold text-[var(--ink-primary)] whitespace-nowrap">
                          {formatNaira(exp.amount)}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditExpense(exp)}
                            aria-label={`Edit expense ${exp.description}`}
                            className="hig-btn-secondary !min-h-[38px] !px-3 !text-[0.8125rem]"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="hig-card overflow-hidden">
          <div
            className="px-4 sm:px-6 py-3.5 border-b flex flex-wrap items-center justify-between gap-2 text-[0.875rem]"
            style={{
              backgroundColor: 'var(--bg-surface-secondary)',
              borderColor: 'var(--border-hairline)',
            }}
          >
            <span className="text-[var(--ink-secondary)]">
              Showing {filteredMaintenance.length} maintenance ticket(s)
            </span>
            <span className="font-semibold text-[var(--ink-primary)] font-mono-nums">
              Total Est. / Actual Cost: {formatNaira(filteredMaintenanceCost)}
            </span>
          </div>

          {/* Mobile Stacked Cards */}
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {filteredMaintenance.length === 0 ? (
              <p className="py-10 px-4 text-center hig-subhead">
                No maintenance tickets match your filter.
              </p>
            ) : (
              filteredMaintenance.map((m) => {
                const scopeInfo = resolveMaintenanceDisplayScope(
                  m,
                  state.units,
                  state.agreements,
                  state.tenants
                );
                return (
                  <div key={m.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="hig-headline block">{m.issue}</span>
                        <span className="hig-footnote block mt-0.5">
                          {scopeInfo.primaryScope}
                          {scopeInfo.tenantName ? ` · ${scopeInfo.tenantName}` : ''}
                        </span>
                      </div>
                      <span className="hig-headline font-mono-nums shrink-0">
                        {formatNaira(m.estimatedOrActualCost)}
                      </span>
                    </div>
                    {m.resolutionDetails && <p className="hig-footnote">{m.resolutionDetails}</p>}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge label={m.status} />
                        {m.linkedExpenseId && (
                          <button
                            type="button"
                            onClick={() => setSubTab('expenses')}
                            className="text-[0.75rem] font-semibold text-[var(--accent-ink)] underline underline-offset-2 min-h-[36px] inline-flex items-center"
                          >
                            Linked Expense
                          </button>
                        )}
                      </div>
                      <span className="hig-caption">
                        {formatDateShort(m.dateReported)} · {m.assignedTo}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        aria-label={`Update status for ${m.issue}`}
                        value={m.status}
                        onChange={(e) =>
                          updateMaintenanceStatus(
                            m.id,
                            e.target.value as MaintenanceRecord['status']
                          )
                        }
                        className="hig-input w-full"
                      >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => openEditMaintenance(m)}
                        className="hig-btn-secondary w-full"
                      >
                        <Pencil className="w-4 h-4" />
                        <span>Edit Ticket</span>
                      </button>
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
                  <th className="py-3 px-5">Reported</th>
                  <th className="py-3 px-4">Scope / Unit</th>
                  <th className="py-3 px-4">Issue &amp; Resolution</th>
                  <th className="py-3 px-4">Assigned To</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Cost</th>
                  <th className="py-3 px-5 text-right">Update</th>
                </tr>
              </thead>
              <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
                {filteredMaintenance.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center hig-subhead">
                      No maintenance tickets match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredMaintenance.map((m) => {
                    const scopeInfo = resolveMaintenanceDisplayScope(
                      m,
                      state.units,
                      state.agreements,
                      state.tenants
                    );
                    return (
                      <tr key={m.id} className="hover:bg-[var(--bg-hover)]">
                        <td className="py-3.5 px-5 font-mono-nums text-[var(--ink-primary)] whitespace-nowrap">
                          {formatDateShort(m.dateReported)}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--ink-secondary)]">
                          <span className="block text-[var(--ink-primary)] font-medium">
                            {scopeInfo.primaryScope}
                          </span>
                          <span className="hig-footnote">
                            {scopeInfo.tenantName || scopeInfo.scopeCategory}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-[var(--ink-primary)] block">
                            {m.issue}
                          </span>
                          {m.resolutionDetails && (
                            <span className="hig-footnote block mt-0.5">
                              {m.resolutionDetails}
                            </span>
                          )}
                          {m.linkedExpenseId && (
                            <button
                              type="button"
                              onClick={() => setSubTab('expenses')}
                              className="hig-caption inline-flex items-center gap-1 text-[var(--accent-ink)] hover:underline mt-0.5"
                            >
                              <Link2 className="w-3 h-3" />
                              Linked to Expenses Ledger
                            </button>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--ink-secondary)]">{m.assignedTo}</td>
                        <td className="py-3.5 px-4">
                          <StatusBadge label={m.status} />
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-nums font-semibold text-[var(--ink-primary)] whitespace-nowrap">
                          {formatNaira(m.estimatedOrActualCost)}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <select
                              aria-label={`Update status for ${m.issue}`}
                              value={m.status}
                              onChange={(e) =>
                                updateMaintenanceStatus(
                                  m.id,
                                  e.target.value as MaintenanceRecord['status']
                                )
                              }
                              className="hig-input min-h-[38px] py-1.5 text-[0.8125rem]"
                            >
                              <option value="Open">Open</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Resolved">Resolved</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => openEditMaintenance(m)}
                              aria-label={`Edit maintenance ticket ${m.issue}`}
                              className="hig-btn-secondary !min-h-[38px] !px-3 !text-[0.8125rem]"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
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
      )}

      {/* Record / Edit Expense Modal */}
      {showExpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-modal-title"
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
              <h3 id="expense-modal-title" className="hig-headline">
                {editingExpenseId ? 'Edit Expense / Outgoing' : 'Record Property Expense'}
              </h3>
              <button
                type="button"
                onClick={() => setShowExpModal(false)}
                className="hig-touch-icon"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveExpense} className="p-5 space-y-4 overflow-y-auto">
              {expError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl text-[0.875rem] font-medium"
                  style={{
                    backgroundColor: 'var(--status-danger-bg)',
                    color: 'var(--status-danger-ink)',
                  }}
                >
                  {expError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="exp-date" className="block hig-footnote mb-1.5">
                    Date
                  </label>
                  <input
                    id="exp-date"
                    type="date"
                    value={eDate}
                    onChange={(e) => setEDate(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="exp-amount" className="block hig-footnote mb-1.5">
                    Amount (₦)
                  </label>
                  <CurrencyInput
                    id="exp-amount"
                    min={1}
                    value={eAmount}
                    onValueChange={(raw) => setEAmount(raw)}
                    placeholder="e.g. 150,000"
                    className="hig-input w-full"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="exp-category" className="block hig-footnote mb-1.5">
                    Category
                  </label>
                  <select
                    id="exp-category"
                    value={eCategory}
                    onChange={(e) => setECategory(e.target.value as PropertyExpense['category'])}
                    className="hig-input w-full"
                  >
                    <option value="Repairs">Repairs</option>
                    <option value="Security">Security</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Cleaning">Cleaning</option>
                    <option value="Legal & Admin">Legal &amp; Admin</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="exp-vendor" className="block hig-footnote mb-1.5">
                    Vendor / Paid To
                  </label>
                  <input
                    id="exp-vendor"
                    type="text"
                    value={eVendor}
                    onChange={(e) => setEVendor(e.target.value)}
                    placeholder="e.g. Plumber, Family Member, Charity"
                    className="hig-input w-full"
                    required
                  />
                </div>
              </div>

              {(eCategory === 'Other' || eIsNonProperty) && (
                <div className="hig-card-inset p-3.5 space-y-3">
                  {eCategory === 'Other' && (
                    <div>
                      <label htmlFor="exp-custom-purpose" className="block hig-footnote mb-1.5">
                        What is this expense for? *
                      </label>
                      <input
                        id="exp-custom-purpose"
                        type="text"
                        value={eCustomCategoryLabel}
                        onChange={(e) => setECustomCategoryLabel(e.target.value)}
                        placeholder="e.g. Remembrance for Dad, Donation from Purse"
                        className="hig-input w-full"
                        required
                      />
                    </div>
                  )}

                  <div>
                    <span className="block hig-footnote mb-1.5">Accounting Classification</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEIsNonProperty(false)}
                        aria-pressed={!eIsNonProperty}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-[0.8125rem] transition-colors ${
                          !eIsNonProperty
                            ? 'bg-[var(--bg-surface)] border-[var(--accent)] text-[var(--ink-primary)] font-semibold'
                            : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:bg-[var(--bg-surface)]'
                        }`}
                      >
                        Property Operating Expense
                      </button>
                      <button
                        type="button"
                        onClick={() => setEIsNonProperty(true)}
                        aria-pressed={eIsNonProperty}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-[0.8125rem] transition-colors ${
                          eIsNonProperty
                            ? 'bg-[var(--status-warning-bg)] border-[var(--status-warning-ink)] text-[var(--status-warning-ink)] font-semibold'
                            : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:bg-[var(--bg-surface)]'
                        }`}
                      >
                        Non-Property / Purse Outgoing
                      </button>
                    </div>
                    <p className="hig-caption mt-1.5">
                      Purse outgoings (donations, remembrance, family disbursements) stay accounted for in cash flow while kept separate from property operating costs.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="exp-scope" className="block hig-footnote mb-1.5">
                  Affected Area / Scope
                </label>
                <select
                  id="exp-scope"
                  value={eScopeKey}
                  onChange={(e) => setEScopeKey(e.target.value)}
                  className="hig-input w-full"
                >
                  <optgroup label="Shared / Common Areas">
                    {SHARED_SCOPE_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Individual Units">
                    {state.units.map((u) => (
                      <option key={u.id} value={`UNIT:${u.id}`}>
                        {u.code} · {u.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Custom Scope">
                    <option value={OTHER_SCOPE_KEY}>Other (Specify)</option>
                  </optgroup>
                </select>
              </div>

              {eScopeKey === OTHER_SCOPE_KEY && (
                <div>
                  <label htmlFor="exp-custom-scope" className="block hig-footnote mb-1.5">
                    Specify Custom Scope / Area *
                  </label>
                  <input
                    id="exp-custom-scope"
                    type="text"
                    value={eCustomScope}
                    onChange={(e) => setECustomScope(e.target.value)}
                    placeholder="e.g. Property Purse, Generator House, Back Gate Shed"
                    className="hig-input w-full"
                    required
                  />
                </div>
              )}

              <div>
                <label htmlFor="exp-desc" className="block hig-footnote mb-1.5">
                  Description
                </label>
                <input
                  id="exp-desc"
                  type="text"
                  value={eDesc}
                  onChange={(e) => setEDesc(e.target.value)}
                  placeholder="Clear details for ledger audit..."
                  className="hig-input w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="exp-method" className="block hig-footnote mb-1.5">
                    Payment Method
                  </label>
                  <select
                    id="exp-method"
                    value={eMethod}
                    onChange={(e) => setEMethod(e.target.value as PaymentMethod)}
                    className="hig-input w-full"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="POS">POS</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="exp-ref" className="block hig-footnote mb-1.5">
                    Reference (Optional)
                  </label>
                  <input
                    id="exp-ref"
                    type="text"
                    value={eRef}
                    onChange={(e) => setERef(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowExpModal(false)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="hig-btn-primary">
                  {editingExpenseId ? 'Save Changes' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log / Edit Maintenance Modal */}
      {showMntModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="maintenance-modal-title"
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
              <h3 id="maintenance-modal-title" className="hig-headline">
                {editingMaintenanceId ? 'Edit Maintenance Ticket' : 'Log Maintenance Activity'}
              </h3>
              <button
                type="button"
                onClick={() => setShowMntModal(false)}
                className="hig-touch-icon"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveMaintenance} className="p-5 space-y-4 overflow-y-auto">
              {mntError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl text-[0.875rem] font-medium"
                  style={{
                    backgroundColor: 'var(--status-danger-bg)',
                    color: 'var(--status-danger-ink)',
                  }}
                >
                  {mntError}
                </div>
              )}

              <div>
                <label htmlFor="mnt-scope" className="block hig-footnote mb-1.5">
                  Affected Unit / Scope
                </label>
                <select
                  id="mnt-scope"
                  value={mScopeKey}
                  onChange={(e) => setMScopeKey(e.target.value)}
                  className="hig-input w-full"
                >
                  <optgroup label="Compound & Shared Facilities">
                    {MAINTENANCE_SCOPE_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Individual Units">
                    {state.units.map((u) => (
                      <option key={u.id} value={`UNIT:${u.id}`}>
                        {u.code} · {u.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Custom Scope">
                    <option value={OTHER_SCOPE_KEY}>Other (Specify)</option>
                  </optgroup>
                </select>
              </div>

              {mScopeKey === OTHER_SCOPE_KEY && (
                <div>
                  <label htmlFor="mnt-custom-scope" className="block hig-footnote mb-1.5">
                    Specify Custom Scope / Area *
                  </label>
                  <input
                    id="mnt-custom-scope"
                    type="text"
                    value={mCustomScope}
                    onChange={(e) => setMCustomScope(e.target.value)}
                    placeholder="e.g. Rear Soakaway Pit, Generator Pad, Shared Corridor"
                    className="hig-input w-full"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mnt-date" className="block hig-footnote mb-1.5">
                    Date Reported
                  </label>
                  <input
                    id="mnt-date"
                    type="date"
                    value={mDateReported}
                    onChange={(e) => setMDateReported(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="mnt-status" className="block hig-footnote mb-1.5">
                    Status
                  </label>
                  <select
                    id="mnt-status"
                    value={mStatus}
                    onChange={(e) => setMStatus(e.target.value as MaintenanceRecord['status'])}
                    className="hig-input w-full"
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="mnt-issue" className="block hig-footnote mb-1.5">
                  Issue / Repair Description
                </label>
                <input
                  id="mnt-issue"
                  type="text"
                  value={mIssue}
                  onChange={(e) => setMIssue(e.target.value)}
                  placeholder="e.g. Evacuation of compound soakaway and inspection chamber"
                  className="hig-input w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mnt-vendor" className="block hig-footnote mb-1.5">
                    Assigned Vendor
                  </label>
                  <input
                    id="mnt-vendor"
                    type="text"
                    value={mVendor}
                    onChange={(e) => setMVendor(e.target.value)}
                    placeholder="Vendor or artisan name"
                    className="hig-input w-full"
                  />
                </div>
                <div>
                  <label htmlFor="mnt-cost" className="block hig-footnote mb-1.5">
                    Est. / Actual Cost (₦)
                  </label>
                  <CurrencyInput
                    id="mnt-cost"
                    min={0}
                    value={mCost}
                    onValueChange={(raw) => setMCost(raw)}
                    placeholder="e.g. 85,000"
                    className="hig-input w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={mStatus === 'Resolved' ? '' : 'sm:col-span-2'}>
                  <label htmlFor="mnt-resolution" className="block hig-footnote mb-1.5">
                    Resolution Details (Optional)
                  </label>
                  <input
                    id="mnt-resolution"
                    type="text"
                    value={mResolutionDetails}
                    onChange={(e) => setMResolutionDetails(e.target.value)}
                    placeholder="Work done or inspection notes..."
                    className="hig-input w-full"
                  />
                </div>
                {mStatus === 'Resolved' && (
                  <div>
                    <label htmlFor="mnt-resolved-date" className="block hig-footnote mb-1.5">
                      Resolved Date
                    </label>
                    <input
                      id="mnt-resolved-date"
                      type="date"
                      value={mResolvedDate}
                      onChange={(e) => setMResolvedDate(e.target.value)}
                      className="hig-input w-full font-mono-nums"
                    />
                  </div>
                )}
              </div>

              {mAlreadyLinkedExpenseId ? (
                <div
                  className="p-3 rounded-xl flex items-center gap-2.5 text-[0.8125rem]"
                  style={{
                    backgroundColor: 'var(--status-success-bg)',
                    color: 'var(--status-success-ink)',
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    This maintenance ticket already has a linked entry in the Expenses ledger. Edit that entry under the Expenses tab if payment details changed.
                  </span>
                </div>
              ) : (
                parsedMntCost > 0 && (
                  <div className="hig-card-inset p-3.5 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1">
                      <input
                        type="checkbox"
                        checked={mAlsoPostExpense}
                        onChange={(e) => setMAlsoPostExpense(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded accent-[var(--accent)]"
                      />
                      <span className="text-[0.875rem] text-[var(--ink-primary)]">
                        <strong className="font-semibold block">
                          Also post cost ({formatNaira(parsedMntCost)}) to Expenses ledger
                        </strong>
                        <span className="hig-caption block mt-0.5">
                          Creates a linked Repairs expense with the same scope, vendor, and date.
                        </span>
                      </span>
                    </label>

                    {mAlsoPostExpense && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label htmlFor="mnt-exp-method" className="block hig-footnote mb-1.5">
                            Payment Method
                          </label>
                          <select
                            id="mnt-exp-method"
                            value={mExpenseMethod}
                            onChange={(e) => setMExpenseMethod(e.target.value as PaymentMethod)}
                            className="hig-input w-full"
                          >
                            <option value="Cash">Cash</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="POS">POS</option>
                            <option value="Cheque">Cheque</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="mnt-exp-ref" className="block hig-footnote mb-1.5">
                            Reference (Optional)
                          </label>
                          <input
                            id="mnt-exp-ref"
                            type="text"
                            value={mExpenseRef}
                            onChange={(e) => setMExpenseRef(e.target.value)}
                            className="hig-input w-full font-mono-nums"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMntModal(false)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="hig-btn-primary">
                  {editingMaintenanceId ? 'Save Changes' : 'Save Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
