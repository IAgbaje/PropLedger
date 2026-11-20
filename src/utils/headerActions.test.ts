import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_NAV_TABS, shouldShowGlobalRecordPayment, type NavTab } from './headerActions';

test('shows global Record Payment header button only on Overview and Receipt Queue', () => {
  const expectedVisible: ReadonlySet<NavTab> = new Set(['overview', 'receipts']);

  assert.equal(ALL_NAV_TABS.length, 11);

  for (const tab of ALL_NAV_TABS) {
    assert.equal(
      shouldShowGlobalRecordPayment(tab),
      expectedVisible.has(tab),
      `Unexpected header Record Payment visibility for tab "${tab}"`
    );
  }
});

test('hides global Record Payment header button on Payments and all action-bearing screens', () => {
  const hiddenTabs: NavTab[] = [
    'payments',
    'units-tenants',
    'arrears-promises',
    'notifications',
    'sms-activity',
    'commissions',
    'expenses',
    'import',
    'settings',
  ];

  for (const tab of hiddenTabs) {
    assert.equal(shouldShowGlobalRecordPayment(tab), false);
  }
});
