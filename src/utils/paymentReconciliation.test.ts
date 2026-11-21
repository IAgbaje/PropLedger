import assert from 'node:assert/strict';
import test from 'node:test';
import { SEED_STATE } from '../data/seedData';
import { formatPaymentTimestamp } from './format';
import {
  applyCreateCycleObligation,
  applyPaymentEdit,
  deriveRentYearLabel,
  getEffectivePaymentRentYear,
  getObligationCategoryLabel,
  getObligationReconciliationPool,
  normalizeTimeReceived,
} from './paymentReconciliation';

let seq = 0;
const testIdGen = (prefix: string) => `${prefix}-test-${++seq}`;

test('normalizeTimeReceived validates 24-hour HH:mm and HH:mm:ss timestamps cleanly', () => {
  assert.deepEqual(normalizeTimeReceived(''), { ok: true, value: undefined });
  assert.deepEqual(normalizeTimeReceived('  '), { ok: true, value: undefined });
  assert.deepEqual(normalizeTimeReceived('9:05'), { ok: true, value: '09:05' });
  assert.deepEqual(normalizeTimeReceived('14:35:08'), { ok: true, value: '14:35:08' });
  assert.equal(normalizeTimeReceived('25:10').ok, false);
  assert.equal(normalizeTimeReceived('14:72').ok, false);
  assert.equal(normalizeTimeReceived('not-a-time').ok, false);
});

test('formatPaymentTimestamp formats date with optional bank time', () => {
  assert.equal(formatPaymentTimestamp('2025-10-01'), '01 Oct 2025');
  assert.equal(formatPaymentTimestamp('2025-10-01', '14:35'), '01 Oct 2025 · 14:35');
});

test('deriveRentYearLabel extracts single, dual-year, and multi-year labels accurately', () => {
  const year1 = deriveRentYearLabel(
    [{ obligationId: 'ob-1-2025', amount: 60000 }],
    SEED_STATE.obligations,
    '2025-10-02'
  );
  assert.equal(year1, '2025');

  const yearDual = deriveRentYearLabel(
    [{ obligationId: 'ob-7-2025', amount: 170000 }],
    SEED_STATE.obligations,
    '2025-10-01'
  );
  assert.equal(yearDual, '2025/2026');

  const unapplied = deriveRentYearLabel([], SEED_STATE.obligations, '2026-11-18');
  assert.equal(unapplied, '2026');
});

test('getObligationReconciliationPool preserves available capacity of already-settled obligations being edited', () => {
  // Akiba (t-7) has pay-2 (₦174,000) settling ob-7-2025 (₦170k) and ob-7-levy (₦4k)
  const pool = getObligationReconciliationPool(
    't-7',
    SEED_STATE.obligations,
    SEED_STATE.payments,
    SEED_STATE.referenceDate,
    SEED_STATE.settings.gracePeriodDays,
    'pay-2'
  );

  assert.equal(pool.length, 2);
  const rentItem = pool.find((i) => i.computed.obligation.id === 'ob-7-2025');
  assert.ok(rentItem);
  assert.equal(rentItem.currentPaymentAllocated, 170000);
  assert.equal(rentItem.allocatedByOthers, 0);
  assert.equal(rentItem.availableCapacity, 170000);
});

