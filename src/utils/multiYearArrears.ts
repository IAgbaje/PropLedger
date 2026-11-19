import type {
  Agreement,
  Payment,
  Tenant,
  Unit,
  UnitType,
} from '../types/rental';
import { diffDays, type ComputedObligation } from './rentalEngine';

export interface UnpaidCycleItem {
  obligationId: string;
  chargeType: 'Rent' | 'Security Levy' | 'Other Charge';
  periodLabel: string;
  year: string;
  dueDate: string;
  daysPastDue: number;
  amountOutstanding: number;
  underReview: boolean;
}

export type ArrearsTier =
  | 'Multi-Year Debtor'
  | 'Multiple Dues (Rent + Levy)'
  | 'Overdue'
  | 'Upcoming'
  | 'Under Review'
  | 'Clear';

export interface TenantArrearsProfile {
  tenantId: string;
  unpaidRentAmount: number;
  unpaidLevyAmount: number;
  unpaidOtherAmount: number;
  totalOutstanding: number;
  unpaidRentCycles: UnpaidCycleItem[];
  unpaidLevyCycles: UnpaidCycleItem[];
  unpaidYears: string[];
  unpaidRentCycleCount: number;
  unpaidObligationCount: number;
  isMultiYear: boolean;
  hasMultipleDues: boolean;
  hasUnpaidSecurityLevy: boolean;
  hasUnderReview: boolean;
  oldestDueDate: string | null;
  maxDaysPastDue: number;
  tier: ArrearsTier;
}

export function extractCycleYear(label: string, dueDate: string): string {
  const match = label.match(/\b(20\d{2})\b/);
  if (match) return match[1];
  return dueDate.slice(0, 4) || 'Unknown';
}

export function analyzeTenantArrears(
  tenantId: string,
  computedObligations: ComputedObligation[]
): TenantArrearsProfile {
  const open = computedObligations
    .filter((c) => c.obligation.tenantId === tenantId && c.amountOutstanding > 0)
    .sort((a, b) => a.obligation.dueDate.localeCompare(b.obligation.dueDate));

  let unpaidRentAmount = 0;
  let unpaidLevyAmount = 0;
  let unpaidOtherAmount = 0;
  const unpaidRentCycles: UnpaidCycleItem[] = [];
  const unpaidLevyCycles: UnpaidCycleItem[] = [];
  const yearSet = new Set<string>();
  let maxDaysPastDue = 0;
  let hasUnderReview = false;

  for (const co of open) {
    const year = extractCycleYear(co.obligation.rentalPeriodLabel, co.obligation.dueDate);
    if (co.daysPastDue > maxDaysPastDue) {
      maxDaysPastDue = co.daysPastDue;
    }
    if (co.obligation.underReview) {
      hasUnderReview = true;
    }
    const item: UnpaidCycleItem = {
      obligationId: co.obligation.id,
      chargeType: co.obligation.chargeType,
      periodLabel: co.obligation.rentalPeriodLabel,
      year,
      dueDate: co.obligation.dueDate,
      daysPastDue: co.daysPastDue,
      amountOutstanding: co.amountOutstanding,
      underReview: co.obligation.underReview,
    };

    if (co.obligation.chargeType === 'Rent') {
      unpaidRentAmount += co.amountOutstanding;
      unpaidRentCycles.push(item);
      yearSet.add(year);
    } else if (co.obligation.chargeType === 'Security Levy') {
      unpaidLevyAmount += co.amountOutstanding;
      unpaidLevyCycles.push(item);
    } else {
      unpaidOtherAmount += co.amountOutstanding;
      unpaidLevyCycles.push(item);
    }
  }

  const unpaidYears = Array.from(yearSet).sort();
  const unpaidRentCycleCount = unpaidRentCycles.length;
  const unpaidObligationCount = open.length;
  const totalOutstanding = unpaidRentAmount + unpaidLevyAmount + unpaidOtherAmount;

  const isMultiYear =
    unpaidYears.length >= 2 ||
    unpaidRentCycleCount >= 2 ||
    (unpaidRentAmount > 0 && maxDaysPastDue >= 365);

  const hasMultipleDues =
    unpaidObligationCount >= 2 ||
    (unpaidRentAmount > 0 && (unpaidLevyAmount > 0 || unpaidOtherAmount > 0));

  let tier: ArrearsTier = 'Clear';
  if (totalOutstanding > 0) {
    if (isMultiYear) {
      tier = 'Multi-Year Debtor';
    } else if (hasMultipleDues && (maxDaysPastDue > 0 || unpaidLevyAmount > 0)) {
      tier = 'Multiple Dues (Rent + Levy)';
    } else if (hasUnderReview && maxDaysPastDue === 0 && unpaidRentAmount > 0) {
      tier = 'Under Review';
    } else if (maxDaysPastDue > 0) {
      tier = 'Overdue';
    } else {
      tier = 'Upcoming';
    }
  }

  return {
    tenantId,
    unpaidRentAmount,
    unpaidLevyAmount,
    unpaidOtherAmount,
    totalOutstanding,
    unpaidRentCycles,
    unpaidLevyCycles,
    unpaidYears,
    unpaidRentCycleCount,
    unpaidObligationCount,
    isMultiYear,
    hasMultipleDues,
    hasUnpaidSecurityLevy: unpaidLevyAmount > 0,
    hasUnderReview,
    oldestDueDate: open[0]?.obligation.dueDate ?? null,
    maxDaysPastDue,
    tier,
  };
}

