import assert from 'node:assert/strict';
import test from 'node:test';
import { SEED_STATE } from '../data/seedData';
import {
  applyTenantDelete,
  applyTenantEdit,
  applyUnitDelete,
  applyUnitEditAndOccupant,
  getTenantDeletionImpact,
  getUnitDeletionImpact,
} from './portfolioEdits';

function makeDeterministicIdGen() {
  let seq = 1;
  return (prefix: string) => `${prefix}-test-${seq++}`;
}

test('applyTenantEdit updates profile details and reassigns unit occupancy cleanly', () => {
  const firstTenant = SEED_STATE.tenants[0];
  const initialActiveAg = SEED_STATE.agreements.find(
    (a) => a.tenantId === firstTenant.id && (a.status === 'Active' || a.status === 'Draft')
  );
  assert.ok(initialActiveAg, 'Expected first seed tenant to have an active agreement');

  const vacantUnit = {
    id: 'u-vacant-test',
    code: 'T-99',
    name: 'Test Flat 99',
    type: 'Bedroom' as const,
    floorOrWing: 'First Floor',
    occupancyStatus: 'Vacant' as const,
  };

  const stateWithVacant = {
    ...SEED_STATE,
    units: [...SEED_STATE.units, vacantUnit],
  };

  const res = applyTenantEdit(
    stateWithVacant,
    firstTenant.id,
    {
      firstName: 'Olufemi',
      lastName: firstTenant.lastName,
      phone: '+234 809 000 1111',
      email: 'olufemi.updated@example.com',
      historicalLateCycles: 3,
      notes: 'Adjusted unit during cleanup',
      occupancyMode: 'assign',
      unitId: vacantUnit.id,
      agreedRent: 95000,
      securityLevy: 5000,
      dueDate: '2026-12-15',
    },
    makeDeterministicIdGen()
  );

  assert.equal(res.ok, true);
  assert.ok(res.state);

  const editedTenant = res.state.tenants.find((t) => t.id === firstTenant.id);
  assert.equal(editedTenant?.firstName, 'Olufemi');
  assert.equal(editedTenant?.phone, '+234 809 000 1111');
  assert.equal(editedTenant?.historicalLateCycles, 3);
  assert.equal(editedTenant?.createdAt, firstTenant.createdAt);

  const oldUnit = res.state.units.find((u) => u.id === initialActiveAg.unitId);
  const newUnit = res.state.units.find((u) => u.id === vacantUnit.id);
  assert.equal(oldUnit?.occupancyStatus, 'Vacant');
  assert.equal(newUnit?.occupancyStatus, 'Occupied');

  const updatedAg = res.state.agreements.find((a) => a.id === initialActiveAg.id);
  assert.equal(updatedAg?.unitId, vacantUnit.id);
  assert.equal(updatedAg?.agreedRent, 95000);
  assert.equal(updatedAg?.securityLevy, 5000);

  const linkedObs = res.state.obligations.filter((o) => o.agreementId === initialActiveAg.id);
  assert.ok(linkedObs.length >= 1);
  assert.equal(linkedObs.every((o) => o.unitId === vacantUnit.id), true);
  assert.equal(res.state.auditLogs[0].action, 'Tenant Updated');
});