test('applyPaymentEdit updates exact date, timeReceived, bank reference, rentYearCovered, and notes', () => {
  const res = applyPaymentEdit(
    SEED_STATE,
    'pay-1',
    {
      tenantId: 't-1',
      agreementId: 'ag-1',
      amount: 64000,
      dateReceived: '2025-10-03',
      timeReceived: '16:42:15',
      method: 'Bank Transfer',
      bankReference: 'GTB-SHOL-2025-REV1',
      rentYearCovered: '2025',
      allocations: [
        { obligationId: 'ob-1-2025', amount: 60000 },
        { obligationId: 'ob-1-levy', amount: 4000 },
      ],
      notes: 'NIP/SHOLANKE OLAWALE/2025 RENT + LEVY FROM GTB STATEMENT',
      editReason: 'Matched exact bank alert timestamp from Oct 2025 statement',
    },
    testIdGen,
    '2026-11-20T12:00:00Z'
  );

  assert.equal(res.ok, true);
  if (!res.ok) return;

  const updated = res.nextState.payments.find((p) => p.id === 'pay-1');
  assert.ok(updated);
  assert.equal(updated.dateReceived, '2025-10-03');
  assert.equal(updated.timeReceived, '16:42:15');
  assert.equal(updated.bankReference, 'GTB-SHOL-2025-REV1');
  assert.equal(updated.rentYearCovered, '2025');
  assert.equal(updated.lastEditedAt, '2026-11-20T12:00:00Z');
  assert.equal(updated.notes, 'NIP/SHOLANKE OLAWALE/2025 RENT + LEVY FROM GTB STATEMENT');

  // Verify audit log recorded edit
  assert.equal(res.nextState.auditLogs[0].action, 'Payment Reconciled / Edited');
  assert.equal(res.nextState.auditLogs[0].entityId, 'pay-1');

  // Verify settledAt on ob-1-2025 synced to new payment date
  const ob = res.nextState.obligations.find((o) => o.id === 'ob-1-2025');
  assert.equal(ob?.settledAt, '2025-10-03');
});

test('applyPaymentEdit handles re-allocating a payment across rent years (2025 -> 2026) and appends commission delta without mutating old commissions', () => {
  // pay-2 (t-7, Akiba) originally accrued ₦17,000 commission on ob-7-2025 (₦170k rent).
  // Suppose during reconciliation we adjust pay-2 to ₦150,000 (₦146,000 Rent + ₦4,000 Levy)
  const res = applyPaymentEdit(
    SEED_STATE,
    'pay-2',
    {
      tenantId: 't-7',
      agreementId: 'ag-7',
      amount: 150000,
      dateReceived: '2025-10-01',
      timeReceived: '09:18',
      method: 'Bank Transfer',
      bankReference: 'AKB-RP1-202510',
      rentYearCovered: '2025/2026',
      allocations: [
        { obligationId: 'ob-7-2025', amount: 146000 },
        { obligationId: 'ob-7-levy', amount: 4000 },
      ],
      notes: 'Corrected tranche amount after bank statement reconciliation',
      editReason: 'Part tranche correction',
    },
    testIdGen,
    '2026-11-20T12:15:00Z'
  );

  assert.equal(res.ok, true);
  if (!res.ok) return;

  // Original comm-1 remains untouched; a new negative adjustment record is appended
  const oldComm = res.nextState.commissions.find((c) => c.id === 'comm-1');
  assert.equal(oldComm?.accruedAmount, 17000);
  const netCommForPay2 = res.nextState.commissions
    .filter((c) => c.paymentId === 'pay-2')
    .reduce((s, c) => s + c.accruedAmount, 0);
  assert.equal(netCommForPay2, 14600);

  // ob-7-2025 is no longer fully settled so settledAt is cleared
  const ob = res.nextState.obligations.find((o) => o.id === 'ob-7-2025');
  assert.equal(ob?.settledAt, undefined);
});

test('applyPaymentEdit blocks editing Reversed payments and rejects over-allocation', () => {
  const reversedState = {
    ...SEED_STATE,
    payments: SEED_STATE.payments.map((p) =>
      p.id === 'pay-1' ? { ...p, status: 'Reversed' as const, reversalReason: 'Test' } : p
    ),
  };

  const blocked = applyPaymentEdit(
    reversedState,
    'pay-1',
    {
      tenantId: 't-1',
      agreementId: 'ag-1',
      amount: 64000,
      dateReceived: '2025-10-02',
      method: 'Bank Transfer',
      bankReference: 'GTB-SHOL-2025',
      allocations: [],
      notes: '',
    },
    testIdGen
  );
  assert.equal(blocked.ok, false);

  const overAlloc = applyPaymentEdit(
    SEED_STATE,
    'pay-1',
    {
      tenantId: 't-1',
      agreementId: 'ag-1',
      amount: 50000,
      dateReceived: '2025-10-02',
      method: 'Bank Transfer',
      bankReference: 'GTB-SHOL-2025',
      allocations: [{ obligationId: 'ob-1-2025', amount: 60000 }],
      notes: '',
    },
    testIdGen
  );
  assert.equal(overAlloc.ok, false);
});

