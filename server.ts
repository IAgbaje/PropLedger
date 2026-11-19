import 'dotenv/config';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import nodemailer from 'nodemailer';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  buildBulkSmsBalanceRequest,
  buildBulkSmsReportRequest,
  buildBulkSmsSendRequest,
  formatBulkSmsSendTime,
  mapBulkSmsResponseStatus,
  resolveBulkSmsConfig,
} from './src/utils/bulksmslive';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim() || '';
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER?.trim() || '';
  const pass = process.env.SMTP_PASS?.trim() || '';
  const from = process.env.SMTP_FROM?.trim() || user;
  const configured = Boolean(host && user && pass);
  return { configured, host, port, secure, user, pass, from };
}

function getSmsWebhookConfig() {
  const url = process.env.SMS_WEBHOOK_URL?.trim() || '';
  const token = process.env.SMS_WEBHOOK_TOKEN?.trim() || '';
  return { configured: Boolean(url), url, token };
}

function encodeBase64Standard(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64');
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function encodeMimeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) {
    return subject;
  }
  return `=?UTF-8?B?${encodeBase64Standard(subject)}?=`;
}

function buildRfc2822MimeEmail(params: {
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

function extractErrorDetails(err: unknown): { status: number; message: string } {
  if (err && typeof err === 'object') {
    const anyErr = err as { status?: number; code?: number | string; message?: string };
    const status =
      typeof anyErr.status === 'number' && anyErr.status >= 400 && anyErr.status < 600
        ? anyErr.status
        : 500;
    const message = anyErr.message || 'Upstream service request failed.';
    return { status, message };
  }
  return { status: 500, message: String(err || 'Unknown server error') };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Integration readiness status (never exposes secrets)
  app.get('/api/integrations/status', (_req: Request, res: Response) => {
    const smtp = getSmtpConfig();
    const smsWebhook = getSmsWebhookConfig();
    const bulkSms = resolveBulkSmsConfig(process.env);
    const aiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
    const smsProvider = bulkSms.configured
      ? 'BulkSMSLive'
      : smsWebhook.configured
      ? 'Webhook'
      : 'Ledger Only';
    res.json({
      aiConfigured,
      aiModel: 'gemini-4-hydrogen',
      smtpConfigured: smtp.configured,
      smtpHost: smtp.configured ? smtp.host : undefined,
      smtpFrom: smtp.configured ? smtp.from : undefined,
      smsWebhookConfigured: bulkSms.configured || smsWebhook.configured,
      smsProvider,
      bulkSmsConfigured: bulkSms.configured,
      bulkSmsAuthMode: bulkSms.authMode,
      bulkSmsSenderName: bulkSms.senderName,
    });
  });

  // Gemini AI: Draft or Polish SMS & Email message
  app.post('/api/ai/draft-message', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured on the server. Configure the API key in Settings > Secrets to enable AI drafting.',
      });
      return;
    }

    try {
      const {
        mode = 'generate',
        intent = 'General Notice',
        tone = 'Professional & Polite',
        instruction = '',
        existingSubject = '',
        existingEmailBody = '',
        existingSmsBody = '',
        recipientContext = {},
        propertyContext = {},
      } = req.body ?? {};

      const systemInstruction = `You are a concise, accurate Nigerian commercial & residential property operations assistant writing communications on behalf of "${propertyContext.propertyName || "AgbaSaffy's Court"}" managed by ${propertyContext.managerName || 'Ibraheem Agbaje'}.
Rules:
- Format Nigerian Naira amounts cleanly with ₦ and commas (e.g. ₦2,400,000).
- Keep Email body structured, clear, respectful, and ready to send without placeholder brackets unless intentional template tokens ({{firstName}}, {{unitCode}}, {{outstandingBalance}}, {{dueDate}}, {{propertyName}}) were requested for multi-recipient mail merge.
- Keep SMS body punchy (ideally under 155 characters when possible) while preserving the key facts, amounts, and call to action.
- Never invent payment confirmations or legal filings that were not provided in the context.
- Match the requested tone cleanly: "${tone}".`;

      const prompt =
        mode === 'polish'
          ? `Polish and improve this existing draft without losing facts or requested template variables.
Intent: ${intent}
Tone: ${tone}
Additional instruction: ${instruction || 'Make it clearer, warmer, and executive-ready.'}
Property context: ${JSON.stringify(propertyContext)}
Recipient context: ${JSON.stringify(recipientContext)}
Current Subject: ${existingSubject}
Current Email Body:\n${existingEmailBody}
Current SMS Body:\n${existingSmsBody}`
          : `Draft both a tailored Email (with subject and body) and a concise SMS message for the property manager.
Intent / Purpose: ${intent}
Tone: ${tone}
Manager's Custom Instruction: ${instruction || 'Create a clear, helpful message suited to the recipient context.'}
Property context: ${JSON.stringify(propertyContext)}
Recipient context: ${JSON.stringify(recipientContext)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: {
                type: Type.STRING,
                description: 'Concise email subject line.',
              },
              emailBody: {
                type: Type.STRING,
                description: 'Complete plain-text email body ready to send.',
              },
              smsBody: {
                type: Type.STRING,
                description: 'Concise SMS message body (ideally <= 160 chars).',
              },
              recommendedScheduleNote: {
                type: Type.STRING,
                description: 'Short practical recommendation on timing or follow-up (e.g. send during morning business hours).',
              },
              toneUsed: {
                type: Type.STRING,
                description: 'The tone applied in the generated copy.',
              },
            },
            required: ['subject', 'emailBody', 'smsBody', 'recommendedScheduleNote', 'toneUsed'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Gemini returned an empty response.' });
        return;
      }

      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  // Gemini AI: Suggest prioritized follow-ups from live property ledger
  app.post('/api/ai/suggest-followups', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured on the server. Configure the API key in Settings > Secrets to enable AI follow-up recommendations.',
      });
      return;
    }

    try {
      const { propertyContext = {}, openArrears = [], breachedCommitments = [], overdueReceipts = [] } =
        req.body ?? {};

      const prompt = `Analyze this property's current operational state for ${propertyContext.propertyName || "AgbaSaffy's Court"} (reference date: ${propertyContext.referenceDate || 'today'}, manager: ${propertyContext.managerName || 'Ibraheem Agbaje'}) and recommend up to 4 high-impact Email/SMS follow-ups (spanning overdue tenants, breached promises, overdue receipt issuers, or lawyer escalation where warranted).

Open/Overdue Arrears: ${JSON.stringify(openArrears)}
Breached Commitments: ${JSON.stringify(breachedCommitments)}
Overdue Receipt Requests: ${JSON.stringify(overdueReceipts)}

Return actionable, ready-to-review message drafts referencing only the IDs and facts supplied above.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a property finance & collections operations assistant. Produce practical, grounded follow-up recommendations ordered by urgency.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    priority: { type: Type.STRING, description: 'High, Medium, or Normal' },
                    targetType: { type: Type.STRING, description: 'Tenant, Lawyer, or Receipt Issuer' },
                    targetId: { type: Type.STRING, description: 'Exact tenantId or contactId from input if applicable' },
                    recipientName: { type: Type.STRING },
                    unitCode: { type: Type.STRING },
                    recommendedChannels: { type: Type.STRING, description: 'Email, SMS, or Email + SMS' },
                    rationale: { type: Type.STRING },
                    subject: { type: Type.STRING },
                    emailBody: { type: Type.STRING },
                    smsBody: { type: Type.STRING },
                  },
                  required: [
                    'priority',
                    'targetType',
                    'recipientName',
                    'recommendedChannels',
                    'rationale',
                    'subject',
                    'emailBody',
                    'smsBody',
                  ],
                },
              },
            },
            required: ['suggestions'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Gemini returned an empty follow-up analysis.' });
        return;
      }
      res.json(JSON.parse(rawText));
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  // Gmail API send proxy (requires client-obtained Bearer OAuth token)
  app.post('/api/integrations/gmail/send', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Missing Gmail OAuth Bearer token. Please Sign in with Google first.',
      });
      return;
    }

    const { from, to, subject, body, replyTo } = req.body ?? {};
    if (!to || typeof to !== 'string' || !body || typeof body !== 'string') {
      res.status(400).json({ error: 'Valid recipient email ("to") and "body" are required.' });
      return;
    }

    try {
      const mime = buildRfc2822MimeEmail({
        from: typeof from === 'string' && from.trim() ? from.trim() : undefined,
        to: to.trim(),
        subject: typeof subject === 'string' && subject.trim() ? subject.trim() : 'Message from PropLedger',
        body,
        replyTo: typeof replyTo === 'string' && replyTo.trim() ? replyTo.trim() : undefined,
      });

      const raw = encodeBase64Url(mime);
      const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      });

      const payload = (await gmailRes.json().catch(() => ({}))) as {
        id?: string;
        threadId?: string;
        error?: { message?: string; status?: string };
      };

      if (!gmailRes.ok) {
        res.status(gmailRes.status).json({
          error: payload?.error?.message || `Gmail API rejected request (${gmailRes.status}).`,
          needsReauth: gmailRes.status === 401 || gmailRes.status === 403,
        });
        return;
      }

      res.json({
        ok: true,
        provider: 'Gmail',
        messageId: payload.id,
        threadId: payload.threadId,
      });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  // Server SMTP verify
  app.post('/api/integrations/smtp/verify', async (_req: Request, res: Response) => {
    const smtp = getSmtpConfig();
    if (!smtp.configured) {
      res.status(400).json({
        ok: false,
        error:
          'Server SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables to enable Outlook/Office 365/Zoho/Custom SMTP auto-dispatch.',
      });
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
      });
      await transporter.verify();
      res.json({ ok: true, host: smtp.host, from: smtp.from });
    } catch (err) {
      const { message } = extractErrorDetails(err);
      res.status(502).json({ ok: false, error: message });
    }
  });

  // Server SMTP send (supports automated background & scheduled dispatch)
  app.post('/api/integrations/smtp/send', async (req: Request, res: Response) => {
    const smtp = getSmtpConfig();
    if (!smtp.configured) {
      res.status(503).json({
        error:
          'Server SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing). Connect Gmail or configure SMTP environment variables.',
      });
      return;
    }

    const { to, subject, body, replyTo } = req.body ?? {};
    if (!to || typeof to !== 'string' || !body || typeof body !== 'string') {
      res.status(400).json({ error: 'Valid recipient email ("to") and "body" are required.' });
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
      });

      const info = await transporter.sendMail({
        from: smtp.from,
        to: to.trim(),
        replyTo: typeof replyTo === 'string' && replyTo.trim() ? replyTo.trim() : undefined,
        subject: typeof subject === 'string' && subject.trim() ? subject.trim() : 'Message from PropLedger',
        text: body,
      });

      res.json({
        ok: true,
        provider: 'SMTP',
        messageId: info.messageId,
      });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  // SMS Dispatch: BulkSMSLive HTTP API v2.0 (primary) -> Webhook fallback -> Ledger mode
  app.post('/api/integrations/sms/send', async (req: Request, res: Response) => {
    const { to, message, reference, sender, sendtime } = req.body ?? {};
    if (!to || typeof to !== 'string' || !message || typeof message !== 'string') {
      res.status(400).json({ error: 'Valid recipient phone ("to") and "message" are required.' });
      return;
    }

    const bulkSms = resolveBulkSmsConfig(process.env);
    if (bulkSms.configured) {
      try {
        const scheduledSendTime = formatBulkSmsSendTime(
          typeof sendtime === 'string' ? sendtime : undefined
        );
        const built = buildBulkSmsSendRequest(bulkSms, {
          to,
          message,
          sender: typeof sender === 'string' && sender.trim() ? sender.trim() : undefined,
          sendtime: typeof sendtime === 'string' ? sendtime : undefined,
        });

        const smsRes = await fetch(built.url, {
          method: 'POST',
          headers: built.headers,
          body: JSON.stringify(built.body),
        });

        const payload = (await smsRes.json().catch(() => ({}))) as Record<string, unknown>;
        const mapped = mapBulkSmsResponseStatus(payload, smsRes.status);

        if (!mapped.ok) {
          res.status(mapped.httpStatus).json({
            error: mapped.message,
            code: mapped.code,
            needsReauth: mapped.needsReauth,
          });
          return;
        }

        const msgidRaw = payload.msgid ?? payload.Msgid ?? payload.messageId ?? payload.id;
        res.json({
          ok: true,
          gatewayConfigured: true,
          provider: 'BulkSMSLive',
          messageId: msgidRaw ? String(msgidRaw) : `bsl-${Date.now().toString(36)}`,
          units: payload.units ?? payload.Units,
          balance: payload.balance ?? payload.Balance,
          scheduledSendTime,
          note: mapped.message,
        });
        return;
      } catch (err) {
        const { status, message: errMsg } = extractErrorDetails(err);
        res.status(status).json({ error: errMsg });
        return;
      }
    }

    const smsConfig = getSmsWebhookConfig();
    if (!smsConfig.configured) {
      res.json({
        ok: true,
        gatewayConfigured: false,
        provider: 'Ledger Only',
        messageId: `ledger-sms-${Date.now().toString(36)}`,
        note: 'No BULKSMSLIVE_API_KEY / SMS_WEBHOOK_URL configured on server; logged in PropLedger dispatch ledger.',
      });
      return;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (smsConfig.token) {
        headers.Authorization = `Bearer ${smsConfig.token}`;
      }

      const gwRes = await fetch(smsConfig.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: to.trim(),
          message,
          sendtime: typeof sendtime === 'string' ? sendtime : undefined,
          reference: reference || `propledger-${Date.now().toString(36)}`,
          sender: sender || 'PropLedger',
        }),
      });

      const gwBody = (await gwRes.json().catch(() => ({}))) as {
        id?: string;
        messageId?: string;
        error?: string;
      };

      if (!gwRes.ok) {
        res.status(gwRes.status).json({
          error: gwBody?.error || `SMS gateway returned HTTP ${gwRes.status}.`,
        });
        return;
      }

      res.json({
        ok: true,
        gatewayConfigured: true,
        provider: 'SMS Gateway',
        messageId: gwBody.messageId || gwBody.id || `sms-${Date.now().toString(36)}`,
      });
    } catch (err) {
      const { status, message: errMsg } = extractErrorDetails(err);
      res.status(status).json({ error: errMsg });
    }
  });

  // BulkSMSLive Credit Balance check
  app.get('/api/integrations/sms/balance', async (_req: Request, res: Response) => {
    const bulkSms = resolveBulkSmsConfig(process.env);
    if (!bulkSms.configured) {
      res.status(400).json({
        ok: false,
        configured: false,
        error:
          'BulkSMSLive is not configured yet. Add BULKSMSLIVE_API_KEY (or BULKSMSLIVE_EMAIL & BULKSMSLIVE_PASSWORD) in Settings > Secrets.',
      });
      return;
    }

    try {
      const built = buildBulkSmsBalanceRequest(bulkSms);
      const balRes = await fetch(built.url, {
        method: 'POST',
        headers: built.headers,
        body: JSON.stringify(built.body),
      });
      const payload = (await balRes.json().catch(() => ({}))) as Record<string, unknown>;
      const mapped = mapBulkSmsResponseStatus(payload, balRes.status);
      if (!mapped.ok) {
        res.status(mapped.httpStatus).json({ ok: false, error: mapped.message });
        return;
      }
      res.json({
        ok: true,
        configured: true,
        balance: payload.balance ?? payload.Balance ?? 0,
        msg: mapped.message,
      });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ ok: false, error: message });
    }
  });

  // BulkSMSLive Delivery Report (DLR) check
  app.post('/api/integrations/sms/report', async (req: Request, res: Response) => {
    const bulkSms = resolveBulkSmsConfig(process.env);
    if (!bulkSms.configured) {
      res.status(400).json({
        ok: false,
        error: 'BulkSMSLive credentials are not configured on the server.',
      });
      return;
    }

    const { msgids, sender, page } = req.body ?? {};
    try {
      const built = buildBulkSmsReportRequest(bulkSms, {
        msgids: typeof msgids === 'string' && msgids.trim() ? msgids.trim() : undefined,
        sender: typeof sender === 'string' && sender.trim() ? sender.trim() : undefined,
        page: typeof page === 'number' ? page : undefined,
      });
      const dlrRes = await fetch(built.url, {
        method: 'POST',
        headers: built.headers,
        body: JSON.stringify(built.body),
      });
      const payload = (await dlrRes.json().catch(() => ({}))) as Record<string, unknown>;
      const mapped = mapBulkSmsResponseStatus(payload, dlrRes.status);
      if (!mapped.ok) {
        res.status(mapped.httpStatus).json({ ok: false, error: mapped.message });
        return;
      }
      res.json({
        ok: true,
        msg: mapped.message,
        reports: Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.reports)
          ? payload.reports
          : payload.data || payload,
      });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ ok: false, error: message });
    }
  });

  // Google Calendar API v3: List PropLedger due-date reminders on user's primary calendar
  app.get('/api/integrations/calendar/events', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Missing Google OAuth Bearer token. Please Sign in with Google first.',
        needsReauth: true,
      });
      return;
    }

    try {
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.searchParams.set('privateExtendedProperty', 'propledgerSource=propledger');
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '150');

      const calRes = await fetch(url.toString(), {
        headers: { Authorization: authHeader },
      });
      const payload = (await calRes.json().catch(() => ({}))) as {
        items?: Array<Record<string, unknown>>;
        error?: { message?: string };
      };

      if (!calRes.ok) {
        res.status(calRes.status).json({
          error: payload?.error?.message || `Google Calendar API returned HTTP ${calRes.status}.`,
          needsReauth: calRes.status === 401 || calRes.status === 403,
        });
        return;
      }

      const events = (payload.items || []).map((ev) => {
        const ext = (ev.extendedProperties as { private?: Record<string, string> } | undefined)?.private;
        return {
          id: String(ev.id || ''),
          summary: String(ev.summary || ''),
          status: String(ev.status || 'confirmed'),
          htmlLink: typeof ev.htmlLink === 'string' ? ev.htmlLink : undefined,
          start: ev.start,
          end: ev.end,
          propledgerKey: ext?.propledgerKey,
          tenantId: ext?.tenantId,
          amountNaira: ext?.amountNaira,
        };
      });

      res.json({ ok: true, events });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  // Google Calendar API v3: Create or update due-date reminder event on user's primary calendar
  app.post('/api/integrations/calendar/events', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Missing Google OAuth Bearer token. Please Sign in with Google first.',
        needsReauth: true,
      });
      return;
    }

    const { existingEventId, event } = req.body ?? {};
    if (!event || typeof event !== 'object' || !event.summary || !event.start || !event.end) {
      res.status(400).json({ error: 'Valid Google Calendar event payload is required.' });
      return;
    }

    try {
      const isUpdate = typeof existingEventId === 'string' && existingEventId.trim().length > 0;
      const endpoint = isUpdate
        ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
            existingEventId.trim()
          )}`
        : 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

      const calRes = await fetch(endpoint, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: event.summary,
          location: event.location,
          description: event.description,
          start: event.start,
          end: event.end,
          reminders: event.reminders,
          extendedProperties: event.extendedProperties,
        }),
      });

      const payload = (await calRes.json().catch(() => ({}))) as {
        id?: string;
        htmlLink?: string;
        summary?: string;
        error?: { message?: string };
      };

      if (!calRes.ok) {
        res.status(calRes.status).json({
          error: payload?.error?.message || `Google Calendar API returned HTTP ${calRes.status}.`,
          needsReauth: calRes.status === 401 || calRes.status === 403,
        });
        return;
      }

      res.json({
        ok: true,
        action: isUpdate ? 'updated' : 'created',
        id: payload.id,
        htmlLink: payload.htmlLink,
        summary: payload.summary,
      });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  // Google Calendar API v3: Delete a synced due-date reminder event
  app.delete('/api/integrations/calendar/events/:eventId', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Missing Google OAuth Bearer token. Please Sign in with Google first.',
        needsReauth: true,
      });
      return;
    }

    const eventId = String(req.params.eventId || '').trim();
    if (!eventId) {
      res.status(400).json({ error: 'Calendar event ID is required.' });
      return;
    }

    try {
      const calRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(
          eventId
        )}`,
        {
          method: 'DELETE',
          headers: { Authorization: authHeader },
        }
      );

      if (!calRes.ok && calRes.status !== 204 && calRes.status !== 404 && calRes.status !== 410) {
        const payload = (await calRes.json().catch(() => ({}))) as { error?: { message?: string } };
        res.status(calRes.status).json({
          error: payload?.error?.message || `Failed removing calendar event (${calRes.status}).`,
          needsReauth: calRes.status === 401 || calRes.status === 403,
        });
        return;
      }

      res.json({ ok: true, deletedEventId: eventId });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PropLedger server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PropLedger server:', err);
  process.exit(1);
});
