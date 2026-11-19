import type {
  Agreement,
  AuditLogEntry,
  RentalAppState,
  RentalObligation,
  RentCycle,
  Tenant,
  Unit,
  UnitOccupancyStatus,
  UnitType,
} from '../types/rental';

export type IdGenerator = (prefix: string) => string;

function defaultUid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function createAuditEntry(
  idGen: IdGenerator,
  actor: string,
  entityType: AuditLogEntry['entityType'],
  entityId: string,
  action: string,
  summary: string,
  opts?: { previousValue?: string; newValue?: string; reason?: string }
): AuditLogEntry {
  return {
    id: idGen('aud'),
    timestamp: new Date().toISOString(),
    actor,
    entityType,
    entityId,
    action,
    summary,
    ...opts,
  };
}

function recomputeUnitOccupancy(
  unit: Unit,
  agreements: Agreement[],
  forcedStatus?: UnitOccupancyStatus
): UnitOccupancyStatus {
  const hasOccupiedLease = agreements.some(
    (a) => a.unitId === unit.id && (a.status === 'Active' || a.status === 'Draft')
  );
  if (forcedStatus) {
    if (forcedStatus === 'Occupied' || hasOccupiedLease) return forcedStatus;
    return forcedStatus;
  }
  if (hasOccupiedLease) return 'Occupied';
  if (unit.occupancyStatus === 'Under Maintenance') return 'Under Maintenance';
  return 'Vacant';
}

export interface TenantEditPayload {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  historicalLateCycles?: number;
  notes?: string;
  archived?: boolean;
  occupancyMode?: 'unchanged' | 'vacate' | 'assign';
  unitId?: string;
  rentCycle?: RentCycle;
  agreedRent?: number;
  securityLevy?: number;
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  rentalPeriodLabel?: string;
  replaceExistingOccupant?: boolean;
}

export interface MutationResult {
  ok: boolean;
  state?: RentalAppState;
  error?: string;
  summary?: string;
}

export function getActiveUnitAgreement(agreements: Agreement[], unitId: string): Agreement | undefined {
  return (
    agreements.find((a) => a.unitId === unitId && a.status === 'Active') ||
    agreements.find((a) => a.unitId === unitId && a.status === 'Draft')
  );
}

export function getActiveTenantAgreement(agreements: Agreement[], tenantId: string): Agreement | undefined {
  return (
    agreements.find((a) => a.tenantId === tenantId && a.status === 'Active') ||
    agreements.find((a) => a.tenantId === tenantId && a.status === 'Draft')
  );
}

