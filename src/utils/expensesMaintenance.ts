import type {
  ActivityScopeCategory,
  Agreement,
  AuditLogEntry,
  MaintenanceRecord,
  PaymentMethod,
  PropertyExpense,
  RentalAppState,
  Tenant,
  Unit,
} from '../types/rental';

export const SHARED_SCOPE_PRESETS = [
  'Compound Area / Exterior',
  'Soakaway & Drainage',
  "Shared Tenants' Toilet",
  'Borehole & Water System',
  'Gate & Perimeter Fence',
  'Roofing & General Structure',
  'General Estate / Admin',
] as const;

export const MAINTENANCE_SCOPE_PRESETS = [
  'Compound Area / Exterior',
  'Soakaway & Drainage',
  "Shared Tenants' Toilet",
  'Borehole & Water System',
  'Gate & Perimeter Fence',
  'Roofing & General Structure',
] as const;

export const OTHER_SCOPE_KEY = '__OTHER__';

export interface ScopeResolutionResult {
  ok: boolean;
  error?: string;
  scopeCategory: ActivityScopeCategory;
  scopeLabel: string;
  unitId?: string;
}

export function resolveScopeSelection(input: {
  selectionKey: string;
  customScope?: string;
  units: Unit[];
}): ScopeResolutionResult {
  const key = (input.selectionKey || '').trim();
  const custom = (input.customScope || '').trim();

  if (key === OTHER_SCOPE_KEY) {
    if (!custom) {
      return {
        ok: false,
        error: 'Please specify the custom scope or area when "Other" is selected.',
        scopeCategory: 'Other',
        scopeLabel: '',
      };
    }
    return {
      ok: true,
      scopeCategory: 'Other',
      scopeLabel: custom,
      unitId: undefined,
    };
  }

  if (key.startsWith('UNIT:')) {
    const unitId = key.slice(5);
    const unit = input.units.find((u) => u.id === unitId);
    if (!unit) {
      return {
        ok: false,
        error: 'Selected unit could not be found.',
        scopeCategory: 'Unit',
        scopeLabel: '',
      };
    }
    return {
      ok: true,
      scopeCategory: 'Unit',
      scopeLabel: `${unit.code} · ${unit.name}`,
      unitId: unit.id,
    };
  }

  const presetLabel = key || 'Compound Area / Exterior';
  return {
    ok: true,
    scopeCategory: 'Common Area',
    scopeLabel: presetLabel,
    unitId: undefined,
  };
}

export function getScopeSelectorState(
  record: { unitId?: string; scopeCategory?: ActivityScopeCategory; scopeLabel?: string },
  units: Unit[],
  fallbackPreset: string = 'Compound Area / Exterior'
): { selectionKey: string; customScope: string } {
  if (record.unitId && units.some((u) => u.id === record.unitId)) {
    return { selectionKey: `UNIT:${record.unitId}`, customScope: '' };
  }

  const label = (record.scopeLabel || '').trim();
  if (!label) {
    return { selectionKey: fallbackPreset, customScope: '' };
  }

  if ((SHARED_SCOPE_PRESETS as readonly string[]).includes(label)) {
    return { selectionKey: label, customScope: '' };
  }

  if (record.scopeCategory === 'Other' || label) {
    return { selectionKey: OTHER_SCOPE_KEY, customScope: label };
  }

  return { selectionKey: fallbackPreset, customScope: '' };
}

export function resolveExpenseDisplayScope(exp: PropertyExpense, units: Unit[]): string {
  if (exp.unitId) {
    const u = units.find((unit) => unit.id === exp.unitId);
    if (u) return `${u.code} · ${u.name}`;
  }
  if (exp.scopeLabel && exp.scopeLabel.trim()) {
    return exp.scopeLabel.trim();
  }
  return exp.isNonPropertyOutgoing ? 'Property Purse (Non-Property)' : 'General Estate / Admin';
}

export function resolveMaintenanceDisplayScope(
  mnt: MaintenanceRecord,
  units: Unit[],
  agreements: Agreement[],
  tenants: Tenant[]
): { primaryScope: string; scopeCategory: ActivityScopeCategory; unitCode: string; tenantName?: string } {
  if (mnt.unitId) {
    const unit = units.find((u) => u.id === mnt.unitId);
    if (unit) {
      const agreement =
        agreements.find((a) => a.unitId === unit.id && a.status === 'Active') ||
        agreements.find((a) => a.unitId === unit.id);
      const tenant = agreement ? tenants.find((t) => t.id === agreement.tenantId) : undefined;
      return {
        primaryScope: `${unit.code} · ${unit.name}`,
        scopeCategory: 'Unit',
        unitCode: unit.code,
        tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : undefined,
      };
    }
  }

  const label = (mnt.scopeLabel || '').trim() || 'Compound Area / Exterior';
  const category: ActivityScopeCategory = mnt.scopeCategory || 'Common Area';
  return {
    primaryScope: label,
    scopeCategory: category,
    unitCode: category === 'Other' ? 'Other' : 'Compound',
  };
}

