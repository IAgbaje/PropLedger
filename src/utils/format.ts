export function formatNaira(amount: number, showDecimals = false): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(abs);
  return amount < 0 ? `-₦${formatted}` : `₦${formatted}`;
}

export function sanitizeCurrencyInput(input: string): string {
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (!cleaned) return '';

  const dotIdx = cleaned.indexOf('.');
  let intPart = dotIdx === -1 ? cleaned : cleaned.slice(0, dotIdx);
  const hasDecimal = dotIdx !== -1;
  let decPart = dotIdx === -1 ? '' : cleaned.slice(dotIdx + 1).replace(/\./g, '');

  if (decPart.length > 2) {
    decPart = decPart.slice(0, 2);
  }

  if (intPart === '' && hasDecimal) {
    intPart = '0';
  } else if (intPart.length > 1) {
    intPart = intPart.replace(/^0+/, '') || '0';
  }

  return hasDecimal ? `${intPart}.${decPart}` : intPart;
}

export function formatAccountingDisplay(value: string | number | null | undefined): string {
  if (value === '' || value === null || value === undefined) return '';
  const raw =
    typeof value === 'number'
      ? Number.isFinite(value)
        ? String(value)
        : ''
      : sanitizeCurrencyInput(value);
  if (!raw) return '';

  const dotIdx = raw.indexOf('.');
  const intPart = dotIdx === -1 ? raw : raw.slice(0, dotIdx);
  const hasDecimal = dotIdx !== -1;
  const decPart = dotIdx === -1 ? '' : raw.slice(dotIdx + 1);

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return hasDecimal ? `${formattedInt}.${decPart}` : formattedInt;
}

export function parseCurrencyValue(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (!value) return 0;
  const cleaned = sanitizeCurrencyInput(value);
  if (!cleaned || cleaned === '.') return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function countSignificantCurrencyChars(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      count++;
    }
  }
  return count;
}

export function caretOffsetForSignificantCount(formatted: string, targetCount: number): number {
  if (targetCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    const ch = formatted[i];
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      seen++;
      if (seen === targetCount) {
        return i + 1;
      }
    }
  }
  return formatted.length;
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '—';
  const datePart = dateStr.slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

export interface TenantNameLike {
  firstName?: string;
  lastName?: string;
  alias?: string;
}

export function getTenantLegalName(tenant?: TenantNameLike | null): string {
  if (!tenant) return '';
  return [tenant.firstName?.trim(), tenant.lastName?.trim()].filter(Boolean).join(' ');
}

export function formatTenantName(
  tenant?: TenantNameLike | null,
  options?: { includeAlias?: boolean }
): string {
  if (!tenant) return 'Unknown Tenant';
  const legal = getTenantLegalName(tenant);
  const alias = tenant.alias?.trim();
  if (legal && alias && options?.includeAlias !== false) {
    return `${legal} (${alias})`;
  }
  return legal || alias || 'Unknown Tenant';
}

export function formatDateTimeShort(isoStr: string): string {
  if (!isoStr) return '—';
  const dt = new Date(isoStr);
  if (Number.isNaN(dt.getTime())) return isoStr;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
}

export function formatPaymentTimestamp(dateReceived: string, timeReceived?: string): string {
  const datePart = formatDateShort(dateReceived);
  const timeTrim = timeReceived?.trim();
  return timeTrim ? `${datePart} · ${timeTrim}` : datePart;
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