export function applyTenantEdit(
  state: RentalAppState,
  tenantId: string,
  payload: TenantEditPayload,
  idGen: IdGenerator = defaultUid
): MutationResult {
  const target = state.tenants.find((t) => t.id === tenantId);
  if (!target) {
    return { ok: false, error: 'Tenant record could not be found.' };
  }

  const firstName = payload.firstName.trim();
  const lastName = payload.lastName.trim();
  const phone = payload.phone.trim();
  const email = payload.email.trim();
  if (!firstName || !lastName) {
    return { ok: false, error: 'First and last name are required.' };
  }
  if (!phone && !email) {
    return { ok: false, error: 'Provide at least a phone number or email address.' };
  }

  const lateCycles =
    typeof payload.historicalLateCycles === 'number' && Number.isFinite(payload.historicalLateCycles)
      ? Math.max(0, Math.floor(payload.historicalLateCycles))
      : target.historicalLateCycles;

  const updatedTenant: Tenant = {
    ...target,
    firstName,
    lastName,
    phone,
    email,
    historicalLateCycles: lateCycles,
    archived: payload.archived ?? target.archived,
    notes: payload.notes !== undefined ? payload.notes.trim() || undefined : target.notes,
  };

  let nextUnits = [...state.units];
  let nextAgreements = [...state.agreements];
  let nextObligations = [...state.obligations];
  let nextPayments = [...state.payments];
  let nextReceipts = [...state.receiptRequests];

  const occupancyMode = payload.occupancyMode ?? 'unchanged';
  const currentActiveAg = getActiveTenantAgreement(nextAgreements, tenantId);
  const touchedUnitIds = new Set<string>();
  let occupancyAuditDetail = '';

  if (occupancyMode === 'vacate') {
    const activeIds = new Set(
      nextAgreements
        .filter((a) => a.tenantId === tenantId && (a.status === 'Active' || a.status === 'Draft'))
        .map((a) => a.id)
    );
    if (activeIds.size > 0) {
      nextAgreements = nextAgreements.map((a) => {
        if (!activeIds.has(a.id)) return a;
        touchedUnitIds.add(a.unitId);
        return { ...a, status: 'Terminated' as const };
      });
      occupancyAuditDetail = 'Vacated assigned unit and ended active tenancy.';
    }
  } else if (occupancyMode === 'assign') {
    const targetUnitId = payload.unitId?.trim() || currentActiveAg?.unitId || '';
    const targetUnit = nextUnits.find((u) => u.id === targetUnitId);
    if (!targetUnit) {
      return { ok: false, error: 'Select a valid unit for occupant assignment.' };
    }

    const agreedRent =
      typeof payload.agreedRent === 'number' && Number.isFinite(payload.agreedRent)
        ? payload.agreedRent
        : currentActiveAg?.agreedRent ?? 0;
    const securityLevy =
      typeof payload.securityLevy === 'number' && Number.isFinite(payload.securityLevy)
        ? Math.max(0, payload.securityLevy)
        : currentActiveAg?.securityLevy ?? state.settings.securityLevyAmount;

    if (agreedRent <= 0) {
      return { ok: false, error: 'Agreed rent must be greater than ₦0 when assigning a unit.' };
    }

    const conflictingAg = nextAgreements.find(
      (a) =>
        a.unitId === targetUnitId &&
        a.tenantId !== tenantId &&
        (a.status === 'Active' || a.status === 'Draft')
    );

    if (conflictingAg && !payload.replaceExistingOccupant) {
      const otherTenant = state.tenants.find((t) => t.id === conflictingAg.tenantId);
      const otherName = otherTenant ? `${otherTenant.firstName} ${otherTenant.lastName}` : 'another tenant';
      return {
        ok: false,
        error: `${targetUnit.code} is currently occupied by ${otherName}. Choose another unit or enable replacing the current occupant.`,
      };
    }

    if (conflictingAg && payload.replaceExistingOccupant) {
      nextAgreements = nextAgreements.map((a) =>
        a.id === conflictingAg.id ? { ...a, status: 'Terminated' as const } : a
      );
      touchedUnitIds.add(targetUnitId);
    }

    const rentCycle = payload.rentCycle ?? currentActiveAg?.rentCycle ?? state.settings.defaultRentCycle;
    const startDate = payload.startDate || currentActiveAg?.startDate || state.referenceDate;
    const endDate =
      payload.endDate ||
      currentActiveAg?.endDate ||
      `${Number(startDate.slice(0, 4)) + 1}${startDate.slice(4)}`;
    const dueDate = payload.dueDate || currentActiveAg?.dueDate || startDate;
    const yearStart = startDate.slice(0, 4);
    const periodBaseLabel =
      payload.rentalPeriodLabel?.trim() || `${yearStart}/${Number(yearStart) + 1} Annual Rent`;

    if (currentActiveAg) {
      const prevUnitId = currentActiveAg.unitId;
      if (prevUnitId !== targetUnitId) {
        touchedUnitIds.add(prevUnitId);
      }
      touchedUnitIds.add(targetUnitId);

      nextAgreements = nextAgreements.map((a) =>
        a.id === currentActiveAg.id
          ? {
              ...a,
              unitId: targetUnitId,
              rentCycle,
              agreedRent,
              securityLevy,
              startDate,
              endDate,
              dueDate,
            }
          : a
      );

      // Keep obligations, payments & receipt requests linked to this agreement aligned on unit & updated amounts/dueDate
      let rentObUpdated = false;
      let levyObUpdated = false;
      const agObligations = nextObligations.filter((o) => o.agreementId === currentActiveAg.id);
      const latestRentOb = [...agObligations]
        .reverse()
        .find((o) => o.chargeType === 'Rent');
      const latestLevyOb = [...agObligations]
        .reverse()
        .find((o) => o.chargeType === 'Security Levy');

      nextObligations = nextObligations.map((o) => {
        if (o.agreementId !== currentActiveAg.id) return o;
        if (latestRentOb && o.id === latestRentOb.id) {
          rentObUpdated = true;
          return {
            ...o,
            unitId: targetUnitId,
            originalAmount: agreedRent,
            dueDate,
          };
        }
        if (latestLevyOb && o.id === latestLevyOb.id) {
          levyObUpdated = true;
          return {
            ...o,
            unitId: targetUnitId,
            originalAmount: securityLevy,
            dueDate,
          };
        }
        return { ...o, unitId: targetUnitId };
      });

      if (!rentObUpdated) {
        nextObligations.push({
          id: idGen('ob'),
          agreementId: currentActiveAg.id,
          tenantId,
          unitId: targetUnitId,
          chargeType: 'Rent',
          rentalPeriodLabel: periodBaseLabel,
          originalAmount: agreedRent,
          dueDate,
          underReview: false,
          createdAt: new Date().toISOString(),
        });
      }

      if (!levyObUpdated && securityLevy > 0) {
        nextObligations.push({
          id: idGen('ob'),
          agreementId: currentActiveAg.id,
          tenantId,
          unitId: targetUnitId,
          chargeType: 'Security Levy',
          rentalPeriodLabel: `${yearStart}/${Number(yearStart) + 1} Security Levy`,
          originalAmount: securityLevy,
          dueDate,
          underReview: false,
          createdAt: new Date().toISOString(),
        });
      }

      if (prevUnitId !== targetUnitId) {
        nextPayments = nextPayments.map((p) =>
          p.agreementId === currentActiveAg.id ? { ...p, unitId: targetUnitId } : p
        );
        nextReceipts = nextReceipts.map((r) => {
          const p = nextPayments.find((pay) => pay.id === r.paymentId);
          return p && p.agreementId === currentActiveAg.id ? { ...r, unitId: targetUnitId } : r;
        });
      }

      occupancyAuditDetail =
        prevUnitId !== targetUnitId
          ? `Reassigned unit to ${targetUnit.code} (Rent ₦${agreedRent.toLocaleString()}).`
          : `Updated lease terms on ${targetUnit.code} (Rent ₦${agreedRent.toLocaleString()}).`;
    } else {
      const agId = idGen('ag');
      const nowIso = new Date().toISOString();
      const newAg: Agreement = {
        id: agId,
        tenantId,
        unitId: targetUnitId,
        status: 'Active',
        rentCycle,
        agreedRent,
        securityLevy,
        startDate,
        endDate,
        dueDate,
        createdAt: nowIso,
      };
      nextAgreements.push(newAg);

      const newObs: RentalObligation[] = [
        {
          id: idGen('ob'),
          agreementId: agId,
          tenantId,
          unitId: targetUnitId,
          chargeType: 'Rent',
          rentalPeriodLabel: periodBaseLabel,
          originalAmount: agreedRent,
          dueDate,
          underReview: false,
          createdAt: nowIso,
        },
      ];
      if (securityLevy > 0) {
        newObs.push({
          id: idGen('ob'),
          agreementId: agId,
          tenantId,
          unitId: targetUnitId,
          chargeType: 'Security Levy',
          rentalPeriodLabel: `${yearStart}/${Number(yearStart) + 1} Security Levy`,
          originalAmount: securityLevy,
          dueDate,
          underReview: false,
          createdAt: nowIso,
        });
      }
      nextObligations = [...nextObligations, ...newObs];
      touchedUnitIds.add(targetUnitId);
      occupancyAuditDetail = `Assigned unit ${targetUnit.code} (Rent ₦${agreedRent.toLocaleString()}).`;
    }
  }

  if (touchedUnitIds.size > 0) {
    nextUnits = nextUnits.map((u) => {
      if (!touchedUnitIds.has(u.id)) return u;
      return {
        ...u,
        occupancyStatus: recomputeUnitOccupancy(u, nextAgreements),
      };
    });
  }

  const nextTenants = state.tenants.map((t) => (t.id === tenantId ? updatedTenant : t));
  const fullName = `${updatedTenant.firstName} ${updatedTenant.lastName}`;
  const summary = `Updated tenant ${fullName}${occupancyAuditDetail ? ` · ${occupancyAuditDetail}` : ''}`;

  return {
    ok: true,
    summary,
    state: {
      ...state,
      units: nextUnits,
      tenants: nextTenants,
      agreements: nextAgreements,
      obligations: nextObligations,
      payments: nextPayments,
      receiptRequests: nextReceipts,
      auditLogs: [
        createAuditEntry(idGen, state.property.managerName, 'Tenant', tenantId, 'Tenant Updated', summary, {
          previousValue: `${target.firstName} ${target.lastName} · ${target.phone}`,
          newValue: `${fullName} · ${updatedTenant.phone}`,
        }),
        ...state.auditLogs,
      ],
    },
  };
}

