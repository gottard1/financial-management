import test from 'node:test';
import assert from 'node:assert/strict';
import { recurringCandidates, copyRecurringExpenses } from './recurringExpenses.js';
import { migrateData } from '../budget/workspaceCalculations.js';

const expense = (patch = {}) => ({
  id: 'electricity',
  description: 'Luz',
  amount: 15000,
  fixed: true,
  fixedAmountType: 'variable',
  date: '2026-01-31',
  workspace: 'person:person-0',
  status: 'paid',
  payer: 'person-0',
  split: 'equal',
  participants: ['person-0'],
  percentages: {},
  ...patch,
});
const scope = 'person:person-0';
const entry = (amount, selected = true) => ({ electricity: { amount, selected } });

test('copies variable monthly value without modifying history, IDs or allocation rules', () => {
  const original = expense();
  const before = JSON.stringify(original);
  const [copy] = copyRecurringExpenses([original], scope, '2026-02', entry('187,45'), () => 'new');
  assert.equal(JSON.stringify(original), before);
  assert.equal(copy.amount, 18745);
  assert.equal(copy.status, 'pending');
  assert.equal(copy.date, '2026-02-28');
  assert.equal(copy.originId, original.id);
  assert.equal(copy.id, 'new');
  assert.equal(copy.fixedAmountType, 'variable');
  assert.deepEqual(copy.participants, original.participants);
  assert.notEqual(copy.participants, original.participants);
  assert.notEqual(copy.percentages, original.percentages);
});
test('requires an explicit positive amount and never falls back to last month for variable bills', () => {
  for (const value of ['', '0', '-1', 'abc', '12,345'])
    assert.throws(() => copyRecurringExpenses([expense()], scope, '2026-02', entry(value)));
});
test('isolates recurrence by month and workspace, skipping bills without recurrence', () => {
  const items = [
    expense(),
    expense({ id: 'other', workspace: 'group:another' }),
    expense({ id: 'old', date: '2025-12-31' }),
    expense({ id: 'once', fixed: false }),
  ];
  assert.deepEqual(
    recurringCandidates(items, scope, '2026-02').map((item) => item.id),
    ['electricity'],
  );
  assert.deepEqual(recurringCandidates(items, scope, '2026-03'), []);
});
test('does not duplicate a recurrence after repeated copying across multiple months', () => {
  const original = expense();
  const [feb] = copyRecurringExpenses([original], scope, '2026-02', entry('200'), () => 'feb');
  assert.deepEqual(recurringCandidates([original, feb], scope, '2026-02'), []);
  assert.throws(() => copyRecurringExpenses([original, feb], scope, '2026-02', entry('250')));
  const [mar] = copyRecurringExpenses(
    [original, feb],
    scope,
    '2026-03',
    { feb: { selected: true, amount: '99' } },
    () => 'mar',
  );
  assert.equal(mar.originId, original.id);
  assert.equal(mar.amount, 9900);
  assert.equal(feb.amount, 20000);
  assert.deepEqual(recurringCandidates([original, feb, mar], scope, '2026-03'), []);
});
test('deduplicates source origins and ignores unselected variable bills without requiring an amount', () => {
  const items = [
    expense(),
    expense({ id: 'duplicate', originId: 'electricity' }),
    expense({ id: 'rent', fixedAmountType: 'fixed' }),
  ];
  assert.equal(recurringCandidates(items, scope, '2026-02').length, 2);
  const copies = copyRecurringExpenses(items, scope, '2026-02', {
    ...entry('', false),
    rent: { selected: true, amount: '150' },
  });
  assert.equal(copies.length, 1);
  assert.equal(copies[0].originId, 'rent');
  assert.throws(() => copyRecurringExpenses(items, scope, '2026-02', entry('', false)));
});
test('handles year transitions and leap February without changing due days unnecessarily', () => {
  const [jan] = copyRecurringExpenses(
    [expense({ date: '2025-12-15' })],
    scope,
    '2026-01',
    entry('10'),
  );
  assert.equal(jan.date, '2026-01-15');
  const [leap] = copyRecurringExpenses(
    [expense({ date: '2028-01-31' })],
    scope,
    '2028-02',
    entry('10'),
  );
  assert.equal(leap.date, '2028-02-29');
  assert.throws(() => recurringCandidates([], scope, '2026-13'));
});
test('old recurring bills remain compatible and new amount types survive backup reload', () => {
  const base = migrateData(null);
  for (const type of [undefined, 'fixed', 'variable']) {
    const item = expense({ fixedAmountType: type });
    if (type === undefined) delete item.fixedAmountType;
    const result = migrateData({ ...base, expenses: [item] });
    assert.equal(result.expenses[0].fixedAmountType, type);
    assert.equal(recurringCandidates(result.expenses, scope, '2026-02').length, 1);
  }
  assert.throws(() =>
    migrateData({ ...base, expenses: [expense({ fixedAmountType: 'invalid' })] }),
  );
});
