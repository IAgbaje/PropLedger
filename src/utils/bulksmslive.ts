export type BulkSmsAuthMode = 'api_key' | 'credentials';

export interface BulkSmsConfig {
  configured: boolean;
  authMode?: BulkSmsAuthMode;
  apiKey: string;
  email: string;
  password: string;
  senderName: string;
  forcednd: '0' | '1';
}

export interface BulkSmsStatusMapping {
  ok: boolean;
  httpStatus: number;
  code: number;
  message: string;
  needsReauth?: boolean;
}

/**
 * BulkSMSLive strictly caps Sender_name at 11 characters (alphanumeric/short label).
 */
export function sanitizeSenderName(raw?: string | null): string {
  const cleaned = (raw ?? '')
    .trim()
    .replace(/[^\w.\- ]+/g, '')
    .trim();
  if (!cleaned) return 'PropLedger';
  return cleaned.slice(0, 11).trim() || 'PropLedger';
}

/**
 * Normalizes Nigerian/international phone numbers into BulkSMSLive 234803... format.
 * Supports single numbers or comma/semicolon-separated recipient strings.
 */
export function normalizeNigerianPhoneForBulkSms(rawInput: string): string {
  const parts = rawInput
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const normalized = parts
    .map((part) => {
      const hasPlus = part.startsWith('+');
      let digits = part.replace(/[^\d]/g, '');
      if (!digits) return '';

      // Handle leading 00 international prefix (e.g. 00234...)
      if (!hasPlus && digits.startsWith('00')) {
        digits = digits.slice(2);
      }

      // Nigerian local format: 0803..., 0701..., 0909..., 0812... (11 digits starting with 0)
      if (digits.length === 11 && digits.startsWith('0') && /^[789]/.test(digits.slice(1, 2))) {
        return `234${digits.slice(1)}`;
      }
      // Missing leading zero Nigerian mobile (e.g. 8031012001 -> 10 digits starting with 7/8/9)
      if (digits.length === 10 && /^[789]/.test(digits.slice(0, 1))) {
        return `234${digits}`;
      }
      return digits;
    })
    .filter(Boolean);

  return Array.from(new Set(normalized)).join(',');
}

/**
 * Formats an ISO timestamp or date string into BulkSMSLive WAT (Africa/Lagos UTC+1) schedule format
 * "YYYY-MM-DD HH:mm:ss" when strictly in the future relative to nowMs.
 */
export function formatBulkSmsSendTime(
  rawSendTime?: string | null,
  nowMs: number = Date.now()
): string | undefined {
  if (!rawSendTime || !rawSendTime.trim()) return undefined;
  const trimmed = rawSendTime.trim();

  // If already in "YYYY-MM-DD HH:mm" or "YYYY-MM-DD HH:mm:ss" format, validate future in WAT
  const parsedMs = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)
    ? Date.parse(`${trimmed.replace(' ', 'T')}+01:00`)
    : Date.parse(trimmed);

  if (Number.isNaN(parsedMs)) return undefined;
  if (parsedMs <= nowMs + 60_000) return undefined;

  // Format in WAT (UTC+1, fixed offset, Nigeria does not observe DST)
  const wat = new Date(parsedMs + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yr = wat.getUTCFullYear();
  const mo = pad(wat.getUTCMonth() + 1);
  const dy = pad(wat.getUTCDate());
  const hr = pad(wat.getUTCHours());
  const mn = pad(wat.getUTCMinutes());
  const sc = pad(wat.getUTCSeconds());
  return `${yr}-${mo}-${dy} ${hr}:${mn}:${sc}`;
}

export function resolveBulkSmsConfig(
  env: Record<string, string | undefined>
): BulkSmsConfig {
  const apiKey = (env.BULKSMSLIVE_API_KEY || '').trim();
  const email = (env.BULKSMSLIVE_EMAIL || '').trim();
  const password = (env.BULKSMSLIVE_PASSWORD || '').trim();
  const senderName = sanitizeSenderName(env.BULKSMSLIVE_SENDER_NAME);
  const forcednd = (env.BULKSMSLIVE_FORCEDND || '1').trim() === '0' ? '0' : '1';

  if (apiKey) {
    return {
      configured: true,
      authMode: 'api_key',
      apiKey,
      email,
      password,
      senderName,
      forcednd,
    };
  }
  if (email && password) {
    return {
      configured: true,
      authMode: 'credentials',
      apiKey: '',
      email,
      password,
      senderName,
      forcednd,
    };
  }
  return {
    configured: false,
    apiKey: '',
    email: '',
    password: '',
    senderName,
    forcednd,
  };
}