export interface TenantDeletionImpact {
  tenantName: string;
  activeUnitCodes: string[];
  agreementsCount: number;
  obligationsCount: number;
  confirmedPaymentsCount: number;
  confirmedPaymentsTotal: number;
  commitmentsCount: number;
}

export function getTenantDeletionImpact(state: RentalAppState, tenantId: string): TenantDeletionImpact | null {
  const target = state.tenants.find((t) => t.id === tenantId);
  if (!target) return null;

  const tenantAgs = state.agreements.filter((a) => a.tenantId === tenantId);
  const activeUnitCodes = tenantAgs
    .filter((a) => a.status === 'Active' || a.status === 'Draft')
    .map((a) => state.units.find((u) => u.id === a.unitId)?.code)
    .filter((code): code is string => Boolean(code));

  const confirmedPayments = state.payments.filter(
    (p) => p.tenantId === tenantId && p.status === 'Confirmed'
  );

  return {
    tenantName: `${target.firstName} ${target.lastName}`,
    activeUnitCodes: Array.from(new Set(activeUnitCodes)),
    agreementsCount: tenantAgs.length,
    obligationsCount: state.obligations.filter((o) => o.tenantId === tenantId).length,
    confirmedPaymentsCount: confirmedPayments.length,
    confirmedPaymentsTotal: confirmedPayments.reduce((s, p) => s + p.amount, 0),
    commitmentsCount: state.commitments.filter((c) => c.tenantId === tenantId).length,
  };
}

