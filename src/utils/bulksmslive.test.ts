import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBulkSmsBalanceRequest,
  buildBulkSmsReportRequest,
  buildBulkSmsSendRequest,
  formatBulkSmsSendTime,
  mapBulkSmsResponseStatus,
  normalizeNigerianPhoneForBulkSms,
  resolveBulkSmsConfig,
  sanitizeSenderName,
} from './bulksmslive';

test('normalizeNigerianPhoneForBulkSms normalizes Nigerian local & spaced formats to 234...', () => {
  assert.equal(normalizeNigerianPhoneForBulkSms('+234 803 101 2001'), '2348031012001');
  assert.equal(normalizeNigerianPhoneForBulkSms('0803 101 2001'), '2348031012001');
  assert.equal(normalizeNigerianPhoneForBulkSms('0701-555-8899'), '2347015558899');
  assert.equal(normalizeNigerianPhoneForBulkSms('8091234567'), '2348091234567');
  assert.equal(
    normalizeNigerianPhoneForBulkSms('08031012001, +234 805 222 3333, 08031012001'),
    '2348031012001,2348052223333'
  );
});

test('sanitizeSenderName enforces BulkSMSLive 11-character limit', () => {
  assert.equal(sanitizeSenderName(''), 'PropLedger');
  assert.equal(sanitizeSenderName("AgbaSaffy's Court"), 'AgbaSaffys');
  assert.ok(sanitizeSenderName('VeryLongEstateName').length <= 11);
});

test('formatBulkSmsSendTime formats future ISO timestamps in Africa/Lagos WAT and skips past times', () => {
  const now = Date.parse('2026-11-18T10:00:00Z');
  assert.equal(formatBulkSmsSendTime('2026-11-18T09:00:00Z', now), undefined);
  assert.equal(formatBulkSmsSendTime('2026-11-19T08:00:00Z', now), '2026-11-19 09:00:00');
});

test('buildBulkSmsSendRequest prioritizes Bearer API key mode and builds v2/app/sendsms payload', () => {
  const cfg = resolveBulkSmsConfig({
    BULKSMSLIVE_API_KEY: 'test-live-key',
    BULKSMSLIVE_EMAIL: 'ignored@example.com',
    BULKSMSLIVE_PASSWORD: 'ignored',
    BULKSMSLIVE_SENDER_NAME: 'AgbaSaffy Court',
    BULKSMSLIVE_FORCEDND: '1',
  });
  assert.equal(cfg.configured, true);
  assert.equal(cfg.authMode, 'api_key');

  const req = buildBulkSmsSendRequest(cfg, {
    to: '0803 101 2001',
    message: 'Rent due tomorrow.',
    sendtime: '2026-11-20T08:00:00Z',
    nowMs: Date.parse('2026-11-18T10:00:00Z'),
  });

  assert.equal(req.url, 'https://api.bulksmslive.com/v2/app/sendsms');
  assert.equal(req.headers.Authorization, 'Bearer test-live-key');
  assert.equal(req.body.Recipients, '2348031012001');
  assert.equal(req.body.Sender_name, 'AgbaSaffy C');
  assert.equal(req.body.Forcednd, '1');
  assert.equal(req.body.sendtime, '2026-11-20 09:00:00');
});

test('buildBulkSmsSendRequest falls back to email+password v2/app/sms when API key absent', () => {
  const cfg = resolveBulkSmsConfig({
    BULKSMSLIVE_EMAIL: 'manager@agbasaffy.ng',
    BULKSMSLIVE_PASSWORD: 'secret',
  });
  assert.equal(cfg.configured, true);
  assert.equal(cfg.authMode, 'credentials');

  const req = buildBulkSmsSendRequest(cfg, {
    to: '+234 805 000 1111',
    message: 'Reminder test',
  });
  assert.equal(req.url, 'https://api.bulksmslive.com/v2/app/sms');
  assert.equal(req.body.email, 'manager@agbasaffy.ng');
  assert.equal(req.body.recipients, '2348050001111');
  assert.equal(req.body.sender_name, 'PropLedger');

  const balReq = buildBulkSmsBalanceRequest(cfg);
  assert.equal(balReq.url, 'https://api.bulksmslive.com/v2/app/getbalance');
  const dlrReq = buildBulkSmsReportRequest(cfg, { msgids: '12345' });
  assert.equal(dlrReq.url, 'https://api.bulksmslive.com/v2/api/delivery-report');
  assert.equal(dlrReq.body.msgids, '12345');
});

test('mapBulkSmsResponseStatus translates documented error codes cleanly', () => {
  assert.equal(mapBulkSmsResponseStatus({ status: 1, msg: 'Successful' }).ok, true);
  const insufficient = mapBulkSmsResponseStatus({ status: -7, msg: 'Low units' });
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.httpStatus, 402);
  const badSender = mapBulkSmsResponseStatus({ status: -4 });
  assert.equal(badSender.httpStatus, 400);
  const unauth = mapBulkSmsResponseStatus({}, 401);
  assert.equal(unauth.needsReauth, true);
});
