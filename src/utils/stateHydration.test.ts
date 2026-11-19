import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_STATE } from '../data/seedData';
import { hydrateRentalState } from './stateHydration';

test('hydrateRentalState migrates legacy Adebayo Court & Ibrahim Agbaje branding and merges new settings', () => {
  const legacySaved = {
    ...SEED_STATE,
    property: {
      id: 'prop-1',
      name: 'Adebayo Court — Phase 1',
      address: '14 Admiralty Road, Lekki Phase 1, Lagos',
      timezone: 'Africa/Lagos (WAT)',
      currencySymbol: '₦',
      managerName: 'Ibrahim Agbaje',
      managerEmail: 'ibrahim.agbaje@adebayocourt.ng',
    },
    settings: {
      defaultRentCycle: 'Yearly' as const,
      securityLevyAmount: 4000,
      lawyerCommissionRatePercent: 5,
      gracePeriodDays: 7,
      receiptSlaHours: 4,
      defaultAllocationOrder: 'Oldest Overdue First' as const,
      repeatedLateThresholdCycles: 2,
      persistentArrearsDays: 30,
      chronicDelinquencyDays: 90,
      globalNotificationsPaused: false,
      quietHoursStart: '20:00',
      quietHoursEnd: '07:00',
      sendTenantPaymentConfirmation: true,
      sendLawyerCommissionAlert: true,
      preDueOffsetsDays: [90, 45, 20, 7, 3, 0],
      postDueOffsetsDays: [1, 3, 7, 14, 30],
      post30DayCadenceDays: 14,
    },
    auditLogs: [
      {
        id: 'aud-1',
        timestamp: '2026-11-17T17:15:00Z',
        actor: 'Ibrahim Agbaje',
        entityType: 'Payment' as const,
        entityId: 'pay-1',
        action: 'Payment Recorded',
        summary: 'Recorded payment for Adebayo Court — Phase 1',
      },
    ],
  };

  // @ts-expect-error simulating legacy settings object missing new fields
  const hydrated = hydrateRentalState(legacySaved);

  assert.equal(hydrated.property.name, "AgbaSaffy's Court");
  assert.equal(hydrated.property.managerName, 'Ibraheem Agbaje');
  assert.equal(hydrated.property.managerEmail, 'theibraheemagbaje@gmail.com');
  assert.equal(hydrated.settings.preferredEmailProvider, 'gmail');
  assert.equal(hydrated.settings.autoSendPaymentReceipts, true);
  assert.equal(hydrated.auditLogs[0].actor, 'Ibraheem Agbaje');
  assert.match(hydrated.auditLogs[0].summary, /AgbaSaffy's Court/);
});

test('hydrateRentalState preserves custom user edits while filling defaults', () => {
  const customSaved = {
    ...SEED_STATE,
    property: {
      ...SEED_STATE.property,
      name: 'Custom Estate Wing',
      managerName: 'Ibraheem Agbaje',
    },
  };
  const hydrated = hydrateRentalState(customSaved);
  assert.equal(hydrated.property.name, 'Custom Estate Wing');
  assert.equal(hydrated.property.managerName, 'Ibraheem Agbaje');
});
