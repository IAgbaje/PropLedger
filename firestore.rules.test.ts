import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { isValidFirestoreId } from './src/utils/firestoreSync';

const ROOT = process.cwd();
const rulesText = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase-blueprint.json'), 'utf8')) as {
  firestore: Record<string, { schema: { $ref: string }; description: string }>;
  entities: Record<string, { required?: string[]; properties: Record<string, { maxLength?: number }> }>;
};

test('Phase 1 & 6 Completeness: every path in firebase-blueprint.json is matched and secured in firestore.rules', () => {
  const requiredMatchFragments = [
    'match /users/{userId}',
    'match /private/{docId}',
    'match /admins/{userId}',
    'match /workspaces/{workspaceId}',
    'match /units/{unitId}',
    'match /tenants/{tenantId}',
    'match /agreements/{agreementId}',
    'match /obligations/{obligationId}',
    'match /payments/{paymentId}',
    'match /receiptRequests/{receiptId}',
    'match /notifications/{notificationId}',
    'match /smsTemplates/{templateId}',
    'match /commitments/{commitmentId}',
    'match /commissions/{commissionId}',
    'match /commissionPayouts/{payoutId}',
    'match /expenses/{expenseId}',
    'match /maintenance/{maintenanceId}',
    'match /contacts/{contactId}',
    'match /auditLogs/{auditId}',
  ];

  assert.equal(Object.keys(blueprint.firestore).length, 19);
  for (const frag of requiredMatchFragments) {
    assert.equal(rulesText.includes(frag), true, `Missing match block: ${frag}`);
  }
});

test('Dirty Dozen Invariants 1-12: Zero-Trust Eight Pillars structural security verification', () => {
  // 1 & 2. Unauthenticated & unverified email blocked globally
  assert.match(rulesText, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  assert.equal(rulesText.includes('request.auth.token.email_verified == true'), true);
  assert.equal(/allow\s+(read|list|get)\s*:\s*if\s+isSignedIn\(\)\s*;/.test(rulesText), false);

  // 3 & 12. Master Gate & Cross-tenant ownership check
  assert.equal(
    rulesText.includes('get(/databases/$(database)/documents/workspaces/$(workspaceId)).data.ownerUid == request.auth.uid'),
    true
  );

  // 4. Self-assigned admin escalation impossible
  assert.match(rulesText, /match \/admins\/\{userId\}[\s\S]*?allow list, create, update, delete: if false;/);
  assert.equal(rulesText.includes("(data.role == 'manager' || isBootstrappedAdmin())"), true);

  // 5 & 9. Anti-update-gap & shadow update protection via validation helpers + hasOnly
  assert.equal(rulesText.includes('incoming().diff(existing()).affectedKeys().hasOnly('), true);
  assert.equal(rulesText.includes('data.keys().hasAll('), true);
  assert.equal(rulesText.includes('data.keys().hasOnly('), true);

  // 6 & 7. Immutable ownerUid, createdAt & strict request.time timestamps
  assert.equal(rulesText.includes('incoming().ownerUid == existing().ownerUid'), true);
  assert.equal(rulesText.includes('incoming().createdAt == existing().createdAt'), true);
  assert.equal(rulesText.includes('== request.time'), true);

  // 8. ID poisoning guard regex check
  assert.equal(rulesText.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"), true);
  assert.equal(isValidFirestoreId('t-1'), true);
  assert.equal(isValidFirestoreId('t-1/../../admin'), false);
  assert.equal(isValidFirestoreId('$badId'), false);
  assert.equal(isValidFirestoreId('x'.repeat(129)), false);

  // 10. PII list query isolation enforces resource.data.ownerUid == request.auth.uid (no get() inside list)
  assert.equal(rulesText.includes('resource.data.ownerUid == request.auth.uid'), true);

  // 11. Append-only financial & audit logs forbid update
  assert.match(rulesText, /match \/auditLogs\/\{auditId\}[\s\S]*?allow update: if false;/);
  assert.match(rulesText, /match \/commissions\/\{commissionId\}[\s\S]*?allow update: if false;/);
  assert.match(rulesText, /match \/commissionPayouts\/\{payoutId\}[\s\S]*?allow update: if false;/);

  // 13. Payment reconciliation fields & blueprint parity
  assert.equal('timeReceived' in blueprint.entities.PaymentRecord.properties, true);
  assert.equal('rentYearCovered' in blueprint.entities.PaymentRecord.properties, true);
  assert.equal('lastEditedAt' in blueprint.entities.PaymentRecord.properties, true);
  assert.equal(rulesText.includes("'timeReceived'"), true);
  assert.equal(rulesText.includes("'rentYearCovered'"), true);
  assert.equal(rulesText.includes('incoming().systemRef == existing().systemRef'), true);

  // 14. Expense & Maintenance scope, non-property purse, and editing fields parity
  assert.equal('customCategoryLabel' in blueprint.entities.ExpenseRecord.properties, true);
  assert.equal('isNonPropertyOutgoing' in blueprint.entities.ExpenseRecord.properties, true);
  assert.equal('scopeCategory' in blueprint.entities.ExpenseRecord.properties, true);
  assert.equal('scopeLabel' in blueprint.entities.ExpenseRecord.properties, true);
  assert.equal('linkedMaintenanceId' in blueprint.entities.ExpenseRecord.properties, true);
  assert.equal('scopeCategory' in blueprint.entities.MaintenanceItemRecord.properties, true);
  assert.equal('scopeLabel' in blueprint.entities.MaintenanceItemRecord.properties, true);
  assert.equal('linkedExpenseId' in blueprint.entities.MaintenanceItemRecord.properties, true);
  assert.equal(rulesText.includes("'customCategoryLabel'"), true);
  assert.equal(rulesText.includes("'isNonPropertyOutgoing'"), true);
  assert.equal(rulesText.includes("'scopeLabel'"), true);
  assert.equal(rulesText.includes("'linkedExpenseId'"), true);
});
