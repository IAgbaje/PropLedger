import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMailtoHref,
  buildRfc2822MimeEmail,
  calculateSmsSegments,
  encodeBase64Url,
  interpolateTemplate,
  isScheduleDue,
  isWithinQuietHours,
  validateEmailAddress,
  validatePhoneNumber,
} from './messaging';

test('validateEmailAddress and validatePhoneNumber validate contacts strictly', () => {
  assert.equal(validateEmailAddress('sadiq.bello@example.ng'), true);
  assert.equal(validateEmailAddress('bad-email@'), false);
  assert.equal(validateEmailAddress(''), false);

  assert.equal(validatePhoneNumber('+234 812 773 1044'), true);
  assert.equal(validatePhoneNumber('12345'), false);
});

test('interpolateTemplate replaces known placeholders and preserves unknown ones', () => {
  const rendered = interpolateTemplate(
    "Hello {{firstName}}, your balance for {{unitCode}} is {{outstandingBalance}} ({{propertyName}}).",
    {
      firstName: 'Sadiq',
      unitCode: 'B-202',
      outstandingBalance: '₦1,454,000',
      propertyName: "AgbaSaffy's Court",
    }
  );
  assert.equal(
    rendered,
    "Hello Sadiq, your balance for B-202 is ₦1,454,000 (AgbaSaffy's Court)."
  );
});

test('buildRfc2822MimeEmail and encodeBase64Url produce valid Gmail raw payloads with UTF-8', () => {
  const mime = buildRfc2822MimeEmail({
    from: 'theibraheemagbaje@gmail.com',
    to: 'sadiq.bello@example.ng',
    subject: 'Rent Balance ₦1,454,000',
    body: 'Kindly settle ₦1,454,000 for Suite B2.',
  });
  assert.ok(mime.includes('To: sadiq.bello@example.ng'));
  assert.ok(mime.includes('Subject: =?UTF-8?B?'));
  assert.ok(mime.includes('Content-Type: text/plain; charset="UTF-8"'));
  const b64url = encodeBase64Url(mime);
  assert.equal(/[+/=]/.test(b64url), false);
});

test('buildMailtoHref builds properly percent-encoded mailto link', () => {
  const href = buildMailtoHref({
    to: 'lawyer@chambers.ng',
    subject: 'Arrears Notice',
    body: 'Line 1 & Line 2',
  });
  assert.ok(href.startsWith('mailto:lawyer%40chambers.ng?'));
  assert.ok(href.includes('subject=Arrears%20Notice'));
  assert.ok(href.includes('body=Line%201%20%26%20Line%202'));
});

test('calculateSmsSegments differentiates GSM-7 vs UCS-2 (Naira sign)', () => {
  const ascii = calculateSmsSegments('Hello Sadiq, please remit rent.');
  assert.equal(ascii.encoding, 'GSM-7');
  assert.equal(ascii.segments, 1);

  const naira = calculateSmsSegments(
    'Dear Sadiq, your overdue balance is ₦1,454,000 for Suite B2. Kindly remit via transfer today.'
  );
  assert.equal(naira.encoding, 'UCS-2');
  assert.equal(naira.segments, 2);
});

test('isWithinQuietHours handles overnight quiet window correctly', () => {
  assert.equal(isWithinQuietHours('21:30', '20:00', '07:00'), true);
  assert.equal(isWithinQuietHours('06:15', '20:00', '07:00'), true);
  assert.equal(isWithinQuietHours('14:00', '20:00', '07:00'), false);
});

test('isScheduleDue detects past vs future scheduled ISO timestamps', () => {
  const now = Date.parse('2026-11-18T14:00:00Z');
  assert.equal(isScheduleDue('2026-11-18T13:59:00Z', now), true);
  assert.equal(isScheduleDue('2026-11-18T14:00:00Z', now), true);
  assert.equal(isScheduleDue('2026-11-18T15:00:00Z', now), false);
});
