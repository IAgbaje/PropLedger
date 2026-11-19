import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCommissionOnAllocations,
  checkDuplicateBankReference,
  computeEffectiveReceiptStatus,
  computeObligation,
  computeTenantBehaviour,
  evaluateCommitmentStatus,
  getAgeingBucket,
  parseCsvText,
  suggestPaymentAllocations,
  validateTenancyCsvRows,
} from './rentalEngine';
import type {
  Payment,
  PaymentCommitment,
  ReceiptRequest,
  RentalObligation,
  SystemSettings,
  Tenant,
} from '../types/rental';

const baseSettings: SystemSettings = {
  defaultRentCycle: 'Yearly',
  securityLevyAmount: 4000,
  lawyerCommissionRatePercent: 10,
  gracePeriodDays: 7,
  receiptSlaHours: 4,
  defaultAllocationOrder: 'Oldest Overdue First',
  repeatedLateThresholdCycles: 2,
  persistentArrearsDays: 30,
  chronicDelinquencyDays: 90,
  globalNotificationsPaused: false,
  quietHoursStart: '20:00',
  quietHoursEnd: '07:00',
  sendTenantPaymentConfirmation: false,
  sendLawyerCommissionAlert: false,
  preDueOffsetsDays: [90, 45, 20, 7, 3, 0],
  postDueOffsetsDays: [1, 3, 7, 14, 30],
  post30DayCadenceDays: 14,
  preferredEmailProvider: 'gmail',
  autoSendPaymentReceipts: true,
  autoSendScheduledReminders: true,
  autoSendCustomScheduled: true,
  autoSendArrearsEscalations: true,
  smsUnitCostNaira: 4,
};

test('obligation tracks settlement and due-date positions independently with grace period', () => {
  const ob: RentalObligation = {
    id: 'ob-1',
    agreementId: 'ag-1',
    tenantId: 'ten-1',
    unitId: 'unit-1',
    chargeType: 'Rent',
    rentalPeriodLabel: '2026 Annual Rent',
    originalAmount: 1200000,
    dueDate: '2026-11-10',
    underReview: false,
    createdAt: '2026-10-01T09:00:00Z',
  };

  const partialPayment: Payment[] = [
    {
      id: 'pay-1',
      systemRef: 'PAY-001',
      tenantId: 'ten-1',
      agreementId: 'ag-1',
      unitId: 'unit-1',
      amount: 500000,
      dateReceived: '2026-11-12',
      dateRecorded: '2026-11-12T10:00:00Z',
      method: 'Bank Transfer',
      bankReference: 'NIP-123',
      status: 'Confirmed',
      allocations: [{ obligationId: 'ob-1', amount: 500000 }],
      unappliedAmount: 0,
      notes: '',
      recordedBy: 'Property Manager',
    },
  ];

  // Within 7-day grace period (Nov 15 is 5 days after Nov 10) -> Partially Paid + Due
  const withinGrace = computeObligation(ob, partialPayment, '2026-11-15', 7);
  assert.equal(withinGrace.settlementPosition, 'Partially Paid');
  assert.equal(withinGrace.dueDatePosition, 'Due');
  assert.equal(withinGrace.amountOutstanding, 700000);
  assert.equal(withinGrace.daysPastDue, 0);

  // Past 7-day grace period (Nov 20 is 10 days after Nov 10) -> Partially Paid + Overdue
  const pastGrace = computeObligation(ob, partialPayment, '2026-11-20', 7);
  assert.equal(pastGrace.settlementPosition, 'Partially Paid');
  assert.equal(pastGrace.dueDatePosition, 'Overdue');
  assert.equal(pastGrace.daysPastDue, 10);
  assert.equal(pastGrace.ageingBucket, '8–30 days');
});

