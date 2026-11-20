import assert from 'node:assert/strict';
import test from 'node:test';
import { SEED_STATE } from '../data/seedData';
import type { PropertyExpense } from '../types/rental';
import {
  applyEditExpense,
  applyEditMaintenance,
  applyRecordMaintenanceWithOptionalExpense,
  buildValidatedExpenseFields,
  computeExpenseBreakdown,
  getScopeSelectorState,
  hydrateLegacyExpense,
  hydrateLegacyMaintenance,
  OTHER_SCOPE_KEY,
  resolveExpenseCategoryLabel,
  resolveScopeSelection,
} from './expensesMaintenance';

let idCounter = 0;
const makeId = (prefix: string) => `${prefix}-test-${++idCounter}`;

test('resolveScopeSelection handles shared compound presets, units, and custom Other scopes', () => {
  const compound = resolveScopeSelection({
    selectionKey: 'Soakaway & Drainage',
    units: SEED_STATE.units,
  });
  assert.equal(compound.ok, true);
  assert.equal(compound.scopeCategory, 'Common Area');
  assert.equal(compound.scopeLabel, 'Soakaway & Drainage');
  assert.equal(compound.unitId, undefined);

  const unitRes = resolveScopeSelection({
    selectionKey: 'UNIT:u-1',
    units: SEED_STATE.units,
  });
  assert.equal(unitRes.ok, true);
  assert.equal(unitRes.scopeCategory, 'Unit');
  assert.equal(unitRes.unitId, 'u-1');
  assert.match(unitRes.scopeLabel, /Room 1/);

  const missingCustom = resolveScopeSelection({
    selectionKey: OTHER_SCOPE_KEY,
    customScope: '   ',
    units: SEED_STATE.units,
  });
  assert.equal(missingCustom.ok, false);

  const validCustom = resolveScopeSelection({
    selectionKey: OTHER_SCOPE_KEY,
    customScope: 'Generator House & Back Gate',
    units: SEED_STATE.units,
  });
  assert.equal(validCustom.ok, true);
  assert.equal(validCustom.scopeCategory, 'Other');
  assert.equal(validCustom.scopeLabel, 'Generator House & Back Gate');
});

test('getScopeSelectorState maps Unit, Preset, and Other records accurately for editing', () => {
  const unitState = getScopeSelectorState({ unitId: 'u-12' }, SEED_STATE.units);
  assert.equal(unitState.selectionKey, 'UNIT:u-12');
  assert.equal(unitState.customScope, '');

  const presetState = getScopeSelectorState(
    { scopeCategory: 'Common Area', scopeLabel: "Shared Tenants' Toilet" },
    SEED_STATE.units
  );
  assert.equal(presetState.selectionKey, "Shared Tenants' Toilet");
  assert.equal(presetState.customScope, '');

  const otherState = getScopeSelectorState(
    { scopeCategory: 'Other', scopeLabel: 'Security Post Shed' },
    SEED_STATE.units
  );
  assert.equal(otherState.selectionKey, OTHER_SCOPE_KEY);
  assert.equal(otherState.customScope, 'Security Post Shed');
});