export function buildAllTenantArrearsMap(
  tenants: Tenant[],
  computedObligations: ComputedObligation[]
): Record<string, TenantArrearsProfile> {
  const map: Record<string, TenantArrearsProfile> = {};
  for (const t of tenants) {
    map[t.id] = analyzeTenantArrears(t.id, computedObligations);
  }
  return map;
}

export interface MonthlyCollectionPoint {
  monthKey: string; // YYYY-MM
  label: string;    // e.g. Nov 2025
  amount: number;
  count: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function buildMonthlyCollectionsSeries(payments: Payment[]): MonthlyCollectionPoint[] {
  const buckets = new Map<string, { amount: number; count: number }>();
  for (const p of payments) {
    if (p.status !== 'Confirmed') continue;
    const key = p.dateReceived.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const prev = buckets.get(key) ?? { amount: 0, count: 0 };
    buckets.set(key, { amount: prev.amount + p.amount, count: prev.count + 1 });
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, val]) => {
      const [yr, mo] = monthKey.split('-');
      const mIdx = Math.max(0, Math.min(11, Number(mo) - 1));
      return {
        monthKey,
        label: `${MONTH_NAMES[mIdx]} ${yr.slice(2)}`,
        amount: val.amount,
        count: val.count,
      };
    });
}

export interface SegmentContribution {
  segment: 'Apartments & Rooms' | 'Shops, Kiosks & Containers';
  unitCount: number;
  expected: number;
  collected: number;
  outstanding: number;
  collectionRatePct: number;
}

export function isApartmentUnitType(type: UnitType): boolean {
  return type === 'Bedroom' || type === 'Room' || type === 'Room & Parlour';
}

export function buildPropertyTypeContribution(
  units: Unit[],
  computedObligations: ComputedObligation[]
): SegmentContribution[] {
  const unitMap = new Map(units.map((u) => [u.id, u]));
  const stats = {
    apartments: { unitIds: new Set<string>(), expected: 0, collected: 0, outstanding: 0 },
    shops: { unitIds: new Set<string>(), expected: 0, collected: 0, outstanding: 0 },
  };

  for (const u of units) {
    if (isApartmentUnitType(u.type)) {
      stats.apartments.unitIds.add(u.id);
    } else {
      stats.shops.unitIds.add(u.id);
    }
  }

  for (const co of computedObligations) {
    const unit = unitMap.get(co.obligation.unitId);
    const target = unit && isApartmentUnitType(unit.type) ? stats.apartments : stats.shops;
    target.expected += co.obligation.originalAmount;
    target.collected += co.amountAllocated;
    target.outstanding += co.amountOutstanding;
  }

  const makeRow = (
    segment: SegmentContribution['segment'],
    data: typeof stats.apartments
  ): SegmentContribution => ({
    segment,
    unitCount: data.unitIds.size,
    expected: data.expected,
    collected: data.collected,
    outstanding: data.outstanding,
    collectionRatePct:
      data.expected > 0 ? Math.round((data.collected / data.expected) * 100) : 0,
  });

  return [
    makeRow('Apartments & Rooms', stats.apartments),
    makeRow('Shops, Kiosks & Containers', stats.shops),
  ];
}

