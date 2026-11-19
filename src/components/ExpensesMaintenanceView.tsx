import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import type { MaintenanceRecord, PaymentMethod, PropertyExpense } from '../types/rental';
import { exportFilteredCsv } from '../utils/csvExport';
import { formatDateShort, formatNaira, parseCurrencyValue } from '../utils/format';
import { CurrencyInput } from './CurrencyInput';
import { StatusBadge } from './StatusBadge';
import { ExportCsvButton, SearchInput } from './TableToolbarControls';

export function ExpensesMaintenanceView() {
  const {
    state,
    recordExpense,
    recordMaintenance,
    updateMaintenanceStatus,
  } = useRentalStore();

  const [subTab, setSubTab] = useState<'expenses' | 'maintenance'>('expenses');
  const [catFilter, setCatFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  // Add Expense Modal
  const [showExpModal, setShowExpModal] = useState(false);
  const [eDate, setEDate] = useState(state.referenceDate);
  const [eAmount, setEAmount] = useState('');
  const [eCategory, setECategory] = useState<PropertyExpense['category']>('Repairs');
  const [eDesc, setEDesc] = useState('');
  const [eVendor, setEVendor] = useState('');
  const [eMethod, setEMethod] = useState<PaymentMethod>('Bank Transfer');
  const [eRef, setERef] = useState('');

  // Add Maintenance Modal
  const [showMntModal, setShowMntModal] = useState(false);
  const [mUnitId, setMUnitId] = useState('');
  const [mIssue, setMIssue] = useState('');
  const [mVendor, setMVendor] = useState('');
  const [mCost, setMCost] = useState('');

  const q = search.trim().toLowerCase();

  const filteredExpenses = useMemo(() => {
    return state.expenses.filter((e) => {
      if (catFilter !== 'All' && e.category !== catFilter) return false;
      if (q) {
        const searchable = `${e.vendor} ${e.description} ${e.category} ${e.paymentMethod || ''} ${e.reference || ''}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [state.expenses, catFilter, q]);

  const filteredMaintenance = useMemo(() => {
    return state.maintenance.filter((m) => {
      if (!q) return true;
      const unit = m.unitId ? state.units.find((u) => u.id === m.unitId) : undefined;
      const agreement = unit
        ? state.agreements.find((a) => a.unitId === unit.id && a.status === 'Active') ||
          state.agreements.find((a) => a.unitId === unit.id)
        : undefined;
      const tenant = agreement ? state.tenants.find((t) => t.id === agreement.tenantId) : undefined;
      const searchable = `${unit?.code || 'Common Property'} ${unit?.name || ''} ${tenant ? `${tenant.firstName} ${tenant.lastName}` : ''} ${m.issue} ${m.assignedTo} ${m.resolutionDetails || ''} ${m.status}`.toLowerCase();
      return searchable.includes(q);
    });
  }, [state.maintenance, state.units, state.agreements, state.tenants, q]);

  const filteredTotal = filteredExpenses.reduce((s, e) => s + e.amount, 0);

  const handleExportExpensesCsv = () => {
    exportFilteredCsv(
      `propledger-expenses-${state.referenceDate}.csv`,
      ['Date', 'Category', 'Description', 'Vendor / Paid To', 'Payment Method', 'Reference', 'Amount (NGN)'],
      filteredExpenses.map((exp) => [
        exp.date,
        exp.category,
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
        'Unit Code',
        'Scope / Unit Name',
        'Occupant Tenant',
        'Issue',
        'Resolution Details',
        'Assigned To',
        'Status',
        'Est / Actual Cost (NGN)',
      ],
      filteredMaintenance.map((m) => {
        const unit = m.unitId ? state.units.find((u) => u.id === m.unitId) : undefined;
        const agreement = unit
          ? state.agreements.find((a) => a.unitId === unit.id && a.status === 'Active') ||
            state.agreements.find((a) => a.unitId === unit.id)
          : undefined;
        const tenant = agreement ? state.tenants.find((t) => t.id === agreement.tenantId) : undefined;
        return [
          m.dateReported,
          unit?.code || 'Common',
          unit?.name || 'Common Property',
          tenant ? `${tenant.firstName} ${tenant.lastName}` : '',
          m.issue,
          m.resolutionDetails || '',
          m.assignedTo,
          m.status,
          m.estimatedOrActualCost,
        ];
      })
    );
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    recordExpense({
      date: eDate,
      amount: parseCurrencyValue(eAmount),
      category: eCategory,
      description: eDesc,
      vendor: eVendor,
      paymentMethod: eMethod,
      reference: eRef || undefined,
    });
    setShowExpModal(false);
    setEAmount('');
    setEDesc('');
    setEVendor('');
    setERef('');
  };

  const handleSaveMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    recordMaintenance({
      unitId: mUnitId || undefined,
      issue: mIssue,
      dateReported: state.referenceDate,
      status: 'Open',
      assignedTo: mVendor || 'Pending Assignment',
      estimatedOrActualCost: parseCurrencyValue(mCost),
    });
    setShowMntModal(false);
    setMIssue('');
    setMVendor('');
    setMCost('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="hig-title-1">Expenses & Maintenance Log</h1>
          <p className="hig-callout mt-1">
            Property outgoings and repairs remain separate from tenant rent obligations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowMntModal(true)}
            className="hig-btn-secondary whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Log Maintenance</span>
          </button>
          <button
            type="button"
            onClick={() => setShowExpModal(true)}
            className="hig-btn-primary whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

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
          {subTab === 'expenses' && (
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              aria-label="Filter expenses by category"
              className="hig-input w-full sm:w-auto"
            >
              <option value="All">All Categories</option>
              <option value="Repairs">Repairs</option>
              <option value="Security">Security</option>
              <option value="Utilities">Utilities</option>
              <option value="Cleaning">Cleaning</option>
              <option value="Legal & Admin">Legal & Admin</option>
              <option value="Other">Other</option>
            </select>
          )}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={
              subTab === 'expenses'
                ? 'Search vendor, description, or unit...'
                : 'Search unit number, tenant name, or issue...'
            }
            ariaLabel="Search expenses and maintenance by unit number, tenant name, or vendor"
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

      {subTab === 'expenses' ? (
        <div className="hig-card overflow-hidden">
          <div
            className="px-4 sm:px-6 py-3.5 border-b flex flex-wrap items-center justify-between gap-2 text-[0.875rem]"
            style={{
              backgroundColor: 'var(--bg-surface-secondary)',
              borderColor: 'var(--border-hairline)',
            }}
          >
            <span className="text-[var(--ink-secondary)]">
              Showing {filteredExpenses.length} expense record(s)
            </span>
            <span className="font-semibold text-[var(--ink-primary)] font-mono-nums">
              Filtered Total: {formatNaira(filteredTotal)}
            </span>
          </div>

          {/* Mobile Stacked Cards */}
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {filteredExpenses.length === 0 ? (
              <p className="py-10 px-4 text-center hig-subhead">
                No expense records match your filter.
              </p>
            ) : (
              filteredExpenses.map((exp) => (
                <div key={exp.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="hig-headline block">{exp.description}</span>
                      <span className="hig-footnote font-mono-nums">
                        {formatDateShort(exp.date)} · {exp.vendor}
                      </span>
                    </div>
                    <span className="hig-headline font-mono-nums shrink-0">
                      {formatNaira(exp.amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <StatusBadge label={exp.category} tone="neutral" />
                    <span className="hig-caption font-mono-nums">
                      {exp.paymentMethod || '—'} {exp.reference ? `· ${exp.reference}` : ''}
                    </span>
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
                  style={{ borderColor: 'var(--border-hairline)', color: 'var(--ink-tertiary)' }}
                >
                  <th className="py-3 px-5">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Vendor / Paid To</th>
                  <th className="py-3 px-4">Method & Ref</th>
                  <th className="py-3 px-5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y text-[0.875rem]" style={{ borderColor: 'var(--border-subtle)' }}>
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center hig-subhead">
                      No expense records match your filter.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-[var(--bg-hover)]">
                      <td className="py-3.5 px-5 font-mono-nums text-[var(--ink-primary)]">
                        {formatDateShort(exp.date)}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusBadge label={exp.category} tone="neutral" />
                      </td>
                      <td className="py-3.5 px-4 text-[var(--ink-primary)]">{exp.description}</td>
                      <td className="py-3.5 px-4 text-[var(--ink-secondary)]">{exp.vendor}</td>
                      <td className="py-3.5 px-4 hig-footnote">
                        {exp.paymentMethod || '—'} {exp.reference ? `· ${exp.reference}` : ''}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono-nums font-semibold text-[var(--ink-primary)]">
                        {formatNaira(exp.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="hig-card overflow-hidden">
          <div
            className="px-4 sm:px-6 py-3.5 border-b flex items-center justify-between text-[0.875rem]"
            style={{
              backgroundColor: 'var(--bg-surface-secondary)',
              borderColor: 'var(--border-hairline)',
            }}
          >
            <span className="text-[var(--ink-secondary)]">
              Showing {filteredMaintenance.length} maintenance ticket(s)
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
                const unit = m.unitId ? state.units.find((u) => u.id === m.unitId) : undefined;
                const agreement = unit
                  ? state.agreements.find((a) => a.unitId === unit.id && a.status === 'Active') ||
                    state.agreements.find((a) => a.unitId === unit.id)
                  : undefined;
                const tenant = agreement
                  ? state.tenants.find((t) => t.id === agreement.tenantId)
                  : undefined;
                return (
                  <div key={m.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="hig-headline block">{m.issue}</span>
                        <span className="hig-footnote">
                          {unit ? `${unit.code} · ${unit.name}` : 'Common Property'}
                          {tenant ? ` · ${tenant.firstName} ${tenant.lastName}` : ''}
                        </span>
                      </div>
                      <span className="hig-headline font-mono-nums shrink-0">
                        {formatNaira(m.estimatedOrActualCost)}
                      </span>
                    </div>
                    {m.resolutionDetails && <p className="hig-footnote">{m.resolutionDetails}</p>}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <StatusBadge label={m.status} />
                      <span className="hig-caption">
                        {formatDateShort(m.dateReported)} · {m.assignedTo}
                      </span>
                    </div>
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
                  <th className="py-3 px-4">Issue & Resolution</th>
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
                    const unit = m.unitId ? state.units.find((u) => u.id === m.unitId) : undefined;
                    const agreement = unit
                      ? state.agreements.find((a) => a.unitId === unit.id && a.status === 'Active') ||
                        state.agreements.find((a) => a.unitId === unit.id)
                      : undefined;
                    const tenant = agreement
                      ? state.tenants.find((t) => t.id === agreement.tenantId)
                      : undefined;
                    return (
                      <tr key={m.id} className="hover:bg-[var(--bg-hover)]">
                        <td className="py-3.5 px-5 font-mono-nums text-[var(--ink-primary)]">
                          {formatDateShort(m.dateReported)}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--ink-secondary)]">
                          <span className="block text-[var(--ink-primary)]">
                            {unit ? `${unit.code} · ${unit.name}` : 'Common Property'}
                          </span>
                          {tenant && (
                            <span className="hig-footnote">
                              {tenant.firstName} {tenant.lastName}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-[var(--ink-primary)] block">{m.issue}</span>
                          {m.resolutionDetails && (
                            <span className="hig-footnote">{m.resolutionDetails}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-[var(--ink-secondary)]">{m.assignedTo}</td>
                        <td className="py-3.5 px-4">
                          <StatusBadge label={m.status} />
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-nums font-semibold text-[var(--ink-primary)]">
                          {formatNaira(m.estimatedOrActualCost)}
                        </td>
                        <td className="py-3.5 px-5 text-right">
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

      {/* Record Expense Modal */}
      {showExpModal && (
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
              <h3 className="hig-headline">Record Property Expense</h3>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block hig-footnote mb-1.5">Date</label>
                  <input
                    type="date"
                    value={eDate}
                    onChange={(e) => setEDate(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block hig-footnote mb-1.5">Amount (₦)</label>
                  <CurrencyInput
                    min={1}
                    value={eAmount}
                    onValueChange={(raw) => setEAmount(raw)}
                    placeholder="e.g. 4,000,000"
                    className="hig-input w-full"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block hig-footnote mb-1.5">Category</label>
                  <select
                    value={eCategory}
                    onChange={(e) => setECategory(e.target.value as PropertyExpense['category'])}
                    className="hig-input w-full"
                  >
                    <option value="Repairs">Repairs</option>
                    <option value="Security">Security</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Cleaning">Cleaning</option>
                    <option value="Legal & Admin">Legal & Admin</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block hig-footnote mb-1.5">Vendor / Paid To</label>
                  <input
                    type="text"
                    value={eVendor}
                    onChange={(e) => setEVendor(e.target.value)}
                    className="hig-input w-full"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">Description</label>
                <input
                  type="text"
                  value={eDesc}
                  onChange={(e) => setEDesc(e.target.value)}
                  className="hig-input w-full"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block hig-footnote mb-1.5">Payment Method</label>
                  <select
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
                  <label className="block hig-footnote mb-1.5">Reference (Optional)</label>
                  <input
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
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Maintenance Modal */}
      {showMntModal && (
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
              <h3 className="hig-headline">Log Maintenance Activity</h3>
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
              <div>
                <label className="block hig-footnote mb-1.5">Affected Unit / Scope</label>
                <select
                  value={mUnitId}
                  onChange={(e) => setMUnitId(e.target.value)}
                  className="hig-input w-full"
                >
                  <option value="">Common Property / Exterior</option>
                  {state.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} · {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block hig-footnote mb-1.5">Issue / Repair Description</label>
                <input
                  type="text"
                  value={mIssue}
                  onChange={(e) => setMIssue(e.target.value)}
                  className="hig-input w-full"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block hig-footnote mb-1.5">Assigned Vendor</label>
                  <input
                    type="text"
                    value={mVendor}
                    onChange={(e) => setMVendor(e.target.value)}
                    className="hig-input w-full"
                  />
                </div>
                <div>
                  <label className="block hig-footnote mb-1.5">Est. Cost (₦)</label>
                  <CurrencyInput
                    min={0}
                    value={mCost}
                    onValueChange={(raw) => setMCost(raw)}
                    placeholder="e.g. 250,000"
                    className="hig-input w-full"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMntModal(false)}
                  className="hig-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="hig-btn-primary">
                  Save Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
