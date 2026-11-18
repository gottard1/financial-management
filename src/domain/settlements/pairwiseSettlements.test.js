import test from 'node:test';
import assert from 'node:assert/strict';
import { splitExpense, summarize } from '../expenses/expenseCalculations.js';
import { applySettlements, validateNewSettlement } from './settlementCalculations.js';
import { calculateWorkspace, migrateData } from '../budget/workspaceCalculations.js';
import { recordQuickSettlement } from './quickSettlement.js';
import { createPaymentReport, resolvePaymentReport } from './paymentReports.js';

const ids = ['marcel', 'duda', 'zenke', 'bonacolsi', 'gabi'];
const bill = (id, description, amount, payer, participants, overrides = {}) => ({
  id,
  description,
  amount,
  payer,
  participants,
  split: 'equal',
  status: 'paid',
  workspace: 'group:g',
  date: '2026-11-01',
  ...overrides,
});
const payment = (overrides = {}) => ({
  id: 'pix',
  scope: 'group:g',
  from: 'marcel',
  to: 'duda',
  amount: 400,
  date: '2026-12-01',
  referenceMonth: '2026-11',
  note: '',
  status: 'confirmed',
  ...overrides,
});
export function marcelExpenses() {
  return [
    bill('cafe', 'Café', 1400, 'duda', ['marcel', 'duda']),
    bill('almoco', 'Almoço', 2000, 'duda', ['marcel', 'duda']),
    bill('refris', 'Refris', 1804, 'duda', ['marcel', 'duda']),
    bill('mercado1', 'Mercado 1', 10000, 'zenke', ['marcel', 'zenke']),
    bill('mercado2', 'Mercado 2', 6000, 'zenke', ['marcel', 'zenke']),
    bill('pastel', 'Pastel', 680, 'zenke', ['marcel', 'zenke']),
    bill('hot-duda', 'Cachorro-quente Duda', 3200, 'marcel', ['marcel', 'duda']),
    bill('hot-zenke', 'Cachorro-quente Zenke', 3400, 'marcel', ['marcel', 'zenke']),
    bill('hot-outros', 'Cachorros-quentes', 5400, 'marcel', ['bonacolsi', 'gabi']),
  ];
}

test('Marcel has four correct pairs with four other people and net outgoing R$ 22,42', () => {
  const stats = summarize(marcelExpenses(), {}, ids);
  assert.deepEqual(stats.transfers, [
    { from: 'marcel', to: 'duda', amount: 1002 },
    { from: 'marcel', to: 'zenke', amount: 6640 },
    { from: 'bonacolsi', to: 'marcel', amount: 2700 },
    { from: 'gabi', to: 'marcel', amount: 2700 },
  ]);
  assert.equal(stats.balances.marcel, -2242);
  const duda = stats.settlementPairs.find((pair) => pair.first === 'duda');
  assert.equal(duda.compensated, 1600);
  assert.deepEqual(
    duda.expenses.map((e) => [e.description, e.from, e.to, e.amount]),
    [
      ['Café', 'marcel', 'duda', 700],
      ['Almoço', 'marcel', 'duda', 1000],
      ['Refris', 'marcel', 'duda', 902],
      ['Cachorro-quente Duda', 'duda', 'marcel', 1600],
    ],
  );
  const zenke = stats.settlementPairs.find((pair) => pair.second === 'zenke');
  assert.equal(zenke.compensated, 1700);
});

test('two people use 50/50, conserve odd cents, net both directions and omit a zero pair', () => {
  const members = ['a', 'b'];
  const first = bill('1', 'Primeira', 101, 'a', members, { split: 'proportional' });
  const second = bill('2', 'Segunda', 301, 'b', members, {
    split: 'custom',
    percentages: { a: 100, b: 0 },
  });
  assert.deepEqual(splitExpense(first, { a: 9, b: 1 }, members), { a: 51, b: 50 });
  assert.deepEqual(summarize([first, second], {}, members).transfers, [
    { from: 'a', to: 'b', amount: 101 },
  ]);
  const equal = summarize(
    [first, { ...first, id: '2', payer: 'b', participants: ['b', 'a'] }],
    {},
    members,
  );
  assert.deepEqual(equal.transfers, []);
  assert.equal(equal.settlementPairs[0].compensated, 50);
  const single = bill('single', 'Só B', 27, 'a', ['b']);
  assert.deepEqual(summarize([single], {}, members).transfers, [
    { from: 'b', to: 'a', amount: 27 },
  ]);
});

test('three or more members preserve custom, proportional, subset, solo and group allocations', () => {
  const members = ['a', 'b', 'c', 'd'];
  const expenses = [
    bill('custom', 'Personalizada', 101, 'a', ['b', 'c'], {
      split: 'custom',
      percentages: { b: 33.33, c: 66.67 },
    }),
    bill('prop', 'Proporcional', 5, 'c', ['a', 'b'], { split: 'proportional' }),
    bill('solo', 'Só D', 17, 'b', ['d']),
    bill('all', 'Todos', 7, 'd', members),
  ];
  for (const expense of expenses)
    assert.equal(
      Object.values(splitExpense(expense, { a: 1, b: 2 }, members)).reduce((a, b) => a + b, 0),
      expense.amount,
    );
  const stats = summarize(expenses, { a: 1, b: 2 }, members);
  assert.deepEqual(stats.transfers, [
    { from: 'a', to: 'd', amount: 2 },
    { from: 'b', to: 'a', amount: 34 },
    { from: 'b', to: 'c', amount: 3 },
    { from: 'c', to: 'a', amount: 65 },
    { from: 'c', to: 'd', amount: 2 },
    { from: 'd', to: 'b', amount: 15 },
  ]);
});

