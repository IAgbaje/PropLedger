import test from 'node:test';
import assert from 'node:assert/strict';
import type { NotificationRecord } from '../types/rental';
import { interpolateTemplate } from './messaging';
import {
  buildSmsRecipientCostSummaries,
  extractBulkSmsDlrMatch,
} from './smsAnalytics';

test('interpolateTemplate replaces snake_case SMS placeholders cleanly', () => {
  const rendered = interpolateTemplate(
    'Dear {{tenant_name}}, rent for {{unit_code}} ({{amount_due}}) is due on {{due_date}}. Receipt: {{receipt_number}}. Issue: {{maintenance_issue}}.',
    {
      fullName: 'Sheikh Ibrahim Alfalaky',
      unitCode: 'R&P-3',
      outstandingBalance: '₦178,000',
      dueDate: '2026-12-01',
      receiptNumber: 'RCP-2026-011',
      maintenanceIssue: 'Roof flashing',
    }
  );
  assert.equal(
    rendered,
    'Dear Sheikh Ibrahim Alfalaky, rent for R&P-3 (₦178,000) is due on 2026-12-01. Receipt: RCP-2026-011. Issue: Roof flashing.'
  );
});

test('buildSmsRecipientCostSummaries aggregates units and Naira cost per recipient accurately', () => {
  const notifications: NotificationRecord[] = [
    {
      id: 'n1',
      eventId: 'e1',
      eventType: 'Custom Direct Message',
      relatedRecordId: 't-1',
      tenantId: 't-1',
      recipientName: 'Tenant One',
      recipientRole: 'Tenant',
      recipientContact: '+234 803 111 2222',
      channel: 'SMS',
      status: 'Delivered',
      deliveryProvider: 'BulkSMSLive',
      externalMessageId: 'msg-101',
      smsUnits: 2,
      messageBody: 'Hello Tenant One, kindly remit rent balance.',
      scheduledAt: '2026-11-18T10:00:00Z',
      attemptedAt: '2026-11-18T10:00:05Z',
      retryCount: 0,
    },
    {
      id: 'n2',
      eventId: 'e2',
      eventType: 'Custom Direct Message',
      relatedRecordId: 't-1',
      tenantId: 't-1',
      recipientName: 'Tenant One',
      recipientRole: 'Tenant',
      recipientContact: '+234 803 111 2222',
      channel: 'SMS',
      status: 'Sent',
      deliveryProvider: 'BulkSMSLive',
      externalMessageId: 'msg-102',
      messageBody: 'Follow-up reminder',
      scheduledAt: '2026-11-19T08:00:00Z',
      attemptedAt: '2026-11-19T08:00:02Z',
      retryCount: 0,
    },
    {
      id: 'n3',
      eventId: 'e3',
      eventType: 'Overdue Reminder',
      relatedRecordId: 't-2',
      tenantId: 't-2',
      recipientName: 'Tenant Two',
      recipientRole: 'Tenant',
      recipientContact: '+234 805 333 4444',
      channel: 'SMS',
      status: 'Failed',
      deliveryProvider: 'Ledger Only',
      messageBody: 'Overdue rent balance.',
      scheduledAt: '2026-11-17T09:00:00Z',
      attemptedAt: '2026-11-17T09:00:05Z',
      retryCount: 1,
    },
    {
      id: 'n4',
      eventId: 'e4',
      eventType: 'Payment Recorded / Receipt Request',
      relatedRecordId: 't-1',
      recipientName: 'Aisha',
      recipientRole: 'Receipt Issuer',
      recipientContact: 'aisha@example.com',
      channel: 'Email',
      status: 'Delivered',
      messageBody: 'Email should be ignored in SMS cost summary',
      scheduledAt: '2026-11-18T09:00:00Z',
      retryCount: 0,
    },
  ];

  const { metrics, summaries } = buildSmsRecipientCostSummaries({
    notifications,
    tenants: [],
    agreements: [],
    units: [],
    unitCostNaira: 4,
  });

  assert.equal(metrics.totalRecords, 3);
  assert.equal(metrics.dispatchedCount, 2);
  assert.equal(metrics.deliveredCount, 1);
  assert.equal(metrics.failedCount, 1);
  assert.equal(metrics.totalUnitsConsumed, 3); // 2 + 1 (failed = 0 billable)
  assert.equal(metrics.totalCostNaira, 12);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].recipientName, 'Tenant One');
  assert.equal(summaries[0].billableUnits, 3);
  assert.equal(summaries[0].totalCostNaira, 12);
  assert.equal(summaries[1].totalCostNaira, 0);
});

test('extractBulkSmsDlrMatch normalizes BulkSMSLive DLR payload status', () => {
  assert.deepEqual(
    extractBulkSmsDlrMatch([{ msgid: 'm1', status: 'DELIVERED' }], 'm1'),
    { nextStatus: 'Delivered', rawLabel: 'DELIVERED' }
  );
  assert.deepEqual(
    extractBulkSmsDlrMatch([{ msgid: 'm2', dlr: 'UNDELIV' }], 'm2'),
    { nextStatus: 'Failed', rawLabel: 'UNDELIV' }
  );
  assert.deepEqual(extractBulkSmsDlrMatch([], 'm3'), {
    nextStatus: null,
    rawLabel: 'Pending / No DLR returned yet',
  });
});