export function resolveExpenseCategoryLabel(exp: PropertyExpense): string {
  if (exp.category === 'Other' && exp.customCategoryLabel?.trim()) {
    return `Other · ${exp.customCategoryLabel.trim()}`;
  }
  return exp.category;
}

export interface ExpenseBreakdownSummary {
  propertyOperatingTotal: number;
  propertyOperatingCount: number;
  nonPropertyOutgoingTotal: number;
  nonPropertyOutgoingCount: number;
  combinedTotal: number;
  totalCount: number;
}

export function computeExpenseBreakdown(expenses: PropertyExpense[]): ExpenseBreakdownSummary {
  let propertyOperatingTotal = 0;
  let propertyOperatingCount = 0;
  let nonPropertyOutgoingTotal = 0;
  let nonPropertyOutgoingCount = 0;

  for (const exp of expenses) {
    if (exp.isNonPropertyOutgoing) {
      nonPropertyOutgoingTotal += exp.amount;
      nonPropertyOutgoingCount += 1;
    } else {
      propertyOperatingTotal += exp.amount;
      propertyOperatingCount += 1;
    }
  }

  return {
    propertyOperatingTotal: Math.round(propertyOperatingTotal * 100) / 100,
    propertyOperatingCount,
    nonPropertyOutgoingTotal: Math.round(nonPropertyOutgoingTotal * 100) / 100,
    nonPropertyOutgoingCount,
    combinedTotal: Math.round((propertyOperatingTotal + nonPropertyOutgoingTotal) * 100) / 100,
    totalCount: expenses.length,
  };
}

export function hydrateLegacyExpense(exp: PropertyExpense, units: Unit[]): PropertyExpense {
  if (exp.scopeCategory && exp.scopeLabel !== undefined) {
    return exp;
  }

  const desc = (exp.description || '').toLowerCase();
  let scopeCategory: ActivityScopeCategory = exp.scopeCategory || 'Common Area';
  let scopeLabel = exp.scopeLabel;
  let customCategoryLabel = exp.customCategoryLabel;
  let isNonPropertyOutgoing = exp.isNonPropertyOutgoing;

  if (exp.unitId && units.some((u) => u.id === exp.unitId)) {
    const unit = units.find((u) => u.id === exp.unitId)!;
    scopeCategory = 'Unit';
    scopeLabel = scopeLabel || `${unit.code} · ${unit.name}`;
  } else if (!scopeLabel) {
    if (desc.includes('soakaway') || desc.includes('drainage') || desc.includes('grease trap') || desc.includes('inspection chamber')) {
      scopeCategory = 'Common Area';
      scopeLabel = 'Soakaway & Drainage';
    } else if (desc.includes('wc') || desc.includes('toilet') || desc.includes('bathroom & kitchen')) {
      scopeCategory = 'Common Area';
      scopeLabel = "Shared Tenants' Toilet";
    } else if (desc.includes('compound') || desc.includes('standpipe')) {
      scopeCategory = 'Common Area';
      scopeLabel = 'Compound Area / Exterior';
    } else if (desc.includes('roofing')) {
      scopeCategory = 'Common Area';
      scopeLabel = 'Roofing & General Structure';
    } else if (desc.includes('family support') || desc.includes('remembrance') || desc.includes('donation')) {
      scopeCategory = 'Other';
      scopeLabel = 'Property Purse (Non-Property)';
      isNonPropertyOutgoing = isNonPropertyOutgoing ?? true;
      if (exp.category === 'Other' && !customCategoryLabel) {
        customCategoryLabel = 'Family Support Disbursement';
      }
    } else if (exp.category === 'Legal & Admin' || exp.category === 'Other') {
      scopeCategory = 'Common Area';
      scopeLabel = 'General Estate / Admin';
      if (exp.category === 'Other' && !customCategoryLabel && desc.includes('olode')) {
        customCategoryLabel = 'Estate Security Assessment';
      }
    } else {
      scopeCategory = 'Common Area';
      scopeLabel = 'Compound Area / Exterior';
    }
  }

  return {
    ...exp,
    scopeCategory,
    scopeLabel,
    customCategoryLabel,
    isNonPropertyOutgoing,
  };
}