export function applyTenantDelete(
  state: RentalAppState,
  tenantId: string,
  idGen: IdGenerator = defaultUid
): MutationResult {
  const target = state.tenants.find((t) => t.id === tenantId);
  if (!target) {
    return { ok: false, error: 'Tenant record could not be found.' };
  }

  const removedUnitIds = new Set(
    state.agreements.filter((a) => a.tenantId === tenantId).map((a) => a.unitId)
  );
  const remainingAgreements = state.agreements.filter((a) => a.tenantId !== tenantId);

  const nextUnits = state.units.map((u) => {
    if (!removedUnitIds.has(u.id)) return u;
    return {
      ...u,
      occupancyStatus: recomputeUnitOccupancy(u, remainingAgreements),
    };
  });

  const freedCodes = nextUnits
    .filter((u) => removedUnitIds.has(u.id) && u.occupancyStatus === 'Vacant')
    .map((u) => u.code);

  const fullName = `${target.firstName} ${target.lastName}`;
  const summary = `Deleted tenant ${fullName}${freedCodes.length > 0 ? ` and vacated ${freedCodes.join(', ')}` : ''}.`;

  return {
    ok: true,
    summary,
    state: {
      ...state,
      units: nextUnits,
      tenants: state.tenants.filter((t) => t.id !== tenantId),
      agreements: remainingAgreements,
      obligations: state.obligations.filter((o) => o.tenantId !== tenantId),
      payments: state.payments.filter((p) => p.tenantId !== tenantId),
      receiptRequests: state.receiptRequests.filter((r) => r.tenantId !== tenantId),
      commitments: state.commitments.filter((c) => c.tenantId !== tenantId),
      commissions: state.commissions.filter((c) => c.tenantId !== tenantId),
      notifications: state.notifications.filter((n) => n.tenantId !== tenantId),
      auditLogs: [
        createAuditEntry(idGen, state.property.managerName, 'Tenant', tenantId, 'Tenant Deleted', summary, {
          previousValue: `${fullName} · ${target.phone}`,
        }),
        ...state.auditLogs,
      ],
    },
  };
}

