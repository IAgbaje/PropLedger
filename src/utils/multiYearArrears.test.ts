import test from 'node:test';
import assert from 'node:assert/strict';
import type { RentalObligation } from '../types/rental';
import { computeObligation } from './rentalEngine';
import {
  analyzeTenantArrears,
  buildMonthlyCollectionsSeries,
  buildPropertyTypeContribution,
} from './multiYearArrears';

test('analyzeTenantArrears flags multi-year debtors and separates rent vs security levy dues', () => {
  const obs: RentalObligation[] = [
    {
      id: 'ob-2025',
      agreementId: 'ag-1',
      tenantId: 't-sheikh',
      unitId: 'u-rp3',
      chargeType: 'Rent',
      rentalPeriodLabel: '2025 Annual Rent',
      originalAmount: 85000,
      dueDate: '2025-01-31',
      underReview: false,
      createdAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'ob-2026',
      agreementId: 'ag-1',
      tenantId: 't-sheikh',
      unitId: 'u-rp3',
      chargeType: 'Rent',
      rentalPeriodLabel: '2026 Annual Rent',
      originalAmount: 85000,
      dueDate: '2026-01-31',
      underReview: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ob-levy',
      agreementId: 'ag-1',
      tenantId: 't-sheikh',
      unitId: 'u-rp3',
      chargeType: 'Security Levy',
      rentalPeriodLabel: '2025 & 2026 Security Levy',
      originalAmount: 8000,
      dueDate: '2025-01-31',
      underReview: false,
      createdAt: '2025-01-01T00:00:00Z',
    },
  ];

  const computed = obs.map((o) => computeObligation(o, [], '2026-11-18', 7));
  const profile = analyzeTenantArrears('t-sheikh', computed);

  assert.equal(profile.isMultiYear, true);
  assert.equal(profile.hasMultipleDues, true);
  assert.equal(profile.hasUnpaidSecurityLevy, true);
  assert.deepEqual(profile.unpaidYears, ['2025', '2026']);
  assert.equal(profile.unpaidRentAmount, 170000);
  assert.equal(profile.unpaidLevyAmount, 8000);
  assert.equal(profile.totalOutstanding, 178000);
  assert.equal(profile.tier, 'Multi-Year Debtor');
});