export function hydrateLegacyMaintenance(mnt: MaintenanceRecord, units: Unit[]): MaintenanceRecord {
  if (mnt.scopeCategory && mnt.scopeLabel) {
    return mnt;
  }

  if (mnt.unitId) {
    const u = units.find((unit) => unit.id === mnt.unitId);
    if (u) {
      return {
        ...mnt,
        scopeCategory: 'Unit',
        scopeLabel: mnt.scopeLabel || `${u.code} · ${u.name}`,
      };
    }
  }

  const issue = (mnt.issue || '').toLowerCase();
  let scopeLabel = mnt.scopeLabel;
  if (!scopeLabel) {
    if (issue.includes('soakaway') || issue.includes('drainage')) {
      scopeLabel = 'Soakaway & Drainage';
    } else if (issue.includes('toilet') || issue.includes('wc')) {
      scopeLabel = "Shared Tenants' Toilet";
    } else {
      scopeLabel = 'Compound Area / Exterior';
    }
  }

  return {
    ...mnt,
    scopeCategory: mnt.scopeCategory || 'Common Area',
    scopeLabel,
  };
}

export interface ExpenseMutationInput {
  date: string;
  amount: number;
  category: PropertyExpense['category'];
  customCategoryLabel?: string;
  isNonPropertyOutgoing?: boolean;
  scopeSelectionKey: string;
  customScope?: string;
  description: string;
  vendor: string;
  paymentMethod?: PaymentMethod;
  reference?: string;
  notes?: string;
}

export function buildValidatedExpenseFields(
  input: ExpenseMutationInput,
  units: Unit[]
): {
  ok: boolean;
  error?: string;
  fields?: Omit<PropertyExpense, 'id' | 'createdAt'>;
} {
  if (!input.date.trim()) {
    return { ok: false, error: 'Please provide an expense date.' };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Expense amount must be greater than ₦0.' };
  }
  if (input.category === 'Other' && !input.customCategoryLabel?.trim()) {
    return {
      ok: false,
      error: 'Please specify what this "Other" expense or purse outgoing is for.',
    };
  }
  if (!input.description.trim()) {
    return { ok: false, error: 'Please enter an expense description.' };
  }
  if (!input.vendor.trim()) {
    return { ok: false, error: 'Please specify who was paid (Vendor / Recipient).' };
  }

  const scopeRes = resolveScopeSelection({
    selectionKey: input.scopeSelectionKey,
    customScope: input.customScope,
    units,
  });
  if (!scopeRes.ok) {
    return { ok: false, error: scopeRes.error };
  }

  return {
    ok: true,
    fields: {
      date: input.date.trim(),
      amount: Math.round(input.amount * 100) / 100,
      category: input.category,
      customCategoryLabel:
        input.category === 'Other' ? input.customCategoryLabel?.trim() : undefined,
      isNonPropertyOutgoing: Boolean(input.isNonPropertyOutgoing),
      scopeCategory: scopeRes.scopeCategory,
      scopeLabel: scopeRes.scopeLabel,
      unitId: scopeRes.unitId,
      description: input.description.trim(),
      vendor: input.vendor.trim(),
      paymentMethod: input.paymentMethod,
      reference: input.reference?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
    },
  };
}

export function applyEditExpense(
  state: RentalAppState,
  expenseId: string,
  input: ExpenseMutationInput,
  makeId: (prefix: string) => string
): { ok: boolean; error?: string; state: RentalAppState } {
  const existing = state.expenses.find((e) => e.id === expenseId);
  if (!existing) {
    return { ok: false, error: 'Expense record not found.', state };
  }

  const validated = buildValidatedExpenseFields(input, state.units);
  if (!validated.ok || !validated.fields) {
    return { ok: false, error: validated.error, state };
  }

  const updated: PropertyExpense = {
    ...existing,
    ...validated.fields,
  };

  const prevLabel = `${resolveExpenseCategoryLabel(existing)} · ${resolveExpenseDisplayScope(existing, state.units)} · ₦${existing.amount.toLocaleString()}`;
  const newLabel = `${resolveExpenseCategoryLabel(updated)} · ${resolveExpenseDisplayScope(updated, state.units)} · ₦${updated.amount.toLocaleString()}`;

  const auditEntry: AuditLogEntry = {
    id: makeId('aud'),
    timestamp: new Date().toISOString(),
    actor: state.property.managerName,
    entityType: 'Expense',
    entityId: existing.id,
    action: 'Expense Updated',
    summary: `Updated expense "${updated.description}" (${resolveExpenseCategoryLabel(updated)} · ${updated.scopeLabel}${updated.isNonPropertyOutgoing ? ' · Non-Property Purse' : ''}).`,
    previousValue: prevLabel,
    newValue: newLabel,
  };

  return {
    ok: true,
    state: {
      ...state,
      expenses: state.expenses.map((e) => (e.id === expenseId ? updated : e)),
      auditLogs: [auditEntry, ...state.auditLogs],
    },
  };
}