export interface TenantPaymentStatusBreakdown {
  fullyPaidCount: number;
  partiallyPaidCount: number;
  notPaidCount: number;
  multiYearCount: number;
  underReviewCount: number;
  inArrearsCount: number;
}

export function buildTenantPaymentStatusBreakdown(
  tenants: Tenant[],
  computedObligations: ComputedObligation[],
  arrearsMap: Record<string, TenantArrearsProfile>
): TenantPaymentStatusBreakdown {
  let fullyPaidCount = 0;
  let partiallyPaidCount = 0;
  let notPaidCount = 0;
  let multiYearCount = 0;
  let underReviewCount = 0;
  let inArrearsCount = 0;

  for (const t of tenants) {
    if (t.archived) continue;
    const obs = computedObligations.filter((c) => c.obligation.tenantId === t.id);
    if (obs.length === 0) continue;

    const prof = arrearsMap[t.id];
    const totalExpected = obs.reduce((s, c) => s + c.obligation.originalAmount, 0);
    const totalPaid = obs.reduce((s, c) => s + c.amountAllocated, 0);

    if (prof?.isMultiYear) multiYearCount++;
    if (prof?.hasUnderReview) underReviewCount++;
    if (prof && prof.totalOutstanding > 0 && prof.maxDaysPastDue > 0) {
      inArrearsCount++;
    }

    if (prof && prof.totalOutstanding <= 0) {
      fullyPaidCount++;
    } else if (totalPaid > 0 && totalPaid < totalExpected) {
      partiallyPaidCount++;
    } else {
      notPaidCount++;
    }
  }

  return {
    fullyPaidCount,
    partiallyPaidCount,
    notPaidCount,
    multiYearCount,
    underReviewCount,
    inArrearsCount,
  };
}

export interface UpcomingDueDateItem {
  id: string;
  tenantId: string;
  tenantName: string;
  unitCode: string;
  unitName: string;
  dueDate: string;
  daysUntilDue: number;
  amount: number;
  statusLabel: 'Due Soon' | 'Upcoming Renewal' | 'Open Balance Due';
}

export function buildUpcomingDueDates(
  agreements: Agreement[],
  computedObligations: ComputedObligation[],
  units: Unit[],
  tenants: Tenant[],
  referenceDate: string
): UpcomingDueDateItem[] {
  const items: UpcomingDueDateItem[] = [];
  const seenKeys = new Set<string>();

  // 1. Open upcoming or within-grace obligations
  for (const co of computedObligations) {
    if (co.amountOutstanding <= 0) continue;
    const delta = diffDays(referenceDate, co.obligation.dueDate);
    if (delta < -7) continue; // already well past due; covered in arrears
    const tenant = tenants.find((t) => t.id === co.obligation.tenantId);
    const unit = units.find((u) => u.id === co.obligation.unitId);
    if (!tenant || !unit) continue;
    seenKeys.add(`${tenant.id}::${co.obligation.dueDate}`);
    items.push({
      id: co.obligation.id,
      tenantId: tenant.id,
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      unitCode: unit.code,
      unitName: unit.name,
      dueDate: co.obligation.dueDate,
      daysUntilDue: delta,
      amount: co.amountOutstanding,
      statusLabel: delta <= 14 ? 'Due Soon' : 'Open Balance Due',
    });
  }

  // 2. Active agreement next renewal/due dates that are upcoming
  for (const ag of agreements) {
    if (ag.status !== 'Active') continue;
    const delta = diffDays(referenceDate, ag.dueDate);
    if (delta < 0) continue;
    const key = `${ag.tenantId}::${ag.dueDate}`;
    if (seenKeys.has(key)) continue;
    const tenant = tenants.find((t) => t.id === ag.tenantId);
    const unit = units.find((u) => u.id === ag.unitId);
    if (!tenant || !unit) continue;
    seenKeys.add(key);
    items.push({
      id: `ag-due-${ag.id}`,
      tenantId: tenant.id,
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      unitCode: unit.code,
      unitName: unit.name,
      dueDate: ag.dueDate,
      daysUntilDue: delta,
      amount: ag.agreedRent,
      statusLabel: delta <= 14 ? 'Due Soon' : 'Upcoming Renewal',
    });
  }

  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
