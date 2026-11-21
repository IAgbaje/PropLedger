import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useRentalStore } from '../context/RentalStore';
import type { RentCycle, UnitOccupancyStatus, UnitType } from '../types/rental';
import { formatNaira, formatTenantName, parseCurrencyValue } from '../utils/format';
import {
  getActiveTenantAgreement,
  getActiveUnitAgreement,
  getTenantDeletionImpact,
  getUnitDeletionImpact,
} from '../utils/portfolioEdits';
import { CurrencyInput } from './CurrencyInput';

const UNIT_TYPES: UnitType[] = [
  'Bedroom',
  'Room',
  'Room & Parlour',
  'Shop',
  'Kiosk',
  'Container Shop',
  'Other',
];

export function EditTenantModal({
  tenantId,
  onClose,
}: {
  tenantId: string | null;
  onClose: () => void;
}) {
  const { state, updateTenantDetailsAndOccupancy } = useRentalStore();
  const tenant = tenantId ? state.tenants.find((t) => t.id === tenantId) : undefined;
  const activeAg = tenant ? getActiveTenantAgreement(state.agreements, tenant.id) : undefined;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [alias, setAlias] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [lateCycles, setLateCycles] = useState('0');
  const [notes, setNotes] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('__VACATE__');
  const [rentCycle, setRentCycle] = useState<RentCycle>('Yearly');
  const [agreedRent, setAgreedRent] = useState('');
  const [securityLevy, setSecurityLevy] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [replaceOccupant, setReplaceOccupant] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenant) return;
    setFirstName(tenant.firstName);
    setLastName(tenant.lastName);
    setAlias(tenant.alias || '');
    setPhone(tenant.phone);
    setEmail(tenant.email);
    setLateCycles(String(tenant.historicalLateCycles ?? 0));
    setNotes(tenant.notes || '');

    if (activeAg) {
      setSelectedUnitId(activeAg.unitId);
      setRentCycle(activeAg.rentCycle);
      setAgreedRent(String(activeAg.agreedRent));
      setSecurityLevy(String(activeAg.securityLevy));
      setStartDate(activeAg.startDate);
      setEndDate(activeAg.endDate);
      setDueDate(activeAg.dueDate);
    } else {
      setSelectedUnitId('__VACATE__');
      setRentCycle(state.settings.defaultRentCycle);
      setAgreedRent('');
      setSecurityLevy(String(state.settings.securityLevyAmount));
      setStartDate(state.referenceDate);
      const nextYr = Number(state.referenceDate.slice(0, 4)) + 1;
      setEndDate(`${nextYr}${state.referenceDate.slice(4)}`);
      setDueDate(state.referenceDate);
    }
    setReplaceOccupant(false);
    setError('');
  }, [tenant?.id, activeAg?.id, state.referenceDate, state.settings.defaultRentCycle, state.settings.securityLevyAmount]);

  if (!tenantId || !tenant) return null;

  const conflictingAg =
    selectedUnitId !== '__VACATE__'
      ? state.agreements.find(
          (a) =>
            a.unitId === selectedUnitId &&
            a.tenantId !== tenant.id &&
            (a.status === 'Active' || a.status === 'Draft')
        )
      : undefined;
  const conflictingTenant = conflictingAg
    ? state.tenants.find((t) => t.id === conflictingAg.tenantId)
    : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const isVacating = selectedUnitId === '__VACATE__';
    const res = updateTenantDetailsAndOccupancy(tenant.id, {
      firstName,
      lastName,
      alias,
      phone,
      email,
      historicalLateCycles: Number(lateCycles) || 0,
      notes,
      occupancyMode: isVacating ? (activeAg ? 'vacate' : 'unchanged') : 'assign',
      unitId: isVacating ? undefined : selectedUnitId,
      rentCycle,
      agreedRent: parseCurrencyValue(agreedRent),
      securityLevy: parseCurrencyValue(securityLevy),
      startDate,
      endDate,
      dueDate,
      replaceExistingOccupant: replaceOccupant,
    });

    if (!res.ok) {
      setError(res.error || 'Could not update tenant details.');
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45 backdrop-blur-[6px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-tenant-modal-title"
    >
      <div
        className="w-full max-w-xl hig-card max-h-[92vh] flex flex-col overflow-hidden"
        style={{ boxShadow: 'var(--shadow-sheet)' }}
      >
        <div
          className="px-6 py-4 border-b flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <div className="min-w-0">
            <h3 id="edit-tenant-modal-title" className="hig-headline truncate">
              Edit Tenant Details &amp; Unit Assignment
            </h3>
            <p className="hig-caption mt-0.5 truncate">
              {formatTenantName(tenant)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hig-touch-icon shrink-0"
            aria-label="Close edit tenant modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {error && (
            <p
              className="p-3 rounded-xl hig-footnote"
              role="alert"
              style={{
                backgroundColor: 'var(--status-danger-bg)',
                color: 'var(--status-danger-ink)',
              }}
            >
              {error}
            </p>
          )}

          <div className="space-y-3">
            <h4 className="hig-caption uppercase tracking-[0.04em] font-semibold">
              Tenant Profile
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-tenant-first" className="block hig-caption mb-1.5">
                  First Name
                </label>
                <input
                  id="edit-tenant-first"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Optional if alias entered"
                  className="hig-input w-full"
                />
              </div>
              <div>
                <label htmlFor="edit-tenant-last" className="block hig-caption mb-1.5">
                  Last Name
                </label>
                <input
                  id="edit-tenant-last"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Optional if alias entered"
                  className="hig-input w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="edit-tenant-alias" className="block hig-caption mb-1.5">
                  Alias / Known As
                </label>
                <input
                  id="edit-tenant-alias"
                  type="text"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="e.g. Mama T, Baba Ibeji, Iya Risi (optional)"
                  className="hig-input w-full"
                />
              </div>
              <div>
                <label htmlFor="edit-tenant-phone" className="block hig-caption mb-1.5">
                  Phone Number
                </label>
                <input
                  id="edit-tenant-phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="hig-input w-full font-mono-nums"
                  placeholder="+234 80..."
                />
              </div>
              <div>
                <label htmlFor="edit-tenant-email" className="block hig-caption mb-1.5">
                  Email Address
                </label>
                <input
                  id="edit-tenant-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="hig-input w-full"
                />
              </div>
              <div>
                <label htmlFor="edit-tenant-cycles" className="block hig-caption mb-1.5">
                  Historical Late Cycles
                </label>
                <input
                  id="edit-tenant-cycles"
                  type="number"
                  min={0}
                  value={lateCycles}
                  onChange={(e) => setLateCycles(e.target.value)}
                  className="hig-input w-full font-mono-nums"
                />
              </div>
              <div>
                <label htmlFor="edit-tenant-notes" className="block hig-caption mb-1.5">
                  Notes
                </label>
                <input
                  id="edit-tenant-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional tenancy or contact notes"
                  className="hig-input w-full"
                />
              </div>
            </div>
          </div>

          <div
            className="pt-4 border-t space-y-3"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <h4 className="hig-caption uppercase tracking-[0.04em] font-semibold">
              Unit Assignment &amp; Active Lease Terms
            </h4>
            <div>
              <label htmlFor="edit-tenant-unit" className="block hig-caption mb-1.5">
                Assigned Unit
              </label>
              <select
                id="edit-tenant-unit"
                value={selectedUnitId}
                onChange={(e) => {
                  setSelectedUnitId(e.target.value);
                  setReplaceOccupant(false);
                }}
                className="hig-input w-full"
              >
                <option value="__VACATE__">
                  {activeAg ? 'Unassign Unit (Vacate Active Tenancy)' : 'No Active Unit Assigned'}
                </option>
                {state.units.map((u) => {
                  const occAg = getActiveUnitAgreement(state.agreements, u.id);
                  const occTenant = occAg
                    ? state.tenants.find((t) => t.id === occAg.tenantId)
                    : undefined;
                  const suffix =
                    occTenant && occTenant.id !== tenant.id
                      ? `Occupied by ${formatTenantName(occTenant)}`
                      : occTenant?.id === tenant.id
                      ? 'Current Unit'
                      : u.occupancyStatus;
                  return (
                    <option key={u.id} value={u.id}>
                      {u.code} · {u.name} ({suffix})
                    </option>
                  );
                })}
              </select>
            </div>

            {conflictingTenant && (
              <label
                className="flex items-start gap-2.5 p-3 rounded-xl border text-[13px] cursor-pointer"
                style={{
                  backgroundColor: 'var(--status-warning-bg)',
                  borderColor: 'var(--border-hairline)',
                  color: 'var(--status-warning-ink)',
                }}
              >
                <input
                  type="checkbox"
                  checked={replaceOccupant}
                  onChange={(e) => setReplaceOccupant(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span>
                  This unit is currently assigned to{' '}
                  <strong>
                    {formatTenantName(conflictingTenant)}
                  </strong>
                  . Replace occupant and end their active tenancy on this unit.
                </span>
              </label>
            )}

            {selectedUnitId !== '__VACATE__' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="edit-tenant-rent" className="block hig-caption mb-1.5">
                    Agreed Rent (₦)
                  </label>
                  <CurrencyInput
                    id="edit-tenant-rent"
                    min={1}
                    value={agreedRent}
                    onValueChange={(raw) => setAgreedRent(raw)}
                    placeholder="e.g. 120,000"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-tenant-levy" className="block hig-caption mb-1.5">
                    Security Levy (₦)
                  </label>
                  <CurrencyInput
                    id="edit-tenant-levy"
                    min={0}
                    value={securityLevy}
                    onValueChange={(raw) => setSecurityLevy(raw)}
                    placeholder="e.g. 4,000"
                  />
                </div>
                <div>
                  <label htmlFor="edit-tenant-cycle" className="block hig-caption mb-1.5">
                    Rent Cycle
                  </label>
                  <select
                    id="edit-tenant-cycle"
                    value={rentCycle}
                    onChange={(e) => setRentCycle(e.target.value as RentCycle)}
                    className="hig-input w-full"
                  >
                    <option value="Yearly">Yearly</option>
                    <option value="Bi-Annual">Bi-Annual</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-tenant-start" className="block hig-caption mb-1.5">
                    Start Date
                  </label>
                  <input
                    id="edit-tenant-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-tenant-end" className="block hig-caption mb-1.5">
                    End Date
                  </label>
                  <input
                    id="edit-tenant-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-tenant-due" className="block hig-caption mb-1.5">
                    Due Date
                  </label>
                  <input
                    id="edit-tenant-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="hig-input w-full font-mono-nums"
                    required
                  />
                </div>
              </div>
            )}
          </div>

          <div
            className="flex justify-end gap-2.5 pt-3 border-t"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <button type="button" onClick={onClose} className="hig-btn-secondary">
              Cancel
            </button>
            <button type="submit" className="hig-btn-primary">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DeleteTenantConfirmModal({
  tenantId,
  onClose,
}: {
  tenantId: string | null;
  onClose: () => void;
}) {
  const { state, deleteTenant } = useRentalStore();
  const [error, setError] = useState('');

  if (!tenantId) return null;
  const impact = getTenantDeletionImpact(state, tenantId);
  if (!impact) return null;

  const handleConfirm = () => {
    const res = deleteTenant(tenantId);
    if (!res.ok) {
      setError(res.error || 'Could not delete tenant.');
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[6px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-tenant-title"
    >
      <div
        className="w-full max-w-md hig-card overflow-hidden"
        style={{ boxShadow: 'var(--shadow-sheet)' }}
      >
        <div
          className="px-6 py-4 border-b flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <h3 id="delete-tenant-title" className="hig-headline">
            Delete Tenant Record?
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="hig-touch-icon"
            aria-label="Close delete confirmation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <p
              className="p-3 rounded-xl hig-footnote"
              style={{
                backgroundColor: 'var(--status-danger-bg)',
                color: 'var(--status-danger-ink)',
              }}
            >
              {error}
            </p>
          )}

          <p className="hig-body text-[0.9375rem]">
            You are about to permanently remove{' '}
            <strong className="text-[var(--ink-primary)]">{impact.tenantName}</strong> from{' '}
            {state.property.name}.
          </p>

          <div className="hig-card-inset p-3.5 space-y-1.5 text-[13px] text-[var(--ink-secondary)]">
            <p>
              <strong className="text-[var(--ink-primary)]">Units set to Vacant:</strong>{' '}
              {impact.activeUnitCodes.length > 0 ? impact.activeUnitCodes.join(', ') : 'None'}
            </p>
            <p>
              <strong className="text-[var(--ink-primary)]">Linked records removed:</strong>{' '}
              <span className="font-mono-nums">
                {impact.agreementsCount} agreement(s) · {impact.obligationsCount} charge(s) ·{' '}
                {impact.commitmentsCount} promise(s)
              </span>
            </p>
          </div>

          {impact.confirmedPaymentsCount > 0 && (
            <div
              className="p-3.5 rounded-xl flex items-start gap-2.5 text-[13px]"
              style={{
                backgroundColor: 'var(--status-danger-bg)',
                color: 'var(--status-danger-ink)',
              }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                This tenant has{' '}
                <strong className="font-mono-nums">
                  {impact.confirmedPaymentsCount} confirmed payment(s)
                </strong>{' '}
                totaling{' '}
                <strong className="font-mono-nums">
                  {formatNaira(impact.confirmedPaymentsTotal)}
                </strong>
                . Deleting will remove those payment &amp; receipt entries from the ledger.
              </span>
            </div>
          )}

          <div
            className="flex justify-end gap-2.5 pt-2 border-t"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <button type="button" onClick={onClose} className="hig-btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D70015] hover:bg-[#B80012] text-white font-semibold text-[0.875rem] transition-colors"
            >
              Delete Tenant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EditUnitOccupantModal({
  unitId,
  onClose,
}: {
  unitId: string | null;
  onClose: () => void;
}) {
  const { state, updateUnitDetailsAndOccupant } = useRentalStore();
  const unit = unitId ? state.units.find((u) => u.id === unitId) : undefined;
  const activeAg = unit ? getActiveUnitAgreement(state.agreements, unit.id) : undefined;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<UnitType>('Room');
  const [floorOrWing, setFloorOrWing] = useState('');
  const [occupancyStatus, setOccupancyStatus] = useState<UnitOccupancyStatus>('Vacant');
  const [notes, setNotes] = useState('');

  const [occupantMode, setOccupantMode] = useState<'existing-tenant' | 'new-tenant' | 'vacate'>(
    'vacate'
  );
  const [existingTenantId, setExistingTenantId] = useState('');
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const [agreedRent, setAgreedRent] = useState('');
  const [securityLevy, setSecurityLevy] = useState('');
  const [rentCycle, setRentCycle] = useState<RentCycle>('Yearly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!unit) return;
    setCode(unit.code);
    setName(unit.name);
    setType(unit.type);
    setFloorOrWing(unit.floorOrWing);
    setOccupancyStatus(unit.occupancyStatus);
    setNotes(unit.notes || '');

    if (activeAg) {
      setOccupantMode('existing-tenant');
      setExistingTenantId(activeAg.tenantId);
      setAgreedRent(String(activeAg.agreedRent));
      setSecurityLevy(String(activeAg.securityLevy));
      setRentCycle(activeAg.rentCycle);
      setStartDate(activeAg.startDate);
      setEndDate(activeAg.endDate);
      setDueDate(activeAg.dueDate);
    } else {
      setOccupantMode('vacate');
      setExistingTenantId(state.tenants[0]?.id || '');
      setAgreedRent('');
      setSecurityLevy(String(state.settings.securityLevyAmount));
      setRentCycle(state.settings.defaultRentCycle);
      setStartDate(state.referenceDate);
      const nextYr = Number(state.referenceDate.slice(0, 4)) + 1;
      setEndDate(`${nextYr}${state.referenceDate.slice(4)}`);
      setDueDate(state.referenceDate);
    }
    setNewFirst('');
    setNewLast('');
    setNewAlias('');
    setNewPhone('');
    setNewEmail('');
    setError('');
  }, [unit?.id, activeAg?.id, state.tenants, state.referenceDate, state.settings.defaultRentCycle, state.settings.securityLevyAmount]);

  if (!unitId || !unit) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const res = updateUnitDetailsAndOccupant(unit.id, {
      code,
      name,
      type,
      floorOrWing,
      occupancyStatus,
      notes,
      occupantMode,
      existingTenantId: occupantMode === 'existing-tenant' ? existingTenantId : undefined,
      newTenant:
        occupantMode === 'new-tenant'
          ? {
              firstName: newFirst,
              lastName: newLast,
              alias: newAlias,
              phone: newPhone,
              email: newEmail,
            }
          : undefined,
      agreedRent: parseCurrencyValue(agreedRent),
      securityLevy: parseCurrencyValue(securityLevy),
      rentCycle,
      startDate,
      endDate,
      dueDate,
    });

    if (!res.ok) {
      setError(res.error || 'Could not save unit and occupant changes.');
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45 backdrop-blur-[6px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-unit-modal-title"
    >
      <div
        className="w-full max-w-xl hig-card max-h-[92vh] flex flex-col overflow-hidden"
        style={{ boxShadow: 'var(--shadow-sheet)' }}
      >
        <div
          className="px-6 py-4 border-b flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <div className="min-w-0">
            <h3 id="edit-unit-modal-title" className="hig-headline truncate">
              Edit Unit &amp; Occupant Details
            </h3>
            <p className="hig-caption mt-0.5 truncate">
              {unit.code} · {unit.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hig-touch-icon shrink-0"
            aria-label="Close edit unit modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {error && (
            <p
              className="p-3 rounded-xl hig-footnote"
              role="alert"
              style={{
                backgroundColor: 'var(--status-danger-bg)',
                color: 'var(--status-danger-ink)',
              }}
            >
              {error}
            </p>
          )}

          <div className="space-y-3">
            <h4 className="hig-caption uppercase tracking-[0.04em] font-semibold">
              Unit Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-unit-code" className="block hig-caption mb-1.5">
                  Unit Code
                </label>
                <input
                  id="edit-unit-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="hig-input w-full font-mono-nums"
                  required
                />
              </div>
              <div>
                <label htmlFor="edit-unit-type" className="block hig-caption mb-1.5">
                  Unit Type
                </label>
                <select
                  id="edit-unit-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as UnitType)}
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
              <label htmlFor="edit-unit-name" className="block hig-caption mb-1.5">
                Unit Name
              </label>
              <input
                id="edit-unit-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="hig-input w-full"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-unit-wing" className="block hig-caption mb-1.5">
                  Location / Wing
                </label>
                <input
                  id="edit-unit-wing"
                  type="text"
                  value={floorOrWing}
                  onChange={(e) => setFloorOrWing(e.target.value)}
                  className="hig-input w-full"
                />
              </div>
              <div>
                <label htmlFor="edit-unit-status" className="block hig-caption mb-1.5">
                  Occupancy Status
                </label>
                <select
                  id="edit-unit-status"
                  value={occupancyStatus}
                  onChange={(e) => setOccupancyStatus(e.target.value as UnitOccupancyStatus)}
                  className="hig-input w-full"
                >
                  <option value="Occupied">Occupied</option>
                  <option value="Vacant">Vacant</option>
                  <option value="Under Maintenance">Under Maintenance</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="edit-unit-notes" className="block hig-caption mb-1.5">
                Unit Notes
              </label>
              <input
                id="edit-unit-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional unit specifications or remarks"
                className="hig-input w-full"
              />
            </div>
          </div>

          <div
            className="pt-4 border-t space-y-3"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <h4 className="hig-caption uppercase tracking-[0.04em] font-semibold">
              Unit Occupant &amp; Tenancy
            </h4>
            <div className="hig-segmented w-fit">
              <button
                type="button"
                data-active={occupantMode === 'existing-tenant'}
                onClick={() => setOccupantMode('existing-tenant')}
                className="hig-segmented-item whitespace-nowrap"
              >
                Existing Tenant
              </button>
              <button
                type="button"
                data-active={occupantMode === 'new-tenant'}
                onClick={() => setOccupantMode('new-tenant')}
                className="hig-segmented-item whitespace-nowrap"
              >
                New Occupant
              </button>
              <button
                type="button"
                data-active={occupantMode === 'vacate'}
                onClick={() => {
                  setOccupantMode('vacate');
                  if (occupancyStatus === 'Occupied') {
                    setOccupancyStatus('Vacant');
                  }
                }}
                className="hig-segmented-item whitespace-nowrap"
              >
                Unoccupied
              </button>
            </div>

            {occupantMode === 'vacate' ? (
              <p className="hig-footnote">
                {activeAg
                  ? 'Saving as Unoccupied will end the current active tenancy on this unit and set its status to Vacant.'
                  : 'This unit will remain unoccupied with no active tenant assigned.'}
              </p>
            ) : (
              <div className="space-y-3">
                {occupantMode === 'existing-tenant' ? (
                  <div>
                    <label htmlFor="edit-unit-occupant" className="block hig-caption mb-1.5">
                      Select Occupant
                    </label>
                    <select
                      id="edit-unit-occupant"
                      value={existingTenantId}
                      onChange={(e) => setExistingTenantId(e.target.value)}
                      className="hig-input w-full"
                    >
                      {state.tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {formatTenantName(t)} ({t.phone || t.email || 'No contact on file'})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="edit-unit-new-first" className="block hig-caption mb-1.5">
                        First Name
                      </label>
                      <input
                        id="edit-unit-new-first"
                        type="text"
                        value={newFirst}
                        onChange={(e) => setNewFirst(e.target.value)}
                        placeholder="Optional if alias entered"
                        className="hig-input w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-unit-new-last" className="block hig-caption mb-1.5">
                        Last Name
                      </label>
                      <input
                        id="edit-unit-new-last"
                        type="text"
                        value={newLast}
                        onChange={(e) => setNewLast(e.target.value)}
                        placeholder="Optional if alias entered"
                        className="hig-input w-full"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="edit-unit-new-alias" className="block hig-caption mb-1.5">
                        Alias / Known As
                      </label>
                      <input
                        id="edit-unit-new-alias"
                        type="text"
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        placeholder="e.g. Mama T, Baba Ibeji, Iya Risi (optional)"
                        className="hig-input w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-unit-new-phone" className="block hig-caption mb-1.5">
                        Phone Number
                      </label>
                      <input
                        id="edit-unit-new-phone"
                        type="text"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="Optional (+234 80...)"
                        className="hig-input w-full font-mono-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-unit-new-email" className="block hig-caption mb-1.5">
                        Email Address
                      </label>
                      <input
                        id="edit-unit-new-email"
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="hig-input w-full"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="edit-unit-rent" className="block hig-caption mb-1.5">
                      Agreed Rent (₦)
                    </label>
                    <CurrencyInput
                      id="edit-unit-rent"
                      min={1}
                      value={agreedRent}
                      onValueChange={(raw) => setAgreedRent(raw)}
                      placeholder="e.g. 120,000"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-unit-levy" className="block hig-caption mb-1.5">
                      Security Levy (₦)
                    </label>
                    <CurrencyInput
                      id="edit-unit-levy"
                      min={0}
                      value={securityLevy}
                      onValueChange={(raw) => setSecurityLevy(raw)}
                      placeholder="e.g. 4,000"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-unit-cycle" className="block hig-caption mb-1.5">
                      Rent Cycle
                    </label>
                    <select
                      id="edit-unit-cycle"
                      value={rentCycle}
                      onChange={(e) => setRentCycle(e.target.value as RentCycle)}
                      className="hig-input w-full"
                    >
                      <option value="Yearly">Yearly</option>
                      <option value="Bi-Annual">Bi-Annual</option>
                      <option value="Quarterly">Quarterly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="edit-unit-start" className="block hig-caption mb-1.5">
                      Start Date
                    </label>
                    <input
                      id="edit-unit-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="hig-input w-full font-mono-nums"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-unit-end" className="block hig-caption mb-1.5">
                      End Date
                    </label>
                    <input
                      id="edit-unit-end"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="hig-input w-full font-mono-nums"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-unit-due" className="block hig-caption mb-1.5">
                      Due Date
                    </label>
                    <input
                      id="edit-unit-due"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="hig-input w-full font-mono-nums"
                      required
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div
            className="flex justify-end gap-2.5 pt-3 border-t"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <button type="button" onClick={onClose} className="hig-btn-secondary">
              Cancel
            </button>
            <button type="submit" className="hig-btn-primary">
              Save Unit &amp; Occupant
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DeleteUnitConfirmModal({
  unitId,
  onClose,
}: {
  unitId: string | null;
  onClose: () => void;
}) {
  const { state, deleteUnit } = useRentalStore();
  const [error, setError] = useState('');

  if (!unitId) return null;
  const impact = getUnitDeletionImpact(state, unitId);
  if (!impact) return null;

  const handleConfirm = () => {
    const res = deleteUnit(unitId);
    if (!res.ok) {
      setError(res.error || 'Could not delete unit.');
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[6px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-unit-title"
    >
      <div
        className="w-full max-w-md hig-card overflow-hidden"
        style={{ boxShadow: 'var(--shadow-sheet)' }}
      >
        <div
          className="px-6 py-4 border-b flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <h3 id="delete-unit-title" className="hig-headline">
            Delete Property Unit?
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="hig-touch-icon"
            aria-label="Close delete unit confirmation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <p
              className="p-3 rounded-xl hig-footnote"
              style={{
                backgroundColor: 'var(--status-danger-bg)',
                color: 'var(--status-danger-ink)',
              }}
            >
              {error}
            </p>
          )}

          <p className="hig-body text-[0.9375rem]">
            You are about to remove unit{' '}
            <strong className="text-[var(--ink-primary)]">{impact.unitLabel}</strong> from{' '}
            {state.property.name}.
          </p>

          <div className="hig-card-inset p-3.5 space-y-1.5 text-[13px] text-[var(--ink-secondary)]">
            <p>
              <strong className="text-[var(--ink-primary)]">Current Occupant:</strong>{' '}
              {impact.occupantName || 'Unoccupied'}
            </p>
            <p>
              <strong className="text-[var(--ink-primary)]">Linked lease records removed:</strong>{' '}
              <span className="font-mono-nums">
                {impact.agreementsCount} agreement(s) · {impact.obligationsCount} charge(s) ·{' '}
                {impact.paymentsCount} payment(s)
              </span>
            </p>
            {impact.maintenanceCount > 0 && (
              <p>
                {impact.maintenanceCount} maintenance log(s) will be kept as property-wide records.
              </p>
            )}
          </div>

          <div
            className="flex justify-end gap-2.5 pt-2 border-t"
            style={{ borderColor: 'var(--border-hairline)' }}
          >
            <button type="button" onClick={onClose} className="hig-btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D70015] hover:bg-[#B80012] text-white font-semibold text-[0.875rem] transition-colors"
            >
              Delete Unit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