test('applyCreateCycleObligation creates a 2027 pre-cycle rent obligation for reconciliation and allows allocating to it', () => {
  // Akiba (t-7 / ag-7) paid 2025/2026 in Oct 2025; now creating 2027 Annual Rent + Levy due 30 Nov 2026
  const cycleRes = applyCreateCycleObligation(
    SEED_STATE,
    {
      agreementId: 'ag-7',
      cycleYear: '2027',
      rentalPeriodLabel: '2027 Annual Rent',
      rentAmount: 170000,
      levyAmount: 4000,
      dueDate: '2026-11-30',
    },
    testIdGen,
    '2026-11-20T12:20:00Z'
  );

  assert.equal(cycleRes.ok, true);
  if (!cycleRes.ok) return;
  assert.equal(cycleRes.createdObligationIds.length, 2);
  assert.ok(cycleRes.rentObligationId);

  const rentOb = cycleRes.nextState.obligations.find((o) => o.id === cycleRes.rentObligationId);
  assert.equal(rentOb?.rentalPeriodLabel, '2027 Annual Rent');
  assert.equal(rentOb?.originalAmount, 170000);

  // Duplicate cycle prevention
  const dupRes = applyCreateCycleObligation(
    cycleRes.nextState,
    {
      agreementId: 'ag-7',
      cycleYear: '2027',
      rentalPeriodLabel: '2027 Annual Rent',
      rentAmount: 170000,
      dueDate: '2026-11-30',
    },
    testIdGen
  );
  assert.equal(dupRes.ok, false);

  // Move pay-1 (Sholanke) from 2025 to 2026 or check effective rent year
  const sholankeYear = getEffectivePaymentRentYear(
    SEED_STATE.payments[0],
    SEED_STATE.obligations
  );
  assert.equal(sholankeYear, '2025');
});

test('applyCreateCycleObligation supports levy-only and custom category obligations with getObligationCategoryLabel', () => {
  const levyRes = applyCreateCycleObligation(
    SEED_STATE,
    {
      agreementId: 'ag-1',
      cycleYear: '2024',
      categoryMode: 'levy-only',
      levyAmount: 4000,
      dueDate: '2024-01-31',
    },
    testIdGen
  );
  assert.equal(levyRes.ok, true);
  if (!levyRes.ok) return;
  assert.equal(levyRes.createdObligationIds.length, 1);
  const levyOb = levyRes.nextState.obligations.find((o) => o.id === levyRes.createdObligationIds[0]);
  assert.ok(levyOb);
  assert.equal(levyOb.chargeType, 'Security Levy');
  assert.equal(getObligationCategoryLabel(levyOb), 'Security Levy');

  const customRes = applyCreateCycleObligation(
    levyRes.nextState,
    {
      agreementId: 'ag-1',
      cycleYear: '2026',
      categoryMode: 'custom',
      categoryId: 'cat-gen',
      categoryLabel: 'Generator Diesel Levy',
      commissionEligible: true,
      customAmount: 15000,
      dueDate: '2026-06-01',
    },
    testIdGen
  );
  assert.equal(customRes.ok, true);
  if (!customRes.ok) return;
  const customOb = customRes.nextState.obligations.find((o) => o.id === customRes.createdObligationIds[0]);
  assert.ok(customOb);
  assert.equal(customOb.chargeType, 'Other Charge');
  assert.equal(customOb.commissionEligible, true);
  assert.equal(getObligationCategoryLabel(customOb), 'Generator Diesel Levy');
});