test('analyzeTenantArrears identifies single-year Rent + Security Levy as Multiple Dues', () => {
  const obs: RentalObligation[] = [
    {
      id: 'ob-r',
      agreementId: 'ag-2',
      tenantId: 't-kayode',
      unitId: 'u-2',
      chargeType: 'Rent',
      rentalPeriodLabel: '2026 Annual Rent',
      originalAmount: 120000,
      dueDate: '2026-01-31',
      underReview: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ob-l',
      agreementId: 'ag-2',
      tenantId: 't-kayode',
      unitId: 'u-2',
      chargeType: 'Security Levy',
      rentalPeriodLabel: '2026 Security Levy',
      originalAmount: 4000,
      dueDate: '2026-01-31',
      underReview: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  const computed = obs.map((o) => computeObligation(o, [], '2026-11-18', 7));
  const profile = analyzeTenantArrears('t-kayode', computed);

  assert.equal(profile.isMultiYear, false);
  assert.equal(profile.hasMultipleDues, true);
  assert.equal(profile.totalOutstanding, 124000);
  assert.equal(profile.tier, 'Multiple Dues (Rent + Levy)');
});

test('chart aggregators compute monthly rent collections and Shops vs Apartments contribution accurately', () => {
  const series = buildMonthlyCollectionsSeries([
    {
      id: 'p1',
      systemRef: 'PAY-1',
      tenantId: 't1',
      agreementId: 'a1',
      unitId: 'u1',
      amount: 60000,
      dateReceived: '2026-01-21',
      dateRecorded: '2026-01-21T10:00:00Z',
      method: 'Bank Transfer',
      bankReference: 'R1',
      status: 'Confirmed',
      allocations: [],
      unappliedAmount: 0,
      notes: '',
      recordedBy: 'Ibraheem Agbaje',
    },
    {
      id: 'p2',
      systemRef: 'PAY-2',
      tenantId: 't2',
      agreementId: 'a2',
      unitId: 'u2',
      amount: 120000,
      dateReceived: '2026-01-25',
      dateRecorded: '2026-01-25T10:00:00Z',
      method: 'Bank Transfer',
      bankReference: 'R2',
      status: 'Confirmed',
      allocations: [],
      unappliedAmount: 0,
      notes: '',
      recordedBy: 'Ibraheem Agbaje',
    },
  ]);

  assert.equal(series.length, 1);
  assert.equal(series[0].amount, 180000);
  assert.equal(series[0].count, 2);

  const contrib = buildPropertyTypeContribution(
    [
      { id: 'u1', code: 'Room 1', name: 'Room 1', type: 'Room', floorOrWing: 'Main', occupancyStatus: 'Occupied' },
      { id: 'u2', code: 'Shop 01', name: 'Shop 01', type: 'Shop', floorOrWing: 'Frontage', occupancyStatus: 'Occupied' },
    ],
    []
  );
  assert.equal(contrib[0].segment, 'Apartments & Rooms');
  assert.equal(contrib[0].unitCount, 1);
  assert.equal(contrib[1].segment, 'Shops, Kiosks & Containers');
  assert.equal(contrib[1].unitCount, 1);
});

test('analyzeTenantArrears separates Rent, Security Levy, and custom Other Charge obligations distinctly', () => {
  const obs: RentalObligation[] = [
    {
      id: 'ob-rent-only',
      agreementId: 'ag-9',
      tenantId: 't-sep',
      unitId: 'u-9',
      chargeType: 'Rent',
      rentalPeriodLabel: '2026 Annual Rent',
      originalAmount: 60000,
      dueDate: '2026-01-31',
      underReview: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ob-levy-only',
      agreementId: 'ag-9',
      tenantId: 't-sep',
      unitId: 'u-9',
      chargeType: 'Security Levy',
      rentalPeriodLabel: '2026 Security Levy',
      originalAmount: 4000,
      dueDate: '2026-01-31',
      underReview: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ob-custom',
      agreementId: 'ag-9',
      tenantId: 't-sep',
      unitId: 'u-9',
      chargeType: 'Other Charge',
      categoryLabel: 'Borehole & Sanitation',
      rentalPeriodLabel: '2026 Borehole & Sanitation',
      originalAmount: 5000,
      dueDate: '2026-01-31',
      underReview: false,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];
  // Suppose Rent is fully paid (₦60k), while Security Levy & Borehole remain unpaid
  const computed = obs.map((o) =>
    computeObligation(
      o,
      [
        {
          id: 'p-rent',
          systemRef: 'PAY-SEP-1',
          tenantId: 't-sep',
          agreementId: 'ag-9',
          unitId: 'u-9',
          amount: 60000,
          dateReceived: '2026-01-20',
          dateRecorded: '2026-01-20T10:00:00Z',
          method: 'Bank Transfer',
          bankReference: 'REF-1',
          status: 'Confirmed',
          allocations: [{ obligationId: 'ob-rent-only', amount: 60000 }],
          unappliedAmount: 0,
          notes: '',
          recordedBy: 'Manager',
        },
      ],
      '2026-11-18',
      7
    )
  );
  const profile = analyzeTenantArrears('t-sep', computed);
  assert.equal(profile.unpaidRentAmount, 0);
  assert.equal(profile.unpaidLevyAmount, 4000);
  assert.equal(profile.unpaidOtherAmount, 5000);
  assert.equal(profile.unpaidOtherCycles.length, 1);
  assert.equal(profile.unpaidOtherCycles[0].categoryLabel, 'Borehole & Sanitation');
  assert.equal(profile.hasUnpaidSecurityLevy, true);
  assert.equal(profile.totalOutstanding, 9000);
});