export interface UnitEditAndOccupantPayload {
  code: string;
  name: string;
  type: UnitType;
  floorOrWing: string;
  occupancyStatus: UnitOccupancyStatus;
  notes?: string;
  occupantMode?: 'unchanged' | 'vacate' | 'existing-tenant' | 'new-tenant';
  existingTenantId?: string;
  newTenant?: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    notes?: string;
  };
  agreedRent?: number;
  securityLevy?: number;
  rentCycle?: RentCycle;
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  rentalPeriodLabel?: string;
}

export function applyUnitEditAndOccupant(
  state: RentalAppState,
  unitId: string,
  payload: UnitEditAndOccupantPayload,
  idGen: IdGenerator = defaultUid
): MutationResult {
  const targetUnit = state.units.find((u) => u.id === unitId);
  if (!targetUnit) {
    return { ok: false, error: 'Unit record could not be found.' };
  }

  const code = payload.code.trim();
  const name = payload.name.trim();
  if (!code || !name) {
    return { ok: false, error: 'Unit code and unit name are required.' };
  }

  const duplicateCode = state.units.find(
    (u) => u.id !== unitId && u.code.toLowerCase() === code.toLowerCase()
  );
  if (duplicateCode) {
    return { ok: false, error: `Unit code "${code}" is already used by another unit.` };
  }

  let nextTenants = [...state.tenants];
  let nextAgreements = [...state.agreements];
  let nextObligations = [...state.obligations];

  const currentUnitAg = getActiveUnitAgreement(nextAgreements, unitId);
  const occupantMode = payload.occupantMode ?? 'unchanged';
  let finalStatus: UnitOccupancyStatus = payload.occupancyStatus;
  let occupantDetail = '';

  if (occupantMode === 'vacate') {
    const activeIds = new Set(
      nextAgreements
        .filter((a) => a.unitId === unitId && (a.status === 'Active' || a.status === 'Draft'))
        .map((a) => a.id)
    );
    if (activeIds.size > 0) {
      nextAgreements = nextAgreements.map((a) =>
        activeIds.has(a.id) ? { ...a, status: 'Terminated' as const } : a
      );
      occupantDetail = 'Cleared unit occupant (vacated active tenancy).';
    }
    if (finalStatus === 'Occupied') {
      finalStatus = 'Vacant';
    }
  } else if (occupantMode === 'existing-tenant' || occupantMode === 'new-tenant') {
    let assignedTenant: Tenant | undefined;
    if (occupantMode === 'existing-tenant') {
      assignedTenant = nextTenants.find((t) => t.id === payload.existingTenantId);
      if (!assignedTenant) {
        return { ok: false, error: 'Select a valid tenant for this unit.' };
      }
    } else {
      const nt = payload.newTenant;
      if (!nt || !nt.firstName.trim() || !nt.lastName.trim()) {
        return { ok: false, error: 'First and last name are required for a new occupant.' };
      }
      if (!nt.phone.trim() && !nt.email.trim()) {
        return { ok: false, error: 'Provide at least a phone number or email for the new occupant.' };
      }
      assignedTenant = {
        id: idGen('t'),
        firstName: nt.firstName.trim(),
        lastName: nt.lastName.trim(),
        phone: nt.phone.trim(),
        email: nt.email.trim(),
        archived: false,
        notificationsPaused: false,
        historicalLateCycles: 0,
        createdAt: new Date().toISOString(),
        notes: nt.notes?.trim() || undefined,
      };
      nextTenants.push(assignedTenant);
    }

    const agreedRent =
      typeof payload.agreedRent === 'number' && Number.isFinite(payload.agreedRent)
        ? payload.agreedRent
        : currentUnitAg?.agreedRent ?? 0;
    const securityLevy =
      typeof payload.securityLevy === 'number' && Number.isFinite(payload.securityLevy)
        ? Math.max(0, payload.securityLevy)
        : currentUnitAg?.securityLevy ?? state.settings.securityLevyAmount;

    if (agreedRent <= 0) {
      return { ok: false, error: 'Agreed rent must be greater than ₦0.' };
    }

    const rentCycle = payload.rentCycle ?? currentUnitAg?.rentCycle ?? state.settings.defaultRentCycle;
    const startDate = payload.startDate || currentUnitAg?.startDate || state.referenceDate;
    const endDate =
      payload.endDate ||
      currentUnitAg?.endDate ||
      `${Number(startDate.slice(0, 4)) + 1}${startDate.slice(4)}`;
    const dueDate = payload.dueDate || currentUnitAg?.dueDate || startDate;
    const yearStart = startDate.slice(0, 4);
    const periodBaseLabel =
      payload.rentalPeriodLabel?.trim() || `${yearStart}/${Number(yearStart) + 1} Annual Rent`;

    if (currentUnitAg && currentUnitAg.tenantId === assignedTenant.id) {
      // Same occupant: update lease terms cleanly
      nextAgreements = nextAgreements.map((a) =>
        a.id === currentUnitAg.id
          ? {
              ...a,
              rentCycle,
              agreedRent,
              securityLevy,
              startDate,
              endDate,
              dueDate,
            }
          : a
      );

      const agObligations = nextObligations.filter((o) => o.agreementId === currentUnitAg.id);
      const latestRentOb = [...agObligations].reverse().find((o) => o.chargeType === 'Rent');
      const latestLevyOb = [...agObligations].reverse().find((o) => o.chargeType === 'Security Levy');

      nextObligations = nextObligations.map((o) => {
        if (latestRentOb && o.id === latestRentOb.id) {
          return { ...o, originalAmount: agreedRent, dueDate };
        }
        if (latestLevyOb && o.id === latestLevyOb.id) {
          return { ...o, originalAmount: securityLevy, dueDate };
        }
        return o;
      });

      if (!latestLevyOb && securityLevy > 0) {
        nextObligations.push({
          id: idGen('ob'),
          agreementId: currentUnitAg.id,
          tenantId: assignedTenant.id,
          unitId,
          chargeType: 'Security Levy',
          rentalPeriodLabel: `${yearStart}/${Number(yearStart) + 1} Security Levy`,
          originalAmount: securityLevy,
          dueDate,
          underReview: false,
          createdAt: new Date().toISOString(),
        });
      }

      occupantDetail = `Updated occupancy terms for ${assignedTenant.firstName} ${assignedTenant.lastName}.`;
    } else {
      // Terminate previous occupant agreement on this unit if one existed
      if (currentUnitAg) {
        nextAgreements = nextAgreements.map((a) =>
          a.id === currentUnitAg.id ? { ...a, status: 'Terminated' as const } : a
        );
      }

      const agId = idGen('ag');
      const nowIso = new Date().toISOString();
      nextAgreements.push({
        id: agId,
        tenantId: assignedTenant.id,
        unitId,
        status: 'Active',
        rentCycle,
        agreedRent,
        securityLevy,
        startDate,
        endDate,
        dueDate,
        createdAt: nowIso,
      });

      nextObligations.push({
        id: idGen('ob'),
        agreementId: agId,
        tenantId: assignedTenant.id,
        unitId,
        chargeType: 'Rent',
        rentalPeriodLabel: periodBaseLabel,
        originalAmount: agreedRent,
        dueDate,
        underReview: false,
        createdAt: nowIso,
      });

      if (securityLevy > 0) {
        nextObligations.push({
          id: idGen('ob'),
          agreementId: agId,
          tenantId: assignedTenant.id,
          unitId,
          chargeType: 'Security Levy',
          rentalPeriodLabel: `${yearStart}/${Number(yearStart) + 1} Security Levy`,
          originalAmount: securityLevy,
          dueDate,
          underReview: false,
          createdAt: nowIso,
        });
      }

      occupantDetail = `Assigned occupant ${assignedTenant.firstName} ${assignedTenant.lastName}.`;
    }

    if (finalStatus !== 'Under Maintenance') {
      finalStatus = 'Occupied';
    }
  }

  const updatedUnit: Unit = {
    ...targetUnit,
    code,
    name,
    type: payload.type,
    floorOrWing: payload.floorOrWing.trim() || targetUnit.floorOrWing,
    occupancyStatus: finalStatus,
    notes: payload.notes !== undefined ? payload.notes.trim() || undefined : targetUnit.notes,
  };

  const nextUnits = state.units.map((u) => (u.id === unitId ? updatedUnit : u));
  const summary = `Updated unit ${updatedUnit.code} (${updatedUnit.name})${occupantDetail ? ` · ${occupantDetail}` : ''}`;

  return {
    ok: true,
    summary,
    state: {
      ...state,
      units: nextUnits,
      tenants: nextTenants,
      agreements: nextAgreements,
      obligations: nextObligations,
      auditLogs: [
        createAuditEntry(idGen, state.property.managerName, 'Unit', unitId, 'Unit Updated', summary, {
          previousValue: `${targetUnit.code} · ${targetUnit.occupancyStatus}`,
          newValue: `${updatedUnit.code} · ${updatedUnit.occupancyStatus}`,
        }),
        ...state.auditLogs,
      ],
    },
  };
}

