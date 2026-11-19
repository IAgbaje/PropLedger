import test from 'node:test';
import assert from 'node:assert/strict';
import {
  caretOffsetForSignificantCount,
  countSignificantCurrencyChars,
  formatAccountingDisplay,
  parseCurrencyValue,
  sanitizeCurrencyInput,
} from './format';

test('sanitizeCurrencyInput strips non-numeric characters and normalizes decimals', () => {
  assert.equal(sanitizeCurrencyInput('4000000'), '4000000');
  assert.equal(sanitizeCurrencyInput('₦4,000,000'), '4000000');
  assert.equal(sanitizeCurrencyInput('4,000,000.50'), '4000000.50');
  assert.equal(sanitizeCurrencyInput('4000000.567'), '4000000.56');
  assert.equal(sanitizeCurrencyInput('12.34.56'), '12.34');
  assert.equal(sanitizeCurrencyInput('.5'), '0.5');
  assert.equal(sanitizeCurrencyInput('00750'), '750');
  assert.equal(sanitizeCurrencyInput('00'), '0');
  assert.equal(sanitizeCurrencyInput('abc'), '');
});

test('formatAccountingDisplay groups thousands with commas and preserves typing decimals', () => {
  assert.equal(formatAccountingDisplay('4000000'), '4,000,000');
  assert.equal(formatAccountingDisplay(4000000), '4,000,000');
  assert.equal(formatAccountingDisplay('4000000.'), '4,000,000.');
  assert.equal(formatAccountingDisplay('4000000.5'), '4,000,000.5');
  assert.equal(formatAccountingDisplay('4000000.50'), '4,000,000.50');
  assert.equal(formatAccountingDisplay('900000'), '900,000');
  assert.equal(formatAccountingDisplay('4000'), '4,000');
  assert.equal(formatAccountingDisplay('0'), '0');
  assert.equal(formatAccountingDisplay(''), '');
});

test('parseCurrencyValue parses formatted accounting strings reliably', () => {
  assert.equal(parseCurrencyValue('4,000,000'), 4000000);
  assert.equal(parseCurrencyValue('₦4,000,000.50'), 4000000.5);
  assert.equal(parseCurrencyValue(''), 0);
  assert.equal(parseCurrencyValue('.'), 0);
  assert.equal(parseCurrencyValue(1250000), 1250000);
});

test('caret helpers preserve cursor position across inserted commas', () => {
  const before = '400,000';
  const sigCount = countSignificantCurrencyChars(before);
  assert.equal(sigCount, 6);
  const after = formatAccountingDisplay('4000000'); // '4,000,000'
  assert.equal(caretOffsetForSignificantCount(after, 7), after.length);
  // Typing '5' after '4' in '4,000,000' -> '45,000,000' (2 sig chars before caret)
  assert.equal(caretOffsetForSignificantCount('45,000,000', 2), 2);
  assert.equal(caretOffsetForSignificantCount('45,000,000', 0), 0);
});
