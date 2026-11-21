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

test('search filters match tenant aliases across home, shop, and kiosk units', () => {
  const customUnits = [
    ...SEED_STATE.units,
    {
      id: 'u-kiosk-test',
      code: 'K-09',
      name: 'Gate Kiosk 09',
      type: 'Kiosk' as const,
      floorOrWing: 'Front Gate',
      occupancyStatus: 'Occupied' as const,
    },
  ];
  const customTenants = [
    ...SEED_STATE.tenants,
    {
      id: 't-kiosk-test',
      firstName: '',
      lastName: '',
      alias: 'Mama T',
      phone: '',
      email: '',
      historicalLateCycles: 0,
      notificationsPaused: false,
      archived: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];
  const customAgreements = [
    ...SEED_STATE.agreements,
    {
      id: 'ag-kiosk-test',
      tenantId: 't-kiosk-test',
      unitId: 'u-kiosk-test',
      rentCycle: 'Yearly' as const,
      agreedRent: 50000,
      securityLevy: 4000,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      dueDate: '2026-01-01',
      status: 'Active' as const,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  const matchedTenants = filterTenantsByQuery(customTenants, customAgreements, customUnits, 'mama t');
  assert.equal(matchedTenants.length, 1);
  assert.equal(matchedTenants[0].id, 't-kiosk-test');

  const matchedUnits = filterUnitsByQuery(customUnits, customAgreements, customTenants, 'mama t');
  assert.equal(matchedUnits.length, 1);
  assert.equal(matchedUnits[0].code, 'K-09');

  const matchedAgs = filterAgreementsByQuery(customAgreements, customUnits, customTenants, 'mama t');
  assert.equal(matchedAgs.length, 1);
  assert.equal(matchedAgs[0].id, 'ag-kiosk-test');
});