export interface MaintenanceMutationInput {
  scopeSelectionKey: string;
  customScope?: string;
  issue: string;
  dateReported: string;
  status: MaintenanceRecord['status'];
  assignedTo: string;
  estimatedOrActualCost: number;
  resolutionDetails?: string;
  resolvedDate?: string;
  alsoRecordExpense?: boolean;
  expensePaymentMethod?: PaymentMethod;
  expenseReference?: string;
}

export function applyRecordMaintenanceWithOptionalExpense(
  state: RentalAppState,
  input: MaintenanceMutationInput,
  makeId: (prefix: string) => string
): {
  ok: boolean;
  error?: string;
  state: RentalAppState;
  maintenance?: MaintenanceRecord;
  expense?: PropertyExpense;
} {
  if (!input.issue.trim()) {
    return { ok: false, error: 'Please describe the maintenance issue or activity.', state };
  }
  const cost = Math.max(0, Number(input.estimatedOrActualCost) || 0);
  const scopeRes = resolveScopeSelection({
    selectionKey: input.scopeSelectionKey,
    customScope: input.customScope,
    units: state.units,
  });
  if (!scopeRes.ok) {
    return { ok: false, error: scopeRes.error, state };
  }

  const mntId = makeId('mnt');
  const shouldCreateExpense = Boolean(input.alsoRecordExpense) && cost > 0;
  const expId = shouldCreateExpense ? makeId('exp') : undefined;
  const dateReported = input.dateReported.trim() || state.referenceDate;
  const vendorName = input.assignedTo.trim() || 'Pending Assignment';

  const maintenance: MaintenanceRecord = {
    id: mntId,
    unitId: scopeRes.unitId,
    scopeCategory: scopeRes.scopeCategory,
    scopeLabel: scopeRes.scopeLabel,
    issue: input.issue.trim(),
    dateReported,
    status: input.status,
    assignedTo: vendorName,
    estimatedOrActualCost: Math.round(cost * 100) / 100,
    resolutionDetails: input.resolutionDetails?.trim() || undefined,
    resolvedDate:
      input.status === 'Resolved' ? input.resolvedDate?.trim() || dateReported : undefined,
    linkedExpenseId: expId,
  };

  let createdExpense: PropertyExpense | undefined;
  const nextAuditLogs: AuditLogEntry[] = [
    {
      id: makeId('aud'),
      timestamp: new Date().toISOString(),
      actor: state.property.managerName,
      entityType: 'Maintenance',
      entityId: mntId,
      action: 'Maintenance Logged',
      summary: `Logged maintenance (${scopeRes.scopeLabel}): "${maintenance.issue}" assigned to ${maintenance.assignedTo}.`,
      newValue: `${maintenance.status} · ₦${maintenance.estimatedOrActualCost.toLocaleString()}`,
    },
  ];

  if (shouldCreateExpense && expId) {
    createdExpense = {
      id: expId,
      date: maintenance.resolvedDate || dateReported,
      amount: maintenance.estimatedOrActualCost,
      category: 'Repairs',
      scopeCategory: scopeRes.scopeCategory,
      scopeLabel: scopeRes.scopeLabel,
      unitId: scopeRes.unitId,
      isNonPropertyOutgoing: false,
      linkedMaintenanceId: mntId,
      description: `${maintenance.issue} (${scopeRes.scopeLabel})`,
      vendor: vendorName,
      paymentMethod: input.expensePaymentMethod || 'Cash',
      reference: input.expenseReference?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    nextAuditLogs.unshift({
      id: makeId('aud'),
      timestamp: new Date().toISOString(),
      actor: state.property.managerName,
      entityType: 'Expense',
      entityId: expId,
      action: 'Expense Recorded (From Maintenance)',
      summary: `Posted ₦${createdExpense.amount.toLocaleString()} Repairs expense for ${scopeRes.scopeLabel} from maintenance ticket.`,
      newValue: `${createdExpense.description} · ₦${createdExpense.amount.toLocaleString()}`,
    });
  }

  return {
    ok: true,
    maintenance,
    expense: createdExpense,
    state: {
      ...state,
      maintenance: [maintenance, ...state.maintenance],
      expenses: createdExpense ? [createdExpense, ...state.expenses] : state.expenses,
      auditLogs: [...nextAuditLogs, ...state.auditLogs],
    },
  };
}

export function applyEditMaintenance(
  state: RentalAppState,
  maintenanceId: string,
  input: MaintenanceMutationInput,
  makeId: (prefix: string) => string
): { ok: boolean; error?: string; state: RentalAppState } {
  const existing = state.maintenance.find((m) => m.id === maintenanceId);
  if (!existing) {
    return { ok: false, error: 'Maintenance record not found.', state };
  }
  if (!input.issue.trim()) {
    return { ok: false, error: 'Please describe the maintenance issue or activity.', state };
  }

  const scopeRes = resolveScopeSelection({
    selectionKey: input.scopeSelectionKey,
    customScope: input.customScope,
    units: state.units,
  });
  if (!scopeRes.ok) {
    return { ok: false, error: scopeRes.error, state };
  }

  const cost = Math.max(0, Number(input.estimatedOrActualCost) || 0);
  const shouldCreateExpense =
    Boolean(input.alsoRecordExpense) && cost > 0 && !existing.linkedExpenseId;
  const newExpId = shouldCreateExpense ? makeId('exp') : existing.linkedExpenseId;
  const vendorName = input.assignedTo.trim() || 'Pending Assignment';
  const resolvedDate =
    input.status === 'Resolved'
      ? input.resolvedDate?.trim() || existing.resolvedDate || state.referenceDate
      : undefined;

  const updated: MaintenanceRecord = {
    ...existing,
    unitId: scopeRes.unitId,
    scopeCategory: scopeRes.scopeCategory,
    scopeLabel: scopeRes.scopeLabel,
    issue: input.issue.trim(),
    dateReported: input.dateReported.trim() || existing.dateReported,
    status: input.status,
    assignedTo: vendorName,
    estimatedOrActualCost: Math.round(cost * 100) / 100,
    resolutionDetails: input.resolutionDetails?.trim() || undefined,
    resolvedDate,
    linkedExpenseId: newExpId,
  };

  let createdExpense: PropertyExpense | undefined;
  const nextAuditLogs: AuditLogEntry[] = [
    {
      id: makeId('aud'),
      timestamp: new Date().toISOString(),
      actor: state.property.managerName,
      entityType: 'Maintenance',
      entityId: existing.id,
      action: 'Maintenance Updated',
      summary: `Updated maintenance (${scopeRes.scopeLabel}): "${updated.issue}" (${updated.status}).`,
      previousValue: `${existing.scopeLabel || (existing.unitId ? 'Unit' : 'Common Property')} · ${existing.status} · ₦${existing.estimatedOrActualCost.toLocaleString()}`,
      newValue: `${scopeRes.scopeLabel} · ${updated.status} · ₦${updated.estimatedOrActualCost.toLocaleString()}`,
    },
  ];

  if (shouldCreateExpense && newExpId) {
    createdExpense = {
      id: newExpId,
      date: resolvedDate || updated.dateReported,
      amount: updated.estimatedOrActualCost,
      category: 'Repairs',
      scopeCategory: scopeRes.scopeCategory,
      scopeLabel: scopeRes.scopeLabel,
      unitId: scopeRes.unitId,
      isNonPropertyOutgoing: false,
      linkedMaintenanceId: existing.id,
      description: `${updated.issue} (${scopeRes.scopeLabel})`,
      vendor: vendorName,
      paymentMethod: input.expensePaymentMethod || 'Cash',
      reference: input.expenseReference?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    nextAuditLogs.unshift({
      id: makeId('aud'),
      timestamp: new Date().toISOString(),
      actor: state.property.managerName,
      entityType: 'Expense',
      entityId: newExpId,
      action: 'Expense Recorded (From Maintenance)',
      summary: `Posted ₦${createdExpense.amount.toLocaleString()} Repairs expense for ${scopeRes.scopeLabel} from maintenance ticket.`,
      newValue: `${createdExpense.description} · ₦${createdExpense.amount.toLocaleString()}`,
    });
  }

  return {
    ok: true,
    state: {
      ...state,
      maintenance: state.maintenance.map((m) => (m.id === maintenanceId ? updated : m)),
      expenses: createdExpense ? [createdExpense, ...state.expenses] : state.expenses,
      auditLogs: [...nextAuditLogs, ...state.auditLogs],
    },
  };
}
