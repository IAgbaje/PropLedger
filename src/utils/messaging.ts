export interface TemplateVariables {
  firstName?: string;
  fullName?: string;
  unitCode?: string;
  unitName?: string;
  outstandingBalance?: string;
  dueDate?: string;
  propertyName?: string;
  managerName?: string;
  receiptNumber?: string;
  maintenanceIssue?: string;
}

export function validateEmailAddress(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function validatePhoneNumber(phone: string): boolean {
  const digits = phone.replace(/[^\d]/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function interpolateTemplate(template: string, vars: TemplateVariables): string {
  const tenantName = vars.fullName || vars.firstName || '';
  const amountDue = vars.outstandingBalance || '';
  const map: Record<string, string> = {
    firstName: vars.firstName ?? '',
    first_name: vars.firstName ?? '',
    fullName: tenantName,
    tenant_name: tenantName,
    unitCode: vars.unitCode ?? '',
    unit_code: vars.unitCode ?? '',
    unitName: vars.unitName ?? '',
    unit_name: vars.unitName ?? '',
    outstandingBalance: amountDue,
    outstanding_balance: amountDue,
    amount_due: amountDue,
    dueDate: vars.dueDate ?? '',
    due_date: vars.dueDate ?? '',
    propertyName: vars.propertyName ?? '',
    property_name: vars.propertyName ?? '',
    managerName: vars.managerName ?? '',
    manager_name: vars.managerName ?? '',
    receiptNumber: vars.receiptNumber ?? '',
    receipt_number: vars.receiptNumber ?? '',
    maintenanceIssue: vars.maintenanceIssue ?? '',
    maintenance_issue: vars.maintenanceIssue ?? '',
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    return key in map ? map[key] : match;
  });
}

export function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function encodeBase64Standard(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');
}

export function encodeMimeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) {
    return subject;
  }
  return `=?UTF-8?B?${encodeBase64Standard(subject)}?=`;
}

export function buildRfc2822MimeEmail(params: {
  from?: string;
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}): string {
  const headers: string[] = [];
  if (params.from) headers.push(`From: ${params.from}`);
  headers.push(`To: ${params.to}`);
  if (params.replyTo) headers.push(`Reply-To: ${params.replyTo}`);
  headers.push(`Subject: ${encodeMimeSubject(params.subject || 'Message from PropLedger')}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push('Content-Transfer-Encoding: base64');

  const bodyB64 = encodeBase64Standard(params.body || '');
  return `${headers.join('\r\n')}\r\n\r\n${bodyB64}`;
}

export function buildMailtoHref(params: {
  to: string;
  subject?: string;
  body?: string;
}): string {
  const query = new URLSearchParams();
  if (params.subject) query.set('subject', params.subject);
  if (params.body) query.set('body', params.body);
  const qs = query.toString().replace(/\+/g, '%20');
  return `mailto:${encodeURIComponent(params.to.trim())}${qs ? `?${qs}` : ''}`;
}

export function calculateSmsSegments(text: string): {
  length: number;
  segments: number;
  encoding: 'GSM-7' | 'UCS-2';
} {
  const length = text.length;
  if (length === 0) {
    return { length: 0, segments: 0, encoding: 'GSM-7' };
  }
  // Naira symbol (₦) and emojis force UCS-2 encoding in carrier gateways
  const isGsm7 = /^[\x0A\x0D\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]*$/.test(text);
  const encoding = isGsm7 ? 'GSM-7' : 'UCS-2';
  const singleLimit = isGsm7 ? 160 : 70;
  const multiLimit = isGsm7 ? 153 : 67;
  const segments = length <= singleLimit ? 1 : Math.ceil(length / multiLimit);
  return { length, segments, encoding };
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number(n) || 0);
  return h * 60 + m;
}

export function isWithinQuietHours(
  dateOrIso: string,
  startHHMM: string,
  endHHMM: string
): boolean {
  let mins = 0;
  if (/^\d{2}:\d{2}$/.test(dateOrIso)) {
    mins = parseMinutes(dateOrIso);
  } else {
    const dt = new Date(dateOrIso);
    if (Number.isNaN(dt.getTime())) return false;
    mins = dt.getHours() * 60 + dt.getMinutes();
  }
  const start = parseMinutes(startHHMM);
  const end = parseMinutes(endHHMM);
  if (start === end) return false;
  if (start < end) {
    return mins >= start && mins < end;
  }
  // Wraps midnight (e.g. 20:00 to 07:00)
  return mins >= start || mins < end;
}

export function isScheduleDue(scheduledAtIso: string, nowMs: number = Date.now()): boolean {
  const targetMs = Date.parse(scheduledAtIso);
  if (Number.isNaN(targetMs)) return false;
  return nowMs >= targetMs;
}
