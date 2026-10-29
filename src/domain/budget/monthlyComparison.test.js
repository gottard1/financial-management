import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMonths, shiftMonth } from './monthlyComparison.js';
import { migrateData } from './workspaceCalculations.js';

function fixture() {
  return {
    ...migrateData(null),
    people: [
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Bia' },
    ],
    groups: [{ id: 'home', name: 'Casa', memberIds: ['a', 'b'] }],
    months: { '2026-09': { a: 100000, b: 100000 }, '2026-10': { a: 300000, b: 100000 } },
    expenses: [
      {
        id: 'personal',
        description: 'Pessoal',
        date: '2026-09-10',
        amount: 1000,
        category: 'Outros',
        workspace: 'person:a',
        participants: ['a'],
        payer: 'a',
        split: 'equal',
        percentages: {},
        status: 'paid',
      },
      ...['09', '10'].map((month) => ({
        id: month,
        description: 'Casa',
        date: `2026-${month}-10`,
        amount: 10000,
        category: 'Moradia',
        workspace: 'group:home',
        participants: ['a', 'b'],
        payer: 'a',
        split: 'proportional',
        percentages: {},
        status: month === '09' ? 'paid' : 'pending',
      })),
      {
        id: 'other',
        description: 'Outra pessoa',
        date: '2026-10-10',
        amount: 99999,
        category: 'Outros',
        workspace: 'person:b',
        participants: ['b'],
        payer: 'b',
        split: 'equal',
        percentages: {},
        status: 'paid',
      },
    ],
  };
}
test('compares personal costs plus exact monthly shared portions without leaking other people expenses', () => {
  const result = compareMonths(fixture(), 'person:a', '2026-09', '2026-10');
  assert.deepEqual(
    result.rows.map((row) => row.total),
    [6000, 7500],
  );
  assert.equal(result.total, 13500);
  assert.equal(result.paid, 6000);
  assert.equal(result.pending, 7500);
  assert.equal(result.delta, 1500);
  assert.equal(result.deltaPercent, 25);
  assert.equal(result.average, 6750);
  assert.deepEqual(result.categories.find((item) => item.name === 'Moradia').values, [5000, 7500]);
});
test('group comparisons isolate their expenses and include months without records as zero', () => {
  const result = compareMonths(fixture(), 'group:home', '2026-08', '2026-10');
  assert.deepEqual(
    result.rows.map((row) => row.total),
    [0, 10000, 10000],
  );
  assert.equal(result.total, 20000);
  assert.equal(result.average, 6667);
});
test('missing proportional income is reported, never counted as a fabricated zero', () => {
  const data = fixture();
  delete data.months['2026-10'];
  const result = compareMonths(data, 'person:a', '2026-09', '2026-10');
  assert.ok(result.rows[1].error);
  assert.equal(result.total, 6000);
  assert.equal(result.average, 6000);
  assert.equal(result.delta, null);
  assert.equal(result.categories[0].values[1], null);
});
test('handles calendar transitions, rejects inverted/oversized periods and avoids zero-base percentages', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-01', -12), '2025-01');
  assert.equal(compareMonths(fixture(), 'person:a', '2026-08', '2026-09').deltaPercent, null);
  assert.throws(() => compareMonths(fixture(), 'person:a', '2026-10', '2026-09'));
  assert.throws(() => compareMonths(fixture(), 'person:a', '2020-01', '2026-10'));
  assert.throws(() => shiftMonth('2026-13', 0));
});
