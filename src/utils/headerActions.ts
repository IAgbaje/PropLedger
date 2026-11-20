export const ALL_NAV_TABS = [
  'overview',
  'units-tenants',
  'payments',
  'arrears-promises',
  'receipts',
  'notifications',
  'sms-activity',
  'commissions',
  'expenses',
  'import',
  'settings',
] as const;

export type NavTab = (typeof ALL_NAV_TABS)[number];

/**
 * Screens where no competing top-right page CTA exists and the global
 * sticky header shortcut (+ Record Payment) adds direct value.
 */
const GLOBAL_RECORD_PAYMENT_TABS: ReadonlySet<NavTab> = new Set<NavTab>([
  'overview',
  'receipts',
]);

export function shouldShowGlobalRecordPayment(activeTab: NavTab): boolean {
  return GLOBAL_RECORD_PAYMENT_TABS.has(activeTab);
}
