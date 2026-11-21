import type {
  AgeingBucket,
  Agreement,
  BehaviourIndicator,
  CommitmentStatus,
  DueDatePosition,
  Payment,
  PaymentAllocation,
  PaymentCommitment,
  ReceiptRequest,
  ReceiptRequestStatus,
  RentalObligation,
  SettlementPosition,
  SystemSettings,
  Tenant,
  Unit,
  UnitType,
} from '../types/rental';

export interface ComputedObligation {
  obligation: RentalObligation;
  amountAllocated: number;
  amountOutstanding: number;
  settlementPosition: SettlementPosition;
  dueDatePosition: DueDatePosition;
  daysPastDue: number;
  ageingBucket: AgeingBucket;
}

export function diffDays(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toDateStr.slice(0, 10).split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function getAllocatedAmountForObligation(
  obligationId: string,
  payments: Payment[]
): number {
  let sum = 0;
  for (const p of payments) {
    if (p.status !== 'Confirmed') continue;
    for (const alloc of p.allocations) {
      if (alloc.obligationId === obligationId) {
        sum += alloc.amount;
      }
    }
  }
  return Math.round(sum * 100) / 100;
}

export function getAgeingBucket(daysPastDue: number): AgeingBucket {
  if (daysPastDue <= 0) return 'Not Yet Due';
  if (daysPastDue <= 7) return '1–7 days';
  if (daysPastDue <= 30) return '8–30 days';
  if (daysPastDue <= 60) return '31–60 days';
  if (daysPastDue <= 90) return '61–90 days';
  return '> 90 days';
}

export function computeObligation(
  obligation: RentalObligation,
  payments: Payment[],
  referenceDate: string,
  gracePeriodDays: number
): ComputedObligation {
  const allocated = Math.min(
    obligation.originalAmount,
    getAllocatedAmountForObligation(obligation.id, payments)
  );
  const outstanding = Math.max(0, Math.round((obligation.originalAmount - allocated) * 100) / 100);

  let settlementPosition: SettlementPosition = 'Unpaid';
  if (outstanding <= 0) {
    settlementPosition = 'Paid / Settled';
  } else if (allocated > 0) {
    settlementPosition = 'Partially Paid';
  }

  const daysSinceDue = diffDays(obligation.dueDate, referenceDate);

  let dueDatePosition: DueDatePosition = 'Upcoming';
  let daysPastDue = 0;

  if (obligation.underReview) {
    dueDatePosition = 'Under Review';
    if (outstanding > 0 && daysSinceDue > gracePeriodDays) {
      daysPastDue = daysSinceDue;
    }
  } else if (settlementPosition === 'Paid / Settled') {
    dueDatePosition = daysSinceDue >= 0 ? 'Due' : 'Upcoming';
    daysPastDue = 0;
  } else {
    if (daysSinceDue < 0) {
      dueDatePosition = 'Upcoming';
      daysPastDue = 0;
    } else if (daysSinceDue <= gracePeriodDays) {
      dueDatePosition = 'Due';
      daysPastDue = 0;
    } else {
      dueDatePosition = 'Overdue';
      daysPastDue = daysSinceDue;
    }
  }

  const ageingBucket: AgeingBucket =
    dueDatePosition === 'Overdue' || (obligation.underReview && daysPastDue > 0)
      ? getAgeingBucket(daysPastDue)
      : 'Not Yet Due';

  return {
    obligation,
    amountAllocated: allocated,
    amountOutstanding: outstanding,
    settlementPosition,
    dueDatePosition,
    daysPastDue,
    ageingBucket,
  };
}

export function computeTenantBehaviour(
  tenant: Tenant,
  computedObligations: ComputedObligation[],
  settings: SystemSettings
): BehaviourIndicator {
  if (tenant.behaviourOverride) {
    return tenant.behaviourOverride;
  }

  const tenantObs = computedObligations.filter((c) => c.obligation.tenantId === tenant.id);
  const hasUnderReview = tenantObs.some((c) => c.obligation.underReview && c.amountOutstanding > 0);
  if (hasUnderReview && tenantObs.every((c) => c.amountOutstanding === 0 || c.obligation.underReview)) {
    return 'Under Review';
  }

  const overdueObs = tenantObs.filter((c) => c.dueDatePosition === 'Overdue' && c.amountOutstanding > 0);
  const maxDaysPastDue = overdueObs.reduce((max, c) => Math.max(max, c.daysPastDue), 0);

  // Count historical settled late cycles + current overdue obligations
  const settledLateCount = tenantObs.filter(
    (c) => c.settlementPosition === 'Paid / Settled' && (c.obligation.settledLateDays ?? 0) > settings.gracePeriodDays
  ).length;
  const totalLateInstances = Math.max(tenant.historicalLateCycles, settledLateCount) + overdueObs.length;

  if (
    maxDaysPastDue >= settings.chronicDelinquencyDays ||
    (overdueObs.length >= 2 && maxDaysPastDue >= settings.persistentArrearsDays)
  ) {
    return 'Chronic Delinquency';
  }

  if (maxDaysPastDue >= settings.persistentArrearsDays) {
    return 'Persistent Arrears';
  }

  if (totalLateInstances >= settings.repeatedLateThresholdCycles) {
    return 'Repeated Late Payment';
  }

  if (overdueObs.length > 0 || totalLateInstances >= 1) {
    return 'Occasional Late Payment';
  }

  return 'Current';
}

export function calculateCommissionOnAllocations(
  allocations: PaymentAllocation[],
  obligations: RentalObligation[],
  ratePercent: number
): { eligibleRent: number; commissionAmount: number } {
  let eligibleRent = 0;
  for (const alloc of allocations) {
    const ob = obligations.find((o) => o.id === alloc.obligationId);
    // Security Levy and non-rent charges are excluded unless custom category explicitly enables commission
    if (ob && (ob.chargeType === 'Rent' || Boolean(ob.commissionEligible))) {
      eligibleRent += alloc.amount;
    }
  }
  const commissionAmount = Math.round(eligibleRent * (ratePercent / 100) * 100) / 100;
  return { eligibleRent, commissionAmount };
}

export function suggestPaymentAllocations(
  amount: number,
  tenantObligations: ComputedObligation[],
  order: SystemSettings['defaultAllocationOrder']
): { allocations: PaymentAllocation[]; unappliedAmount: number } {
  if (amount <= 0 || order === 'Manual Only') {
    return { allocations: [], unappliedAmount: Math.max(0, amount) };
  }

  const openObs = tenantObligations
    .filter((c) => c.amountOutstanding > 0)
    .slice()
    .sort((a, b) => {
      if (order === 'Rent Before Levy') {
        if (a.obligation.chargeType === 'Rent' && b.obligation.chargeType !== 'Rent') return -1;
        if (a.obligation.chargeType !== 'Rent' && b.obligation.chargeType === 'Rent') return 1;
      }
      return a.obligation.dueDate.localeCompare(b.obligation.dueDate);
    });

  let remaining = amount;
  const allocations: PaymentAllocation[] = [];

  for (const item of openObs) {
    if (remaining <= 0) break;
    const allocAmt = Math.min(remaining, item.amountOutstanding);
    if (allocAmt > 0) {
      allocations.push({
        obligationId: item.obligation.id,
        amount: Math.round(allocAmt * 100) / 100,
      });
      remaining = Math.round((remaining - allocAmt) * 100) / 100;
    }
  }

  return {
    allocations,
    unappliedAmount: remaining,
  };
}

export function evaluateCommitmentStatus(
  commitment: PaymentCommitment,
  payments: Payment[],
  referenceDate: string
): { status: CommitmentStatus; amountPaidTowardsObligations: number } {
  if (commitment.status === 'Cancelled') {
    return { status: 'Cancelled', amountPaidTowardsObligations: 0 };
  }

  // Sum confirmed payments recorded on or after commitment.dateRecorded linked to commitment.obligationIds
  const commitDate = commitment.dateRecorded.slice(0, 10);
  let paid = 0;
  for (const p of payments) {
    if (p.status !== 'Confirmed' || p.tenantId !== commitment.tenantId) continue;
    if (p.dateReceived < commitDate) continue;
    for (const alloc of p.allocations) {
      if (commitment.obligationIds.includes(alloc.obligationId)) {
        paid += alloc.amount;
      }
    }
  }
  paid = Math.round(paid * 100) / 100;

  if (paid >= commitment.promisedAmount) {
    return { status: 'Fulfilled', amountPaidTowardsObligations: paid };
  }

  const effectiveDeadline = commitment.extendedUntilDate || commitment.promisedDate;
  const pastDeadline = diffDays(effectiveDeadline, referenceDate) > 0;

  if (pastDeadline) {
    return {
      status: 'Breached',
      amountPaidTowardsObligations: paid,
    };
  }

  if (paid > 0) {
    return { status: 'Partially Fulfilled', amountPaidTowardsObligations: paid };
  }

  return { status: 'Open', amountPaidTowardsObligations: 0 };
}

export function computeEffectiveReceiptStatus(
  request: ReceiptRequest,
  nowIso: string
): ReceiptRequestStatus {
  if (
    request.status === 'Issued' ||
    request.status === 'Cancelled' ||
    request.status === 'Correction Required'
  ) {
    return request.status;
  }
  const deadlineMs = new Date(request.slaDeadlineAt).getTime();
  const nowMs = new Date(nowIso).getTime();
  if (!Number.isNaN(deadlineMs) && !Number.isNaN(nowMs) && nowMs > deadlineMs) {
    return 'Overdue';
  }
  return request.status;
}

export function checkDuplicateBankReference(
  bankReference: string,
  payments: Payment[],
  ignorePaymentId?: string
): boolean {
  const normalized = bankReference.trim().toUpperCase();
  if (!normalized) return false;
  return payments.some(
    (p) =>
      p.id !== ignorePaymentId &&
      p.status === 'Confirmed' &&
      p.bankReference.trim().toUpperCase() === normalized
  );
}

export function hasOverlappingActiveAgreement(
  unitId: string,
  agreements: Agreement[],
  ignoreAgreementId?: string
): boolean {
  return agreements.some(
    (a) => a.id !== ignoreAgreementId && a.unitId === unitId && a.status === 'Active'
  );
}

export interface CsvImportRowResult<T> {
  rowNumber: number;
  raw: Record<string, string>;
  status: 'Valid' | 'Warning' | 'Error';
  messages: string[];
  parsed?: T;
}

export interface ParsedTenancyRow {
  unitCode: string;
  unitName: string;
  unitType: UnitType;
  floorOrWing: string;
  firstName: string;
  lastName: string;
  alias?: string;
  phone: string;
  email: string;
  agreedRent: number;
  securityLevy: number;
  startDate: string;
  endDate: string;
  dueDate: string;
}

export interface ParsedPaymentImportRow {
  unitCode: string;
  tenantName: string;
  amount: number;
  dateReceived: string;
  method: 'Bank Transfer' | 'POS' | 'Cash' | 'Cheque' | 'Prior Manager / Handover';
  bankReference: string;
  notes: string;
}

const VALID_UNIT_TYPES: UnitType[] = [
  'Bedroom',
  'Room',
  'Room & Parlour',
  'Shop',
  'Kiosk',
  'Container Shop',
  'Other',
];

function isValidIsoDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function parseCsvText(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  };

  const headers = splitLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = cols[idx] ?? '';
    });
    rows.push(record);
  }
  return { headers, rows };
}