test('buildValidatedExpenseFields requires purpose when category is Other and formats custom category label', () => {
  const missingPurpose = buildValidatedExpenseFields(
    {
      date: '2026-11-20',
      amount: 75000,
      category: 'Other',
      customCategoryLabel: '',
      isNonPropertyOutgoing: true,
      scopeSelectionKey: 'General Estate / Admin',
      description: 'Annual remembrance support',
      vendor: 'Agbaje Family',
    },
    SEED_STATE.units
  );
  assert.equal(missingPurpose.ok, false);

  const validOther = buildValidatedExpenseFields(
    {
      date: '2026-11-20',
      amount: 75000,
      category: 'Other',
      customCategoryLabel: 'Remembrance for Dad',
      isNonPropertyOutgoing: true,
      scopeSelectionKey: OTHER_SCOPE_KEY,
      customScope: 'Family / Owner Purse',
      description: '10-year remembrance contribution from property purse',
      vendor: 'Agbaje Family',
      paymentMethod: 'Bank Transfer',
      reference: 'REM-2026-01',
    },
    SEED_STATE.units
  );
  assert.equal(validOther.ok, true);
  assert.equal(validOther.fields?.customCategoryLabel, 'Remembrance for Dad');
  assert.equal(validOther.fields?.isNonPropertyOutgoing, true);
  assert.equal(validOther.fields?.scopeLabel, 'Family / Owner Purse');
  assert.equal(
    resolveExpenseCategoryLabel({
      id: 'x',
      createdAt: '2026-11-20T00:00:00Z',
      ...validOther.fields!,
    }),
    'Other · Remembrance for Dad'
  );
});

test('computeExpenseBreakdown separates Property Operating from Non-Property Purse outgoings', () => {
  const sample: PropertyExpense[] = [
    {
      id: 'e1',
      date: '2026-01-14',
      amount: 55000,
      category: 'Repairs',
      scopeCategory: 'Common Area',
      scopeLabel: 'Soakaway & Drainage',
      isNonPropertyOutgoing: false,
      description: 'Soakaway work',
      vendor: 'Ganiyu',
      createdAt: '2026-01-14T10:00:00Z',
    },
    {
      id: 'e2',
      date: '2026-08-22',
      amount: 100000,
      category: 'Other',
      customCategoryLabel: 'Remembrance for Dad',
      isNonPropertyOutgoing: true,
      scopeCategory: 'Other',
      scopeLabel: 'Property Purse (Non-Property)',
      description: 'Remembrance',
      vendor: 'Family',
      createdAt: '2026-08-22T10:00:00Z',
    },
  ];
  const breakdown = computeExpenseBreakdown(sample);
  assert.equal(breakdown.propertyOperatingTotal, 55000);
  assert.equal(breakdown.propertyOperatingCount, 1);
  assert.equal(breakdown.nonPropertyOutgoingTotal, 100000);
  assert.equal(breakdown.nonPropertyOutgoingCount, 1);
  assert.equal(breakdown.combinedTotal, 155000);
});

test('applyRecordMaintenanceWithOptionalExpense creates scoped maintenance and optionally links an Expense', () => {
  const withoutSync = applyRecordMaintenanceWithOptionalExpense(
    SEED_STATE,
    {
      scopeSelectionKey: "Shared Tenants' Toilet",
      issue: 'Replaced broken cistern & tap in shared tenants toilet',
      dateReported: '2026-11-18',
      status: 'Resolved',
      assignedTo: 'Kolawole Plumbing Works',
      estimatedOrActualCost: 22000,
      alsoRecordExpense: false,
    },
    makeId
  );
  assert.equal(withoutSync.ok, true);
  assert.equal(withoutSync.state.maintenance.length, SEED_STATE.maintenance.length + 1);
  assert.equal(withoutSync.state.expenses.length, SEED_STATE.expenses.length);
  assert.equal(withoutSync.maintenance?.scopeLabel, "Shared Tenants' Toilet");
  assert.equal(withoutSync.maintenance?.linkedExpenseId, undefined);

  const withSync = applyRecordMaintenanceWithOptionalExpense(
    SEED_STATE,
    {
      scopeSelectionKey: 'Compound Area / Exterior',
      issue: 'Security floodlight & compound wiring',
      dateReported: '2026-11-18',
      status: 'Resolved',
      assignedTo: 'Sadiq Electrical',
      estimatedOrActualCost: 35000,
      alsoRecordExpense: true,
      expensePaymentMethod: 'Bank Transfer',
      expenseReference: 'COMP-LIGHT-01',
    },
    makeId
  );
  assert.equal(withSync.ok, true);
  assert.equal(withSync.state.expenses.length, SEED_STATE.expenses.length + 1);
  assert.equal(withSync.maintenance?.linkedExpenseId, withSync.expense?.id);
  assert.equal(withSync.expense?.linkedMaintenanceId, withSync.maintenance?.id);
  assert.equal(withSync.expense?.scopeLabel, 'Compound Area / Exterior');
  assert.equal(withSync.expense?.category, 'Repairs');
});