export function buildBulkSmsSendRequest(
  config: BulkSmsConfig,
  params: {
    to: string;
    message: string;
    sender?: string;
    sendtime?: string;
    forcednd?: '0' | '1';
    nowMs?: number;
  }
): { url: string; headers: Record<string, string>; body: Record<string, string> } {
  const recipients = normalizeNigerianPhoneForBulkSms(params.to);
  if (!recipients) {
    throw new Error('No valid recipient phone number provided for BulkSMSLive.');
  }
  const senderName = sanitizeSenderName(params.sender || config.senderName);
  const formattedSendTime = formatBulkSmsSendTime(params.sendtime, params.nowMs);
  const forcednd = params.forcednd || config.forcednd;

  if (config.authMode === 'api_key' && config.apiKey) {
    const body: Record<string, string> = {
      Message: params.message,
      Sender_name: senderName,
      Recipients: recipients,
      Forcednd: forcednd,
    };
    if (formattedSendTime) {
      body.sendtime = formattedSendTime;
    }
    return {
      url: 'https://api.bulksmslive.com/v2/app/sendsms',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
    };
  }

  const body: Record<string, string> = {
    email: config.email,
    password: config.password,
    message: params.message,
    sender_name: senderName,
    recipients,
    forcednd,
  };
  if (formattedSendTime) {
    body.sendtime = formattedSendTime;
  }

  return {
    url: 'https://api.bulksmslive.com/v2/app/sms',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body,
  };
}

export function buildBulkSmsBalanceRequest(config: BulkSmsConfig): {
  url: string;
  headers: Record<string, string>;
  body: Record<string, string>;
} {
  if (config.authMode === 'api_key' && config.apiKey) {
    return {
      url: 'https://api.bulksmslive.com/v2/app/balance',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: {},
    };
  }
  return {
    url: 'https://api.bulksmslive.com/v2/app/getbalance',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: {
      email: config.email,
      password: config.password,
    },
  };
}

export function buildBulkSmsReportRequest(
  config: BulkSmsConfig,
  params: { msgids?: string; sender?: string; page?: number }
): {
  url: string;
  headers: Record<string, string>;
  body: Record<string, string | number>;
} {
  if (config.authMode === 'api_key' && config.apiKey) {
    const body: Record<string, string | number> = {};
    if (params.msgids) body.Msgids = params.msgids;
    if (params.sender) body.sender = params.sender;
    if (params.page) body.page = params.page;
    return {
      url: 'https://api.bulksmslive.com/v2/app/message/report',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body,
    };
  }

  const body: Record<string, string | number> = {
    email: config.email,
    password: config.password,
  };
  if (params.msgids) body.msgids = params.msgids;
  if (params.sender) body.sender = params.sender;
  if (params.page) body.page = params.page;
  return {
    url: 'https://api.bulksmslive.com/v2/api/delivery-report',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body,
  };
}

export function mapBulkSmsResponseStatus(
  rawPayload: Record<string, unknown>,
  httpStatus = 200
): BulkSmsStatusMapping {
  if (httpStatus === 401) {
    return {
      ok: false,
      httpStatus: 401,
      code: 401,
      message: 'BulkSMSLive authentication failed (401 Unauthenticated). Verify BULKSMSLIVE_API_KEY or credentials.',
      needsReauth: true,
    };
  }

  const rawStatus = rawPayload.status ?? rawPayload.Status;
  const code = Number(rawStatus);
  const serverMsg = String(rawPayload.msg ?? rawPayload.message ?? '').trim();

  if (code === 1) {
    return {
      ok: true,
      httpStatus: 200,
      code: 1,
      message: serverMsg || 'Successful',
    };
  }

  const codeLabels: Record<number, { status: number; label: string }> = {
    [-2]: { status: 400, label: 'Invalid Parameter passed to BulkSMSLive' },
    [-3]: { status: 403, label: 'BulkSMSLive account is suspended' },
    [-4]: { status: 400, label: 'Invalid Sender Name (must be <= 11 characters and approved)' },
    [-5]: { status: 400, label: 'Invalid SMS message content' },
    [-6]: { status: 400, label: 'Invalid recipient phone number(s)' },
    [-7]: { status: 402, label: 'Insufficient BulkSMSLive SMS unit balance' },
    [-10]: { status: 502, label: 'BulkSMSLive unknown gateway error' },
  };

  const mapped = codeLabels[code];
  if (mapped) {
    return {
      ok: false,
      httpStatus: mapped.status,
      code,
      message: serverMsg ? `${mapped.label}: ${serverMsg}` : mapped.label,
    };
  }

  if (httpStatus >= 400) {
    return {
      ok: false,
      httpStatus,
      code: Number.isNaN(code) ? -10 : code,
      message: serverMsg || `BulkSMSLive gateway returned HTTP ${httpStatus}.`,
    };
  }

  return {
    ok: false,
    httpStatus: 502,
    code: Number.isNaN(code) ? -10 : code,
    message: serverMsg || 'Unexpected response from BulkSMSLive.',
  };
}
