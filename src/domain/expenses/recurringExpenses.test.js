import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recurringCandidates,
  copyRecurringExpenses,
  recurrenceLabel,
} from './recurringExpenses.js';
import { migrateData } from '../budget/workspaceCalculations.js';
import { encodeFinance, decodeFinance } from '../budget/financeCloudCodec.js';

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

test('supports 420 mortgage installments of R$ 978 without dividing the monthly amount', () => {
  const mortgage = expense({
    description: 'Financiamento da casa',
    amount: 97800,
    fixedAmountType: 'fixed',
    installments: { total: 420, current: 360 },
  });
  const data = migrateData({ ...migrateData(null), expenses: [mortgage] });
  const [next] = copyRecurringExpenses(
    data.expenses,
    scope,
    '2026-02',
    entry('978'),
    () => 'mortgage-361',
  );
  assert.deepEqual(next.installments, { total: 420, current: 361 });
  assert.equal(next.amount, 97800);
  assert.equal(mortgage.installments.current, 360);
  assert.deepEqual(
    recurringCandidates(
      [expense({ installments: { total: 420, current: 420 } })],
      scope,
      '2026-02',
    ),
    [],
  );
});

test('six installments span exactly six occurrences including the original, then stop', () => {
  const original = expense({ fixedAmountType: 'fixed', installments: { total: 6, current: 1 } });
  const history = [original];
  for (let number = 2; number <= 6; number += 1) {
    const month = `2026-${String(number).padStart(2, '0')}`;
    const previous = history.at(-1);
    const copies = copyRecurringExpenses(
      history,
      scope,
      month,
      { [previous.id]: { selected: true, amount: '150' } },
      () => `part-${number}`,
    );
    history.push(...copies);
    assert.equal(copies[0].installments.current, number);
    assert.equal(copies[0].installments.total, 6);
    assert.equal(copies[0].amount, 15000);
    assert.equal(copies[0].originId, original.id);
    assert.equal(recurringCandidates(history, scope, month).length, 0);
  }
  assert.equal(history.length, 6);
  assert.equal(original.installments.current, 1);
  assert.deepEqual(recurringCandidates(history, scope, '2026-07'), []);
  assert.throws(() =>
    copyRecurringExpenses(history, scope, '2026-07', {
      'part-6': { selected: true, amount: '150' },
    }),
  );
  assert.equal(recurrenceLabel(history.at(-1)), 'Parcela 6 de 6 · última');
});
test('supports an intermediate starting installment and a single-installment purchase', () => {
  const partial = expense({ installments: { total: 6, current: 3 } });
  const [next] = copyRecurringExpenses([partial], scope, '2026-02', entry('150'));
  assert.deepEqual(next.installments, { total: 6, current: 4 });
  assert.deepEqual(
    recurringCandidates([expense({ installments: { total: 1, current: 1 } })], scope, '2026-02'),
    [],
  );
});
test('validates installment limits and preserves finite recurrence in backups and private cloud data', () => {
  const data = migrateData(null);
  const finite = expense({ installments: { total: 6, current: 2 } });
  const restored = migrateData(JSON.parse(JSON.stringify({ ...data, expenses: [finite] })));
  assert.deepEqual(restored.expenses[0].installments, { total: 6, current: 2 });
  const encoded = encodeFinance(restored);
  const cloud = decodeFinance([
    {
      id: 'state',
      schemaVersion: 2,
      revision: 1,
      recordCount: encoded.records.length,
      orders: encoded.orders,
    },
    ...encoded.records.map((record) => ({ ...record, revision: 1 })),
  ]);
  assert.deepEqual(cloud.data.expenses[0].installments, { total: 6, current: 2 });
  for (const installments of [
    null,
    [],
    { total: 0, current: 1 },
    { total: Number.MAX_SAFE_INTEGER + 1, current: 1 },
    { total: 6, current: 7 },
    { total: 6, current: 0 },
    { total: 6.5, current: 1 },
    { total: 6, current: 1.5 },
    { total: '6', current: 1 },
  ])
    assert.throws(() => migrateData({ ...data, expenses: [expense({ installments })] }));
  assert.throws(() =>
    migrateData({
      ...data,
      expenses: [expense({ fixed: false, installments: { total: 6, current: 1 } })],
    }),
  );
});

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
