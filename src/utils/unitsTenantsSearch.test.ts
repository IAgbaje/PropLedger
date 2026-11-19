import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_STATE } from '../data/seedData';
import {
  filterAgreementsByQuery,
  filterTenantsByQuery,
  filterUnitsByQuery,
} from './unitsTenantsSearch';

test('filterTenantsByQuery matches both tenant names and unit numbers', () => {
  const { tenants, agreements, units } = SEED_STATE;

  const byName = filterTenantsByQuery(tenants, agreements, units, 'Sheikh');
  assert.equal(byName.length, 1);
  assert.equal(byName[0].firstName, 'Sheikh');

  const byUnitCode = filterTenantsByQuery(tenants, agreements, units, 'R&P-3');
  assert.equal(byUnitCode.length, 1);
  assert.equal(byUnitCode[0].firstName, 'Sheikh');

  const byUnitCodeShop = filterTenantsByQuery(tenants, agreements, units, 'Shop 03');
  assert.equal(byUnitCodeShop.length, 1);
  assert.equal(byUnitCodeShop[0].lastName, 'Lawal');

  const all = filterTenantsByQuery(tenants, agreements, units, '   ');
  assert.equal(all.length, tenants.length);
});

test('filterUnitsByQuery matches both unit numbers and occupant tenant names', () => {
  const { tenants, agreements, units } = SEED_STATE;

  const byUnitCode = filterUnitsByQuery(units, agreements, tenants, 'POS shop');
  assert.equal(byUnitCode.length, 1);
  assert.equal(byUnitCode[0].code, 'POS shop');

  const byTenantName = filterUnitsByQuery(units, agreements, tenants, 'Mrs Samuel Amusa');
  assert.equal(byTenantName.length, 1);
  assert.equal(byTenantName[0].code, 'POS shop');

  const containerByCode = filterUnitsByQuery(units, agreements, tenants, 'Container-05');
  assert.equal(containerByCode.length, 1);
  assert.equal(containerByCode[0].type, 'Container Shop');
});

test('filterAgreementsByQuery matches unit code and tenant name', () => {
  const { tenants, agreements, units } = SEED_STATE;
  const unitRoom1 = units.find((u) => u.code === 'Room 1')!;
  const tenantKayode = tenants.find((t) => t.firstName === 'Kayode')!;

  const byUnit = filterAgreementsByQuery(agreements, units, tenants, 'Room 1');
  assert.ok(byUnit.length >= 1);
  assert.ok(byUnit.every((a) => a.unitId === unitRoom1.id));

  const byTenant = filterAgreementsByQuery(agreements, units, tenants, 'Kayode');
  assert.ok(byTenant.length >= 1);
  assert.ok(byTenant.every((a) => a.tenantId === tenantKayode.id));
});
