import type { PaymentCommitment, PropertyProfile, Tenant, Unit } from '../types/rental';
import { formatNaira } from './format';
import type { ComputedObligation } from './rentalEngine';

export interface CalendarDueCandidate {
  key: string; // deterministic unique key e.g. "obl:<id>" or "cmt:<id>"
  kind: 'Obligation' | 'Commitment';
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  unitCode: string;
  unitName: string;
  title: string;
  periodLabel: string;
  dueDate: string; // YYYY-MM-DD
  amount: number;
  daysPastDue: number;
  isMultiYear?: boolean;
  notes?: string;
}

export interface CalendarReminderOptions {
  email7DaysBefore: boolean;
  email1DayBefore: boolean;
  popup1HourBefore: boolean;
  popup1DayBefore: boolean;
}

export interface GoogleCalendarReminderOverride {
  method: 'email' | 'popup';
  minutes: number;
}

export interface GoogleCalendarEventPayload {
  propledgerKey: string;
  summary: string;
  location: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: {
    useDefault: boolean;
    overrides: GoogleCalendarReminderOverride[];
  };
  extendedProperties: {
    private: Record<string, string>;
  };
}

export interface SyncedCalendarEvent {
  id: string;
  summary: string;
  status: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  propledgerKey?: string;
  tenantId?: string;
  amountNaira?: string;
}

export const DEFAULT_CALENDAR_REMINDER_OPTIONS: CalendarReminderOptions = {
  email7DaysBefore: true,
  email1DayBefore: true,
  popup1HourBefore: true,
  popup1DayBefore: false,
};

export function collectCalendarDueCandidates(params: {
  computedObligations: ComputedObligation[];
  commitments: PaymentCommitment[];
  tenants: Tenant[];
  units: Unit[];
}): CalendarDueCandidate[] {
  const tenantMap = new Map(params.tenants.map((t) => [t.id, t]));
  const unitMap = new Map(params.units.map((u) => [u.id, u]));

  const multiYearTenantIds = new Set<string>();
  const rentYearsByTenant = new Map<string, Set<string>>();
  for (const co of params.computedObligations) {
    if (co.amountOutstanding <= 0 || co.obligation.chargeType !== 'Rent') continue;
    const set = rentYearsByTenant.get(co.obligation.tenantId) ?? new Set<string>();
    const yr = co.obligation.rentalPeriodLabel.match(/\b(20\d{2})\b/)?.[1] || co.obligation.dueDate.slice(0, 4);
    set.add(yr);
    rentYearsByTenant.set(co.obligation.tenantId, set);
  }
  for (const [tid, yrs] of rentYearsByTenant.entries()) {
    if (yrs.size >= 2) multiYearTenantIds.add(tid);
  }

  const list: CalendarDueCandidate[] = [];

  for (const co of params.computedObligations) {
    if (co.amountOutstanding <= 0) continue;
    const tenant = tenantMap.get(co.obligation.tenantId);
    const unit = unitMap.get(co.obligation.unitId);
    if (!tenant || tenant.archived || !unit) continue;

    list.push({
      key: `obl:${co.obligation.id}`,
      kind: 'Obligation',
      tenantId: tenant.id,
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      tenantEmail: tenant.email,
      tenantPhone: tenant.phone,
      unitCode: unit.code,
      unitName: unit.name,
      title: `${co.obligation.chargeType} Due: ${tenant.firstName} ${tenant.lastName} (${unit.code})`,
      periodLabel: co.obligation.rentalPeriodLabel,
      dueDate: co.obligation.dueDate,
      amount: co.amountOutstanding,
      daysPastDue: co.daysPastDue,
      isMultiYear: multiYearTenantIds.has(tenant.id),
      notes: co.obligation.reviewReason,
    });
  }

  for (const cmt of params.commitments) {
    if (cmt.status === 'Fulfilled' || cmt.status === 'Cancelled') continue;
    const tenant = tenantMap.get(cmt.tenantId);
    if (!tenant || tenant.archived) continue;
    const firstOb = params.computedObligations.find((co) => cmt.obligationIds.includes(co.obligation.id));
    const unit = firstOb ? unitMap.get(firstOb.obligation.unitId) : undefined;
    const effectiveDue = cmt.extendedUntilDate || cmt.promisedDate;

    list.push({
      key: `cmt:${cmt.id}`,
      kind: 'Commitment',
      tenantId: tenant.id,
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      tenantEmail: tenant.email,
      tenantPhone: tenant.phone,
      unitCode: unit?.code || 'Unit',
      unitName: unit?.name || '',
      title: `Promise to Pay Due: ${tenant.firstName} ${tenant.lastName}${unit ? ` (${unit.code})` : ''}`,
      periodLabel: 'Payment Commitment Deadline',
      dueDate: effectiveDue,
      amount: cmt.promisedAmount,
      daysPastDue: 0,
      isMultiYear: multiYearTenantIds.has(tenant.id),
      notes: cmt.notes,
    });
  }

  return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount);
}