test('applyEditExpense & applyEditMaintenance update existing records (including Resolved) and log audit trails', () => {
  const targetExp = SEED_STATE.expenses[0];
  const editedExpRes = applyEditExpense(
    SEED_STATE,
    targetExp.id,
    {
      date: '2025-11-29',
      amount: 210000,
      category: 'Other',
      customCategoryLabel: 'Donation from Purse',
      isNonPropertyOutgoing: true,
      scopeSelectionKey: OTHER_SCOPE_KEY,
      customScope: 'Charity & Estate Purse',
      description: 'Updated purse disbursement test',
      vendor: 'Community Foundation',
      paymentMethod: 'Bank Transfer',
      reference: 'DON-01',
    },
    makeId
  );
  assert.equal(editedExpRes.ok, true);
  const updatedExp = editedExpRes.state.expenses.find((e) => e.id === targetExp.id)!;
  assert.equal(updatedExp.amount, 210000);
  assert.equal(updatedExp.customCategoryLabel, 'Donation from Purse');
  assert.equal(updatedExp.isNonPropertyOutgoing, true);
  assert.equal(updatedExp.scopeLabel, 'Charity & Estate Purse');
  assert.equal(editedExpRes.state.auditLogs[0].action, 'Expense Updated');

  const resolvedMnt = SEED_STATE.maintenance.find((m) => m.status === 'Resolved')!;
  const editedMntRes = applyEditMaintenance(
    SEED_STATE,
    resolvedMnt.id,
    {
      scopeSelectionKey: 'Soakaway & Drainage',
      issue: 'Re-verified soakaway chamber & shared drain line',
      dateReported: resolvedMnt.dateReported,
      status: 'Resolved',
      assignedTo: resolvedMnt.assignedTo,
      estimatedOrActualCost: 360000,
      resolutionDetails: 'Added reinforcement collar verification.',
      alsoRecordExpense: false,
    },
    makeId
  );
  assert.equal(editedMntRes.ok, true);
  const updatedMnt = editedMntRes.state.maintenance.find((m) => m.id === resolvedMnt.id)!;
  assert.equal(updatedMnt.scopeLabel, 'Soakaway & Drainage');
  assert.equal(updatedMnt.estimatedOrActualCost, 360000);
  assert.equal(editedMntRes.state.auditLogs[0].action, 'Maintenance Updated');
});

test('hydrateLegacyExpense and hydrateLegacyMaintenance classify legacy seed records without overwriting user edits', () => {
  const familySeed = SEED_STATE.expenses.find((e) => e.id === 'exp-23')!;
  const hydratedFamily = hydrateLegacyExpense(familySeed, SEED_STATE.units);
  assert.equal(hydratedFamily.isNonPropertyOutgoing, true);
  assert.equal(hydratedFamily.customCategoryLabel, 'Family Support Disbursement');

  const soakawaySeed = SEED_STATE.expenses.find((e) => e.id === 'exp-5')!;
  const hydratedSoakaway = hydrateLegacyExpense(soakawaySeed, SEED_STATE.units);
  assert.equal(hydratedSoakaway.scopeLabel, 'Soakaway & Drainage');
  assert.equal(hydratedSoakaway.isNonPropertyOutgoing, undefined);

  const mntSeed = SEED_STATE.maintenance.find((m) => m.id === 'mnt-1')!;
  const hydratedMnt = hydrateLegacyMaintenance(mntSeed, SEED_STATE.units);
  assert.equal(hydratedMnt.scopeLabel, 'Soakaway & Drainage');
});