test('applyTenantEdit guards against reassigning onto an occupied unit unless replaceExistingOccupant is enabled', () => {
  const tenantA = SEED_STATE.tenants[0];
  const tenantB = SEED_STATE.tenants[1];
  const agB = SEED_STATE.agreements.find((a) => a.tenantId === tenantB.id && a.status === 'Active');
  assert.ok(agB);

  const blocked = applyTenantEdit(SEED_STATE, tenantA.id, {
    firstName: tenantA.firstName,
    lastName: tenantA.lastName,
    phone: tenantA.phone,
    email: tenantA.email,
    occupancyMode: 'assign',
    unitId: agB.unitId,
    agreedRent: 80000,
    replaceExistingOccupant: false,
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error || '', /currently occupied/i);

  const replaced = applyTenantEdit(
    SEED_STATE,
    tenantA.id,
    {
      firstName: tenantA.firstName,
      lastName: tenantA.lastName,
      phone: tenantA.phone,
      email: tenantA.email,
      occupancyMode: 'assign',
      unitId: agB.unitId,
      agreedRent: 80000,
      replaceExistingOccupant: true,
    },
    makeDeterministicIdGen()
  );
  assert.equal(replaced.ok, true);
  assert.equal(replaced.state?.agreements.find((a) => a.id === agB.id)?.status, 'Terminated');
});

test('applyTenantDelete removes tenant, cascades dependents, and frees occupied unit', () => {
  const target = SEED_STATE.tenants[0];
  const impact = getTenantDeletionImpact(SEED_STATE, target.id);
  assert.ok(impact);
  assert.ok(impact.agreementsCount >= 1);

  const activeUnitIds = SEED_STATE.agreements
    .filter((a) => a.tenantId === target.id && (a.status === 'Active' || a.status === 'Draft'))
    .map((a) => a.unitId);

  const res = applyTenantDelete(SEED_STATE, target.id, makeDeterministicIdGen());
  assert.equal(res.ok, true);
  assert.ok(res.state);
  assert.equal(res.state.tenants.some((t) => t.id === target.id), false);
  assert.equal(res.state.agreements.some((a) => a.tenantId === target.id), false);
  assert.equal(res.state.obligations.some((o) => o.tenantId === target.id), false);
  assert.equal(res.state.payments.some((p) => p.tenantId === target.id), false);
  assert.equal(res.state.receiptRequests.some((r) => r.tenantId === target.id), false);

  for (const uid of activeUnitIds) {
    assert.equal(res.state.units.find((u) => u.id === uid)?.occupancyStatus, 'Vacant');
  }
  assert.equal(res.state.auditLogs[0].action, 'Tenant Deleted');
});

test('applyUnitEditAndOccupant updates unit fields, creates or swaps occupant, and vacates cleanly', () => {
  const unit = SEED_STATE.units[0];

  // Duplicate code check
  const otherUnit = SEED_STATE.units[1];
  const dupRes = applyUnitEditAndOccupant(SEED_STATE, unit.id, {
    code: otherUnit.code,
    name: unit.name,
    type: unit.type,
    floorOrWing: unit.floorOrWing,
    occupancyStatus: unit.occupancyStatus,
  });
  assert.equal(dupRes.ok, false);

  // Assign a brand new occupant directly on Units tab
  const assignRes = applyUnitEditAndOccupant(
    SEED_STATE,
    unit.id,
    {
      code: `${unit.code}-A`,
      name: 'Renovated Suite A',
      type: 'Room & Parlour',
      floorOrWing: 'Second Floor',
      occupancyStatus: 'Occupied',
      occupantMode: 'new-tenant',
      newTenant: {
        firstName: 'Tunde',
        lastName: 'Bakare',
        phone: '+234 802 555 0199',
        email: 'tunde.bakare@example.com',
      },
      agreedRent: 240000,
      securityLevy: 6000,
      startDate: '2026-11-18',
      endDate: '2027-11-17',
      dueDate: '2026-11-18',
    },
    makeDeterministicIdGen()
  );
  assert.equal(assignRes.ok, true);
  assert.ok(assignRes.state);
  const editedUnit = assignRes.state.units.find((u) => u.id === unit.id);
  assert.equal(editedUnit?.code, `${unit.code}-A`);
  assert.equal(editedUnit?.name, 'Renovated Suite A');
  assert.equal(editedUnit?.occupancyStatus, 'Occupied');

  const newOccupant = assignRes.state.tenants.find((t) => t.firstName === 'Tunde' && t.lastName === 'Bakare');
  assert.ok(newOccupant);
  assert.equal(
    assignRes.state.agreements.filter((a) => a.unitId === unit.id && a.status === 'Active').length,
    1
  );

  // Now vacate unit
  const vacateRes = applyUnitEditAndOccupant(
    assignRes.state,
    unit.id,
    {
      code: `${unit.code}-A`,
      name: 'Renovated Suite A',
      type: 'Room & Parlour',
      floorOrWing: 'Second Floor',
      occupancyStatus: 'Vacant',
      occupantMode: 'vacate',
    },
    makeDeterministicIdGen()
  );
  assert.equal(vacateRes.ok, true);
  assert.equal(vacateRes.state?.units.find((u) => u.id === unit.id)?.occupancyStatus, 'Vacant');
  assert.equal(
    vacateRes.state?.agreements.some((a) => a.unitId === unit.id && a.status === 'Active'),
    false
  );
});

test('applyUnitDelete removes unit and cascades leases while preserving maintenance cost history', () => {
  const unit = SEED_STATE.units[0];
  const stateWithMaint = {
    ...SEED_STATE,
    maintenance: [
      ...SEED_STATE.maintenance,
      {
        id: 'm-unit-test',
        unitId: unit.id,
        issue: 'Roof leak',
        dateReported: '2026-10-01',
        status: 'Open' as const,
        assignedTo: 'Artisan',
        estimatedOrActualCost: 15000,
      },
    ],
  };

  const impact = getUnitDeletionImpact(stateWithMaint, unit.id);
  assert.ok(impact);
  assert.equal(impact.maintenanceCount >= 1, true);

  const res = applyUnitDelete(stateWithMaint, unit.id, makeDeterministicIdGen());
  assert.equal(res.ok, true);
  assert.ok(res.state);
  assert.equal(res.state.units.some((u) => u.id === unit.id), false);
  assert.equal(res.state.agreements.some((a) => a.unitId === unit.id), false);
  const keptMaint = res.state.maintenance.find((m) => m.id === 'm-unit-test');
  assert.ok(keptMaint);
  assert.equal(keptMaint.unitId, undefined);
});