export function buildCalendarReminderOverrides(
  opts: CalendarReminderOptions
): GoogleCalendarReminderOverride[] {
  const overrides: GoogleCalendarReminderOverride[] = [];
  if (opts.email7DaysBefore) {
    overrides.push({ method: 'email', minutes: 7 * 24 * 60 }); // 10080
  }
  if (opts.email1DayBefore) {
    overrides.push({ method: 'email', minutes: 24 * 60 }); // 1440
  }
  if (opts.popup1DayBefore) {
    overrides.push({ method: 'popup', minutes: 24 * 60 });
  }
  if (opts.popup1HourBefore) {
    overrides.push({ method: 'popup', minutes: 60 });
  }
  if (overrides.length === 0) {
    overrides.push({ method: 'popup', minutes: 60 });
  }
  return overrides;
}

export function buildCalendarEventPayload(
  candidate: CalendarDueCandidate,
  property: PropertyProfile,
  reminderOpts: CalendarReminderOptions = DEFAULT_CALENDAR_REMINDER_OPTIONS
): GoogleCalendarEventPayload {
  const formattedAmt = formatNaira(candidate.amount);
  const prefix = candidate.isMultiYear ? '[MULTI-YEAR ARREARS] ' : '';
  const summary = `${prefix}${candidate.title} — ${formattedAmt} [${property.name}]`;

  const descLines = [
    `Property: ${property.name} (${property.address})`,
    `Property Manager: ${property.managerName}`,
    `Tenant: ${candidate.tenantName}`,
    `Unit: ${candidate.unitCode}${candidate.unitName ? ` — ${candidate.unitName}` : ''}`,
    `Item: ${candidate.kind} · ${candidate.periodLabel}`,
    `Amount Outstanding / Promised: ${formattedAmt}`,
    `Due Date: ${candidate.dueDate}`,
    candidate.daysPastDue > 0 ? `Overdue Status: ${candidate.daysPastDue} day(s) past due` : 'Status: Scheduled / Active Due Date',
    candidate.tenantPhone ? `Tenant Phone: ${candidate.tenantPhone}` : '',
    candidate.tenantEmail ? `Tenant Email: ${candidate.tenantEmail}` : '',
    candidate.notes ? `Notes: ${candidate.notes}` : '',
  ].filter(Boolean);

  // Schedule at 09:00–09:30 Africa/Lagos (+01:00) using valid IANA timezone ID
  const startDateTime = `${candidate.dueDate}T09:00:00+01:00`;
  const endDateTime = `${candidate.dueDate}T09:30:00+01:00`;
  const ianaTimeZone = (property.timezone || 'Africa/Lagos').replace(/\s*\([^)]*\)\s*/g, '').trim() || 'Africa/Lagos';

  return {
    propledgerKey: candidate.key,
    summary,
    location: `${property.name}, ${property.address}`,
    description: descLines.join('\n'),
    start: {
      dateTime: startDateTime,
      timeZone: ianaTimeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone: ianaTimeZone,
    },
    reminders: {
      useDefault: false,
      overrides: buildCalendarReminderOverrides(reminderOpts),
    },
    extendedProperties: {
      private: {
        propledgerSource: 'propledger',
        propledgerKey: candidate.key,
        tenantId: candidate.tenantId,
        amountNaira: String(candidate.amount),
      },
    },
  };
}