test('reversed payments restore obligation balance and do not count toward settlement', () => {
  const ob: RentalObligation = {
    id: 'ob-2',
    agreementId: 'ag-1',
    tenantId: 'ten-1',
    unitId: 'unit-1',
    chargeType: 'Rent',
    rentalPeriodLabel: '2026 Annual Rent',
    originalAmount: 800000,
    dueDate: '2026-10-01',
    underReview: false,
    createdAt: '2026-09-01T09:00:00Z',
  };

  const reversedPayment: Payment[] = [
    {
      id: 'pay-rev',
      systemRef: 'PAY-002',
      tenantId: 'ten-1',
      agreementId: 'ag-1',
      unitId: 'unit-1',
      amount: 800000,
      dateReceived: '2026-10-05',
      dateRecorded: '2026-10-05T10:00:00Z',
      method: 'Bank Transfer',
      bankReference: 'NIP-999',
      status: 'Reversed',
      allocations: [{ obligationId: 'ob-2', amount: 800000 }],
      unappliedAmount: 0,
      notes: '',
      recordedBy: 'Property Manager',
      reversalReason: 'Bounced transfer',
    },
  ];

  const computed = computeObligation(ob, reversedPayment, '2026-11-18', 7);
  assert.equal(computed.amountAllocated, 0);
  assert.equal(computed.amountOutstanding, 800000);
  assert.equal(computed.settlementPosition, 'Unpaid');
  assert.equal(computed.dueDatePosition, 'Overdue');
  assert.equal(computed.ageingBucket, '31–60 days');
});

test('lawyer commission excludes security levy and non-rent charges', () => {
  const obligations: RentalObligation[] = [
    {
      id: 'ob-rent',
      agreementId: 'ag-1',
      tenantId: 'ten-1',
      unitId: 'unit-1',
      chargeType: 'Rent',
      rentalPeriodLabel: 'Rent',
      originalAmount: 1000000,
      dueDate: '2026-11-01',
      underReview: false,
      createdAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'ob-levy',
      agreementId: 'ag-1',
      tenantId: 'ten-1',
      unitId: 'unit-1',
      chargeType: 'Security Levy',
      rentalPeriodLabel: 'Security Levy',
      originalAmount: 4000,
      dueDate: '2026-11-01',
      underReview: false,
      createdAt: '2026-10-01T00:00:00Z',
    },
  ];

  const { eligibleRent, commissionAmount } = calculateCommissionOnAllocations(
    [
      { obligationId: 'ob-rent', amount: 600000 },
      { obligationId: 'ob-levy', amount: 4000 },
    ],
    obligations,
    10
  );

  assert.equal(eligibleRent, 600000);
  assert.equal(commissionAmount, 60000);
});

test('payment allocation handles advance/excess amounts as unapplied credit', () => {
  const ob: RentalObligation = {
    id: 'ob-1',
    agreementId: 'ag-1',
    tenantId: 'ten-1',
    unitId: 'unit-1',
    chargeType: 'Rent',
    rentalPeriodLabel: '2026 Rent',
    originalAmount: 500000,
    dueDate: '2026-11-01',
    underReview: false,
    createdAt: '2026-10-01T00:00:00Z',
  };
  const computed = [computeObligation(ob, [], '2026-11-18', 7)];
  const result = suggestPaymentAllocations(650000, computed, 'Oldest Overdue First');
  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0].amount, 500000);
  assert.equal(result.unappliedAmount, 150000);
});

test('promise to pay evaluates fulfilled, partially fulfilled, and breached correctly', () => {
  const commitment: PaymentCommitment = {
    id: 'com-1',
    tenantId: 'ten-1',
    obligationIds: ['ob-1'],
    promisedAmount: 300000,
    promisedDate: '2026-11-15',
    instalments: [],
    status: 'Open',
    dateRecorded: '2026-11-10',
    recordedBy: 'Property Manager',
    notes: '',
  };

  const partialPay: Payment[] = [
    {
      id: 'p-1',
      systemRef: 'PAY-10',
      tenantId: 'ten-1',
      agreementId: 'ag-1',
      unitId: 'unit-1',
      amount: 150000,
      dateReceived: '2026-11-12',
      dateRecorded: '2026-11-12T09:00:00Z',
      method: 'Cash',
      bankReference: '',
      status: 'Confirmed',
      allocations: [{ obligationId: 'ob-1', amount: 150000 }],
      unappliedAmount: 0,
      notes: '',
      recordedBy: 'Property Manager',
    },
  ];

  // Before promised date with 150k paid -> Partially Fulfilled
  assert.equal(evaluateCommitmentStatus(commitment, partialPay, '2026-11-14').status, 'Partially Fulfilled');
  // After promised date with 150k paid (short of 300k) -> Breached
  assert.equal(evaluateCommitmentStatus(commitment, partialPay, '2026-11-16').status, 'Breached');
});