export interface UnitDeletionImpact {
  unitLabel: string;
  occupantName?: string;
  agreementsCount: number;
  obligationsCount: number;
  paymentsCount: number;
  maintenanceCount: number;
}

export function getUnitDeletionImpact(state: RentalAppState, unitId: string): UnitDeletionImpact | null {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return null;

  const activeAg = getActiveUnitAgreement(state.agreements, unitId);
  const occupant = activeAg ? state.tenants.find((t) => t.id === activeAg.tenantId) : undefined;

  return {
    unitLabel: `${unit.code} · ${unit.name}`,
    occupantName: occupant ? `${occupant.firstName} ${occupant.lastName}` : undefined,
    agreementsCount: state.agreements.filter((a) => a.unitId === unitId).length,
    obligationsCount: state.obligations.filter((o) => o.unitId === unitId).length,
    paymentsCount: state.payments.filter((p) => p.unitId === unitId && p.status === 'Confirmed').length,
    maintenanceCount: state.maintenance.filter((m) => m.unitId === unitId).length,
  };
}

export function applyUnitDelete(
  state: RentalAppState,
  unitId: string,
  idGen: IdGenerator = defaultUid
): MutationResult {
  const target = state.units.find((u) => u.id === unitId);
  if (!target) {
    return { ok: false, error: 'Unit record could not be found.' };
  }

  const removedAgreementIds = new Set(
    state.agreements.filter((a) => a.unitId === unitId).map((a) => a.id)
  );
  const removedPaymentIds = new Set(
    state.payments.filter((p) => p.unitId === unitId).map((p) => p.id)
  );

  const summary = `Deleted unit ${target.code} (${target.name}).`;

  return {
    ok: true,
    summary,
    state: {
      ...state,
      units: state.units.filter((u) => u.id !== unitId),
      agreements: state.agreements.filter((a) => a.unitId !== unitId),
      obligations: state.obligations.filter((o) => o.unitId !== unitId),
      payments: state.payments.filter((p) => p.unitId !== unitId),
      receiptRequests: state.receiptRequests.filter((r) => r.unitId !== unitId),
      commissions: state.commissions.filter(
        (c) => !removedAgreementIds.has(c.agreementId) && !removedPaymentIds.has(c.paymentId)
      ),
      maintenance: state.maintenance.map((m) =>
        m.unitId === unitId ? { ...m, unitId: undefined } : m
      ),
      auditLogs: [
        createAuditEntry(idGen, state.property.managerName, 'Unit', unitId, 'Unit Deleted', summary, {
          previousValue: `${target.code} · ${target.name}`,
        }),
        ...state.auditLogs,
      ],
    },
  };
}
