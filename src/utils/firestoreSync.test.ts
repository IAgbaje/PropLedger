import assert from 'node:assert/strict';
import test from 'node:test';
import { SEED_STATE } from '../data/seedData';
import {
  chunkItems,
  computeSubcollectionDiff,
  hasWorkspaceRootChanged,
  isValidFirestoreId,
  sanitizeEntityForFirestore,
  sanitizePropertyProfile,
  sanitizeSystemSettings,
  stripSyncMetadata,
  stripUndefined,
  WORKSPACE_SUBCOLLECTIONS,
} from './firestoreSync';

test('stripUndefined removes nested undefined keys while preserving valid falsy values', () => {
  const result = stripUndefined({
    id: 'u-1',
    notes: undefined,
    archived: false,
    count: 0,
    nested: { a: 1, b: undefined },
    list: [1, undefined, 2],
  });
  assert.deepEqual(result, {
    id: 'u-1',
    archived: false,
    count: 0,
    nested: { a: 1 },
    list: [1, 2],
  });
  assert.equal('notes' in result, false);
});

test('sanitizeEntityForFirestore clamps strings and attaches ownerUid + syncedAt across all SEED_STATE subcollections', () => {
  const ownerUid = 'user_abc_123';
  const marker = { __type: 'serverTimestamp' };

  for (const sub of WORKSPACE_SUBCOLLECTIONS) {
    const items = SEED_STATE[sub] as unknown as Array<Record<string, unknown>>;
    for (const item of items) {
      assert.equal(isValidFirestoreId(item.id), true, `Expected valid id on ${sub}:${String(item.id)}`);
      const sanitized = sanitizeEntityForFirestore(sub, item, ownerUid, marker);
      assert.equal(sanitized.ownerUid, ownerUid);
      assert.equal(sanitized.syncedAt, marker);
      assert.equal(sanitized.id, item.id);
      for (const value of Object.values(sanitized)) {
        assert.notEqual(value, undefined);
      }
      const roundTripped = stripSyncMetadata(sanitized);
      assert.equal('ownerUid' in roundTripped, false);
      assert.equal('syncedAt' in roundTripped, false);
    }
  }
});

test('sanitizeEntityForFirestore enforces blueprint volumetric limits on oversized inputs', () => {
  const longNote = 'x'.repeat(2500);
  const sanitizedPayment = sanitizeEntityForFirestore(
    'payments',
    {
      ...SEED_STATE.payments[0],
      notes: longNote,
      reversalReason: 'r'.repeat(800),
      allocations: Array.from({ length: 75 }, (_, i) => ({
        obligationId: `ob-${i}`,
        amount: 100,
      })),
    },
    'owner1',
    'TS'
  );
  assert.equal((sanitizedPayment.notes as string).length, 1000);
  assert.equal((sanitizedPayment.reversalReason as string).length, 300);
  assert.equal((sanitizedPayment.allocations as unknown[]).length, 50);

  const sanitizedProp = sanitizePropertyProfile({
    ...SEED_STATE.property,
    name: 'A'.repeat(300),
    address: 'B'.repeat(500),
  });
  assert.equal(sanitizedProp.name.length, 160);
  assert.equal(sanitizedProp.address.length, 300);

  const sanitizedSettings = sanitizeSystemSettings({
    ...SEED_STATE.settings,
    lawyerCommissionRatePercent: 150,
    receiptSlaHours: 0,
    preDueOffsetsDays: Array.from({ length: 30 }, (_, i) => i),
    customPaymentCategories: [
      { id: 'cat-1', label: 'A'.repeat(120), defaultAmount: 12000, commissionEligible: true, createdAt: '2026-01-01T00:00:00Z' },
    ],
  });
  assert.equal(sanitizedSettings.lawyerCommissionRatePercent, 100);
  assert.equal(sanitizedSettings.receiptSlaHours, 1);
  assert.equal(sanitizedSettings.preDueOffsetsDays.length, 20);
  assert.equal(sanitizedSettings.customPaymentCategories?.[0].label.length, 80);

  const sanitizedOb = sanitizeEntityForFirestore(
    'obligations',
    {
      ...SEED_STATE.obligations[0],
      chargeType: 'Other Charge',
      categoryId: 'cat-1',
      categoryLabel: 'C'.repeat(120),
      commissionEligible: true,
    },
    'owner1',
    'TS'
  );
  assert.equal((sanitizedOb.categoryLabel as string).length, 80);
  assert.equal(sanitizedOb.commissionEligible, true);
});

test('computeSubcollectionDiff identifies creates, updates, and deletes cleanly', () => {
  const prev = [
    { id: 'u-1', name: 'Room 1' },
    { id: 'u-2', name: 'Room 2' },
    { id: 'u-3', name: 'Room 3' },
  ];
  const next = [
    { id: 'u-1', name: 'Room 1' },
    { id: 'u-2', name: 'Room 2 Updated' },
    { id: 'u-4', name: 'Room 4' },
  ];
  const diff = computeSubcollectionDiff(prev, next);
  assert.deepEqual(
    diff.upserts.map((x) => x.id),
    ['u-2', 'u-4']
  );
  assert.deepEqual(diff.deletes, ['u-3']);
});

test('hasWorkspaceRootChanged detects property/settings/referenceDate mutations', () => {
  assert.equal(hasWorkspaceRootChanged(SEED_STATE, SEED_STATE), false);
  assert.equal(
    hasWorkspaceRootChanged(SEED_STATE, {
      ...SEED_STATE,
      property: { ...SEED_STATE.property, name: 'Updated Court' },
    }),
    true
  );
});

test('chunkItems splits large write sets under Firestore 500-op batch ceiling', () => {
  const items = Array.from({ length: 950 }, (_, i) => i);
  const chunks = chunkItems(items, 400);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 400);
  assert.equal(chunks[1].length, 400);
  assert.equal(chunks[2].length, 150);
});
