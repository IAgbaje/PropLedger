import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsvContent, escapeCsvCell } from './csvExport';

test('escapeCsvCell handles commas, quotes, newlines, and nullish values', () => {
  assert.equal(escapeCsvCell(null), '');
  assert.equal(escapeCsvCell(undefined), '');
  assert.equal(escapeCsvCell(1450000), '1450000');
  assert.equal(escapeCsvCell('A-101'), 'A-101');
  assert.equal(escapeCsvCell('Shop 2, Corner'), '"Shop 2, Corner"');
  assert.equal(escapeCsvCell('Note: "Paid"'), '"Note: ""Paid"""');
  assert.equal(escapeCsvCell('Line 1\nLine 2'), '"Line 1\nLine 2"');
});

test('buildCsvContent serializes header and filtered rows cleanly', () => {
  const csv = buildCsvContent(
    ['Unit Code', 'Tenant Name', 'Outstanding (NGN)'],
    [
      ['B-202', 'Sadiq Bello', 1454000],
      ['S-02', 'Chidi Okafor, Jr.', 900000],
    ]
  );

  assert.equal(
    csv,
    [
      'Unit Code,Tenant Name,Outstanding (NGN)',
      'B-202,Sadiq Bello,1454000',
      'S-02,"Chidi Okafor, Jr.",900000',
    ].join('\r\n')
  );
});