test('a credit with one person cannot pay a third person; a globally indebted receiver can receive', () => {
  const members = ['a', 'b', 'c'];
  const stats = summarize(
    [bill('ab', 'AB', 500, 'b', ['a']), bill('bc', 'BC', 1000, 'c', ['b'])],
    {},
    members,
  );
  assert.deepEqual(stats.balances, { a: -500, b: -500, c: 1000 });
  assert.doesNotThrow(() =>
    validateNewSettlement(payment({ from: 'a', to: 'b', amount: 500 }), stats, members),
  );
  assert.throws(() =>
    validateNewSettlement(payment({ from: 'a', to: 'c', amount: 1 }), stats, members),
  );
});

test('a cycle keeps all three pair obligations even when every global balance is zero', () => {
  const members = ['a', 'b', 'c'];
  const stats = summarize(
    [
      bill('ab', 'AB', 100, 'b', ['a']),
      bill('bc', 'BC', 100, 'c', ['b']),
      bill('ca', 'CA', 100, 'a', ['c']),
    ],
    {},
    members,
  );
  assert.deepEqual(stats.balances, { a: 0, b: 0, c: 0 });
  assert.deepEqual(stats.transfers, [
    { from: 'a', to: 'b', amount: 100 },
    { from: 'b', to: 'c', amount: 100 },
    { from: 'c', to: 'a', amount: 100 },
  ]);
  assert.doesNotThrow(() =>
    validateNewSettlement(payment({ from: 'a', to: 'b', amount: 100 }), stats, members),
  );
});

test('pending expenses count in the month; reports only lower a pair after confirmation, partially or fully', () => {
  const data = {
    ...migrateData(null),
    people: ids.map((id) => ({ id, name: id })),
    groups: [{ id: 'g', name: 'Grupo', memberIds: ids }],
    expenses: [
      ...marcelExpenses(),
      bill('pending', 'Pendente', 10001, 'duda', ids, { status: 'pending' }),
    ],
  };
  const current = () => calculateWorkspace(data, '2026-11', 'group:g', {});
  const base = current();
  assert.equal(base.pending, 10001);
  assert.equal(base.shares.marcel, summarize(marcelExpenses(), {}, ids).shares.marcel + 2001);
  const report = createPaymentReport(
    {
      id: 'pix',
      scope: 'group:g',
      month: '2026-11',
      transfer: { from: 'marcel', to: 'duda', amount: 400 },
      date: '2026-12-01',
    },
    'marcel',
    base,
    ids,
  );
  data.paymentReports = [report];
  assert.deepEqual(current().transfers, base.transfers);
  data.paymentReports = [resolvePaymentReport(report, 'duda', 'confirm', base, ids)];
  data.settlements = [payment()];
  const partial = current();
  assert.equal(partial.transfers[0].amount, 602);
  assert.deepEqual(partial.transfers.slice(1), base.transfers.slice(1));
  for (const key of ['total', 'paid', 'pending', 'shares', 'paidBy'])
    assert.deepEqual(partial[key], base[key]);
  const settled = recordQuickSettlement(data, {
    scope: 'group:g',
    month: '2026-11',
    transfer: { from: 'marcel', to: 'duda', amount: 602 },
    id: 'remaining',
    date: '2026-12-02',
  });
  assert.equal(calculateWorkspace(settled, '2026-11', 'group:g', {}).transfers.length, 3);
  assert.equal(settled.settlements.length, 2);
  assert.deepEqual(data.settlements, [payment()]);
});

test('old global payments preserve cleared balances and suspend suggestions for manual review', () => {
  const members = ['a', 'b', 'c'];
  const base = summarize(
    [bill('ab', 'AB', 500, 'b', ['a']), bill('bc', 'BC', 500, 'c', ['b'])],
    {},
    members,
  );
  const history = [payment({ from: 'a', to: 'c', amount: 500 })];
  const copy = structuredClone(history);
  const result = applySettlements(base, history, members);
  assert.deepEqual(result.balances, { a: 0, b: 0, c: 0 });
  assert.deepEqual(result.transfers, []);
  assert.deepEqual(result.settlementIssues, [
    { first: 'a', second: 'c', reason: 'payment-mismatch' },
  ]);
  assert.deepEqual(history, copy);
  assert.throws(
    () => validateNewSettlement(payment({ from: 'a', to: 'b', amount: 1 }), result, members),
    /Revise/,
  );
});

test('old two-person proportional payments need review; new 50/50 payments remain reconcilable', () => {
  const members = ['a', 'b'];
  const base = summarize(
    [bill('ab', 'AB', 10000, 'a', members, { split: 'proportional' })],
    { a: 3, b: 2 },
    members,
  );
  const old = applySettlements(base, [payment({ from: 'b', to: 'a', amount: 4000 })], members);
  assert.equal(old.settlementIssues[0].reason, 'split-changed');
  assert.deepEqual(old.transfers, []);
  const recent = applySettlements(
    base,
    [payment({ from: 'b', to: 'a', amount: 4000, settlementRule: 'pairwise-v1' })],
    members,
  );
  assert.deepEqual(recent.transfers, [{ from: 'b', to: 'a', amount: 1000 }]);
});
