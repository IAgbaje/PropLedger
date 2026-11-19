import { buildMailtoHref, buildRfc2822MimeEmail } from './messaging';
import type { GoogleCalendarEventPayload, SyncedCalendarEvent } from './googleCalendar';

export interface ServerIntegrationStatus {
  aiConfigured: boolean;
  aiModel: string;
  smtpConfigured: boolean;
  smtpHost?: string;
  smtpFrom?: string;
  smsWebhookConfigured: boolean;
  smsProvider?: 'BulkSMSLive' | 'Webhook' | 'Ledger Only';
  bulkSmsConfigured?: boolean;
  bulkSmsAuthMode?: 'api_key' | 'credentials';
  bulkSmsSenderName?: string;
}

export interface AiDraftRequest {
  mode: 'generate' | 'polish';
  intent: string;
  tone: string;
  instruction?: string;
  existingSubject?: string;
  existingEmailBody?: string;
  existingSmsBody?: string;
  recipientContext?: Record<string, unknown>;
  propertyContext?: Record<string, unknown>;
}

export interface AiDraftResponse {
  subject: string;
  emailBody: string;
  smsBody: string;
  recommendedScheduleNote: string;
  toneUsed: string;
}

export interface AiFollowUpSuggestion {
  priority: 'High' | 'Medium' | 'Normal';
  targetType: 'Tenant' | 'Lawyer' | 'Receipt Issuer';
  targetId?: string;
  recipientName: string;
  unitCode?: string;
  recommendedChannels: string;
  rationale: string;
  subject: string;
  emailBody: string;
  smsBody: string;
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export async function fetchIntegrationStatus(): Promise<ServerIntegrationStatus> {
  const res = await fetch('/api/integrations/status');
  return parseJsonOrThrow<ServerIntegrationStatus>(res);
}

export async function generateAiMessageDraft(payload: AiDraftRequest): Promise<AiDraftResponse> {
  const res = await fetch('/api/ai/draft-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<AiDraftResponse>(res);
}

export async function fetchAiFollowUpSuggestions(payload: {
  propertyContext: Record<string, unknown>;
  openArrears: Array<Record<string, unknown>>;
  breachedCommitments: Array<Record<string, unknown>>;
  overdueReceipts: Array<Record<string, unknown>>;
}): Promise<{ suggestions: AiFollowUpSuggestion[] }> {
  const res = await fetch('/api/ai/suggest-followups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow<{ suggestions: AiFollowUpSuggestion[] }>(res);
}

export async function sendEmailViaGmail(
  accessToken: string,
  payload: { from?: string; to: string; subject: string; body: string; replyTo?: string }
): Promise<{ ok: boolean; provider: 'Gmail'; messageId?: string; threadId?: string }> {
  const res = await fetch('/api/integrations/gmail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res);
}

export async function verifyServerSmtp(): Promise<{ ok: boolean; host?: string; from?: string; error?: string }> {
  const res = await fetch('/api/integrations/smtp/verify', { method: 'POST' });
  const data = (await res.json().catch(() => ({}))) as {
    ok: boolean;
    host?: string;
    from?: string;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error || `Verification failed (${res.status})` };
  }
  return data;
}

export async function sendEmailViaSmtp(payload: {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}): Promise<{ ok: boolean; provider: 'SMTP'; messageId?: string }> {
  const res = await fetch('/api/integrations/smtp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res);
}

export async function sendSmsViaGateway(payload: {
  to: string;
  message: string;
  reference?: string;
  sender?: string;
  sendtime?: string;
}): Promise<{
  ok: boolean;
  gatewayConfigured: boolean;
  provider: 'BulkSMSLive' | 'SMS Gateway' | 'Ledger Only';
  messageId?: string;
  units?: number | string;
  balance?: number | string;
  scheduledSendTime?: string;
  note?: string;
}> {
  const res = await fetch('/api/integrations/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res);
}

export async function fetchBulkSmsBalance(): Promise<{
  ok: boolean;
  configured: boolean;
  balance?: number | string;
  msg?: string;
  error?: string;
}> {
  const res = await fetch('/api/integrations/sms/balance');
  const data = (await res.json().catch(() => ({}))) as {
    ok: boolean;
    configured?: boolean;
    balance?: number | string;
    msg?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      configured: Boolean(data.configured),
      error: data.error || `Failed fetching balance (${res.status})`,
    };
  }
  return { ok: true, configured: true, balance: data.balance, msg: data.msg };
}

export async function fetchBulkSmsDeliveryReport(params: {
  msgids?: string;
  sender?: string;
  page?: number;
}): Promise<{
  ok: boolean;
  msg?: string;
  reports?: unknown;
}> {
  const res = await fetch('/api/integrations/sms/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow(res);
}

export async function fetchSyncedCalendarEvents(
  accessToken: string
): Promise<{ ok: boolean; events: SyncedCalendarEvent[] }> {
  const res = await fetch('/api/integrations/calendar/events', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseJsonOrThrow(res);
}

export async function syncCalendarReminderEvent(
  accessToken: string,
  payload: { existingEventId?: string; event: GoogleCalendarEventPayload }
): Promise<{
  ok: boolean;
  action: 'created' | 'updated';
  id?: string;
  htmlLink?: string;
  summary?: string;
}> {
  const res = await fetch('/api/integrations/calendar/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res);
}

export async function deleteCalendarReminderEvent(
  accessToken: string,
  eventId: string
): Promise<{ ok: boolean; deletedEventId: string }> {
  const res = await fetch(
    `/api/integrations/calendar/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  return parseJsonOrThrow(res);
}

export function downloadEmlFile(params: {
  from?: string;
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  filename?: string;
}): void {
  const mime = buildRfc2822MimeEmail(params);
  const blob = new Blob([mime], { type: 'message/rfc822;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    params.filename ||
    `propledger-draft-${(params.to || 'recipient').replace(/[^a-z0-9@._-]/gi, '_')}.eml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openMailClientDraft(params: { to: string; subject?: string; body?: string }): void {
  const href = buildMailtoHref(params);
  const a = document.createElement('a');
  a.href = href;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