function normalizeSpreadsheetUnitType(rawType: string): UnitType {
  const lower = rawType.trim().toLowerCase();
  if (!lower) return 'Other';
  if (lower.includes('container')) return 'Container Shop';
  if (lower.includes('kiosk') || lower.includes('smallest')) return 'Kiosk';
  if (lower.includes('r&p') || lower.includes('parlour') || lower.includes('self-contain')) {
    return 'Room & Parlour';
  }
  if (lower.includes('shop') || lower.includes('pos')) return 'Shop';
  if (lower.includes('bedroom') || lower.includes('double') || lower.includes('&')) return 'Bedroom';
  if (lower.includes('room')) return 'Room';
  return rawType.trim() as UnitType;
}

function parseFlexibleDate(val: string): string {
  const trimmed = val.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return '';
  if (isValidIsoDate(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return trimmed;
}

export function validateTenancyCsvRows(
  rows: Record<string, string>[],
  existingUnits: Unit[],
  existingTenants: Tenant[]
): CsvImportRowResult<ParsedTenancyRow>[] {
  const seenUnitCodes = new Set<string>();
  return rows.map((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];
    const warnings: string[] = [];

    const unitCode = (raw.unitCode || raw['Unit Number'] || raw['Unit'] || '').trim();
    const unitName = (raw.unitName || raw['Unit Name'] || raw['Description'] || '').trim() || unitCode;
    const unitTypeRawStr = (raw.unitType || raw['Unit Type'] || '').trim();
    const unitTypeRaw = (VALID_UNIT_TYPES.includes(unitTypeRawStr as UnitType)
      ? unitTypeRawStr
      : unitTypeRawStr
      ? normalizeSpreadsheetUnitType(unitTypeRawStr)
      : '') as UnitType;
    const floorOrWing = (raw.floorOrWing || raw['Floor / Wing'] || 'Main Block').trim();

    let firstName = (raw.firstName || '').trim();
    let lastName = (raw.lastName || '').trim();
    const alias = (raw.alias || raw['Alias'] || raw['Known As'] || raw['Nickname'] || '').trim();
    const combinedTenant = (raw['Tenant Name'] || raw.tenantName || '').trim();
    if ((!firstName || !lastName) && combinedTenant) {
      const parts = combinedTenant.split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || (alias ? '' : '(Tenant)');
    }

    const phone = (raw.phone || raw['Phone'] || '').trim();
    const email = (raw.email || raw['Email'] || '').trim();
    const agreedRent = Number(
      (raw.agreedRent || raw['Agreed Amount per cycle'] || raw['Annual Rent'] || '')
        .replace(/[₦,\s]/g, '')
    );
    const securityLevy = Number(
      (raw.securityLevy || raw['Security Levy (4k)'] || raw['Security Levy'] || '4000')
        .replace(/[₦,\s]/g, '')
    );
    const startDate = parseFlexibleDate(raw.startDate || raw['Start Date'] || '2026-01-01');
    const endDate = parseFlexibleDate(raw.endDate || raw['End Date'] || '2026-12-31');
    const dueDate = parseFlexibleDate(raw.dueDate || raw['Renewal Due Date'] || startDate);

    // Spreadsheet cleanup diagnostics
    const sheetStatus = (raw['Status'] || '').trim().toLowerCase();
    const sheetOwed = Number((raw['Amount Owed'] || '0').replace(/[₦,\s]/g, '')) || 0;
    const sheetPaid = Number((raw['Amount Paid'] || '0').replace(/[₦,\s]/g, '')) || 0;
    if (sheetStatus.includes('fully paid') && sheetOwed > 0 && sheetPaid <= 0) {
      warnings.push(
        `Spreadsheet contradiction cleaned: status says "Fully paid" while Amount Owed is ₦${sheetOwed.toLocaleString()} and Amount Paid is ₦0.`
      );
    }
    const rawCyclesOwed = (raw['Rent cycle Owed'] || '').trim();
    if (/\d{4}\s*,\s*\d{4}/.test(rawCyclesOwed)) {
      warnings.push(`Multi-year arrears detected in spreadsheet (${rawCyclesOwed}).`);
    }
    if ((raw['Payment Date'] || '').toLowerCase().includes('aisha')) {
      warnings.push('Marked "Paying to Aisha" — review & confirm transfer receipt.');
    }

    if (!unitCode) errors.push('Missing unitCode / Unit Number');
    if (!VALID_UNIT_TYPES.includes(unitTypeRaw)) {
      errors.push(`Invalid unitType "${unitTypeRawStr}". Expected: ${VALID_UNIT_TYPES.join(', ')}`);
    }
    if (!firstName && !lastName && !alias) errors.push('Missing tenant name or alias');
    if (!Number.isFinite(agreedRent) || agreedRent <= 0) errors.push('agreedRent must be a positive number');
    if (!Number.isFinite(securityLevy) || securityLevy < 0) errors.push('securityLevy must be >= 0');
    if (!isValidIsoDate(startDate)) errors.push('startDate must be YYYY-MM-DD');
    if (!isValidIsoDate(endDate)) errors.push('endDate must be YYYY-MM-DD');
    if (!isValidIsoDate(dueDate)) errors.push('dueDate must be YYYY-MM-DD');

    if (unitCode && (existingUnits.some((u) => u.code.toLowerCase() === unitCode.toLowerCase()) || seenUnitCodes.has(unitCode.toLowerCase()))) {
      warnings.push(`Unit code "${unitCode}" already exists — review for duplicate`);
    }
    if (
      phone &&
      existingTenants.some((t) => t.phone.replace(/\s+/g, '') === phone.replace(/\s+/g, ''))
    ) {
      warnings.push(`Phone "${phone}" matches existing tenant`);
    }
    if (unitCode) seenUnitCodes.add(unitCode.toLowerCase());

    if (errors.length > 0) {
      return { rowNumber, raw, status: 'Error', messages: errors };
    }

    return {
      rowNumber,
      raw,
      status: warnings.length > 0 ? 'Warning' : 'Valid',
      messages: warnings.length > 0 ? warnings : ['Ready to import'],
      parsed: {
        unitCode,
        unitName,
        unitType: unitTypeRaw,
        floorOrWing,
        firstName,
        lastName,
        alias: alias || undefined,
        phone,
        email,
        agreedRent,
        securityLevy,
        startDate,
        endDate,
        dueDate,
      },
    };
  });
}

export function validatePaymentCsvRows(
  rows: Record<string, string>[],
  existingUnits: Unit[],
  existingPayments: Payment[]
): CsvImportRowResult<ParsedPaymentImportRow>[] {
  const seenRefs = new Set<string>();
  return rows.map((raw, idx) => {
    const rowNumber = idx + 2;
    const errors: string[] = [];
    const warnings: string[] = [];

    const unitCode = (raw.unitCode || '').trim();
    const tenantName = (raw.tenantName || '').trim();
    const amount = Number((raw.amount || '').replace(/,/g, ''));
    const dateReceived = (raw.dateReceived || '').trim();
    const methodRaw = (raw.method || 'Bank Transfer').trim();
    const bankReference = (raw.bankReference || '').trim();
    const notes = (raw.notes || 'Historical import').trim();

    if (!unitCode) errors.push('Missing unitCode');
    else if (!existingUnits.some((u) => u.code.toLowerCase() === unitCode.toLowerCase())) {
      errors.push(`Unit "${unitCode}" not found in property`);
    }
    if (!Number.isFinite(amount) || amount <= 0) errors.push('amount must be a positive number');
    if (!isValidIsoDate(dateReceived)) errors.push('dateReceived must be YYYY-MM-DD');

    const validMethods = ['Bank Transfer', 'POS', 'Cash', 'Cheque', 'Prior Manager / Handover'];
    if (!validMethods.includes(methodRaw)) {
      errors.push(`Invalid method "${methodRaw}"`);
    }

    if (bankReference) {
      const upper = bankReference.toUpperCase();
      if (
        seenRefs.has(upper) ||
        existingPayments.some((p) => p.bankReference.toUpperCase() === upper && p.status === 'Confirmed')
      ) {
        warnings.push(`Duplicate bankReference "${bankReference}"`);
      }
      seenRefs.add(upper);
    }

    if (errors.length > 0) {
      return { rowNumber, raw, status: 'Error', messages: errors };
    }

    return {
      rowNumber,
      raw,
      status: warnings.length > 0 ? 'Warning' : 'Valid',
      messages: warnings.length > 0 ? warnings : ['Ready to import'],
      parsed: {
        unitCode,
        tenantName,
        amount,
        dateReceived,
        method: methodRaw as ParsedPaymentImportRow['method'],
        bankReference,
        notes,
      },
    };
  });
}
