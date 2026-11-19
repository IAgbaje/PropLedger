import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_STATE } from '../data/seedData';
import { computeObligation } from './rentalEngine';
import {
  buildCalendarEventPayload,
  buildCalendarReminderOverrides,
  collectCalendarDueCandidates,
} from './googleCalendar';

test('collectCalendarDueCandidates gathers unpaid obligations and open commitments sorted by due date', () => {
  const computed = SEED_STATE.obligations.map((ob) =>
    computeObligation(ob, SEED_STATE.payments, SEED_STATE.referenceDate, SEED_STATE.settings.gracePeriodDays)
  );
  const candidates = collectCalendarDueCandidates({
    computedObligations: computed,
    commitments: SEED_STATE.commitments,
    tenants: SEED_STATE.tenants,
    units: SEED_STATE.units,
  });

  assert.ok(candidates.length > 0);
  // Ensure sorted ascending by dueDate
  for (let i = 1; i < candidates.length; i++) {
    assert.ok(candidates[i - 1].dueDate <= candidates[i].dueDate);
  }
  // Sheikh Alfalaky multi-year obligations should be flagged
  const sheikhItems = candidates.filter((c) => c.tenantName.includes('Alfalaky'));
  assert.ok(sheikhItems.length >= 2);
  assert.equal(sheikhItems[0].isMultiYear, true);
});

test('buildCalendarEventPayload produces Africa/Lagos event with custom popup/email overrides and private extendedProperties', () => {
  const candidate = {
    key: 'obl:ob-rp3-2026',
    kind: 'Obligation' as const,
    tenantId: 'ten-sheikh',
    tenantName: 'Sheikh Ibrahim Alfalaky',
    tenantEmail: 'sheikh@example.com',
    tenantPhone: '+234 803 101 2001',
    unitCode: 'R&P-3',
    unitName: 'Room & Parlour 3',
    title: 'Rent Due: Sheikh Ibrahim Alfalaky (R&P-3)',
    periodLabel: '2026 Annual Rent',
    dueDate: '2026-12-01',
    amount: 85000,
    daysPastDue: 0,
    isMultiYear: true,
  };

  const payload = buildCalendarEventPayload(candidate, SEED_STATE.property, {
    email7DaysBefore: true,
    email1DayBefore: true,
    popup1HourBefore: true,
    popup1DayBefore: false,
  });

  assert.equal(payload.propledgerKey, 'obl:ob-rp3-2026');
  assert.ok(payload.summary.includes('[MULTI-YEAR ARREARS]'));
  assert.ok(payload.summary.includes("AgbaSaffy's Court"));
  assert.ok(payload.summary.includes('₦85,000'));
  assert.equal(payload.start.dateTime, '2026-12-01T09:00:00+01:00');
  assert.equal(payload.end.dateTime, '2026-12-01T09:30:00+01:00');
  assert.equal(payload.start.timeZone, 'Africa/Lagos');
  assert.equal(payload.reminders.useDefault, false);
  assert.deepEqual(payload.reminders.overrides, [
    { method: 'email', minutes: 10080 },
    { method: 'email', minutes: 1440 },
    { method: 'popup', minutes: 60 },
  ]);
  assert.equal(payload.extendedProperties.private.propledgerSource, 'propledger');
  assert.equal(payload.extendedProperties.private.propledgerKey, 'obl:ob-rp3-2026');
});

test('buildCalendarReminderOverrides always falls back to 60m popup when no options selected', () => {
  assert.deepEqual(
    buildCalendarReminderOverrides({
      email7DaysBefore: false,
      email1DayBefore: false,
      popup1HourBefore: false,
      popup1DayBefore: false,
    }),
    [{ method: 'popup', minutes: 60 }]
  );
});