test('receipt SLA breach flips non-issued receipt request to Overdue', () => {
  const req: ReceiptRequest = {
    id: 'rcp-1',
    paymentId: 'pay-1',
    paymentRef: 'PAY-1',
    tenantId: 'ten-1',
    unitId: 'unit-1',
    amount: 400000,
    datePaid: '2026-11-18',
    rentalPeriodCovered: '2026 Rent',
    securityLevyIncluded: 0,
    remainingBalanceAtPayment: 0,
    issuerContactId: 'c-1',
    status: 'Notified',
    createdAt: '2026-11-18T08:00:00Z',
    slaDeadlineAt: '2026-11-18T12:00:00Z',
  };

  assert.equal(computeEffectiveReceiptStatus(req, '2026-11-18T11:00:00Z'), 'Notified');
  assert.equal(computeEffectiveReceiptStatus(req, '2026-11-18T13:00:00Z'), 'Overdue');
  assert.equal(
    computeEffectiveReceiptStatus({ ...req, status: 'Issued' }, '2026-11-18T13:00:00Z'),
    'Issued'
  );
});

test('tenant historical late payment behaviour persists even after current arrears are settled', () => {
  const tenant: Tenant = {
    id: 't-late',
    firstName: 'Bola',
    lastName: 'Ade',
    phone: '+2348011111111',
    email: 'bola@example.com',
    archived: false,
    notificationsPaused: false,
    historicalLateCycles: 2,
    createdAt: '2024-01-01T00:00:00Z',
  };
  assert.equal(computeTenantBehaviour(tenant, [], baseSettings), 'Repeated Late Payment');
});

test('ageing buckets and duplicate reference check + CSV validator work accurately', () => {
  assert.equal(getAgeingBucket(0), 'Not Yet Due');
  assert.equal(getAgeingBucket(5), '1–7 days');
  assert.equal(getAgeingBucket(25), '8–30 days');
  assert.equal(getAgeingBucket(45), '31–60 days');
  assert.equal(getAgeingBucket(75), '61–90 days');
  assert.equal(getAgeingBucket(110), '> 90 days');

  assert.equal(
    checkDuplicateBankReference('nip-001', [
      {
        id: 'p1',
        systemRef: 'PAY-1',
        tenantId: 't1',
        agreementId: 'a1',
        unitId: 'u1',
        amount: 100,
        dateReceived: '2026-11-01',
        dateRecorded: '2026-11-01T10:00:00Z',
        method: 'Bank Transfer',
        bankReference: 'NIP-001',
        status: 'Confirmed',
        allocations: [],
        unappliedAmount: 0,
        notes: '',
        recordedBy: 'PM',
      },
    ]),
    true
  );

  const csv = `unitCode,unitName,unitType,floorOrWing,firstName,lastName,phone,email,agreedRent,securityLevy,startDate,endDate,dueDate
U-11,Studio 11,Room,Annex,Tunde,Balogun,+2348099988877,tunde@example.com,450000,4000,2026-11-01,2027-10-31,2026-11-01
U-12,Bad Row,Penthouse,Annex,Ada,,+2348000000000,,-500,4000,invalid-date,2027-10-31,2026-11-01`;

  const parsed = parseCsvText(csv);
  const results = validateTenancyCsvRows(parsed.rows, [], []);
  assert.equal(results[0].status, 'Valid');
  assert.equal(results[1].status, 'Error');
});
