import test from 'node:test';
import assert from 'node:assert/strict';
import { money, parseMoney, splitExpense, summarize } from './expenseCalculations.js';

const ids = ['ana', 'bia', 'caio'];
const incomes = { ana: 300000, bia: 200000, caio: 100000 };
const bill = (overrides = {}) => ({
  amount: 60000,
  split: 'equal',
  participants: [...ids],
  payer: 'ana',
  status: 'paid',
  ...overrides,
});
const sum = (values) => values.reduce((total, value) => total + value, 0);

test('money APIs preserve Brazilian and dot-decimal parsing without float drift', () => {
  for (const [input, expected] of [
    ['1.250,50', 125050],
    ['1250.50', 125050],
    ['0,01', 1],
    ['R$ 42,9', 4290],
    ['0', 0],
    ['12', 1200],
  ])
    assert.equal(parseMoney(input), expected);
  for (const input of [
    '',
    '-1',
    '1,234',
    'NaN',
    '1.23,45',
    '10 reais',
    '1e3',
    'Infinity',
    '999999999999999999',
  ])
    assert.throws(() => parseMoney(input));
  assert.match(money(125050), /1\.250,50/);
  assert.throws(() => money(0.1));
});

test('equal splitting handles three people and one cent with participant-order tie breaks', () => {
  assert.deepEqual(splitExpense(bill(), incomes, ids), { ana: 20000, bia: 20000, caio: 20000 });
  assert.deepEqual(splitExpense(bill({ amount: 1 }), incomes, ids), { ana: 1, bia: 0, caio: 0 });
  assert.deepEqual(
    splitExpense(bill({ amount: 1, participants: ['caio', 'bia', 'ana'] }), incomes, ids),
    { ana: 0, bia: 0, caio: 1 },
  );
  assert.deepEqual(splitExpense(bill({ amount: 2 }), incomes, ids), { ana: 1, bia: 1, caio: 0 });
});

test('largest remainders support five people, participant subsets and single members', () => {
  const members = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(
    splitExpense(bill({ amount: 103, participants: members, payer: 'a' }), {}, members),
    { a: 21, b: 21, c: 21, d: 20, e: 20 },
  );
  assert.deepEqual(
    splitExpense(bill({ amount: 101, participants: ['bia', 'caio'], payer: 'ana' }), incomes, ids),
    { ana: 0, bia: 51, caio: 50 },
  );
  assert.deepEqual(splitExpense(bill({ amount: 101, participants: ['caio'] }), incomes, ids), {
    ana: 0,
    bia: 0,
    caio: 101,
  });
  assert.deepEqual(
    splitExpense(bill({ amount: 101, participants: ['solo'], payer: 'solo' }), { solo: 0 }, [
      'solo',
    ]),
    { solo: 101 },
  );
});

test('proportional splitting only counts participant incomes and supports zero incomes', () => {
  assert.deepEqual(splitExpense(bill({ split: 'proportional' }), incomes, ids), {
    ana: 30000,
    bia: 20000,
    caio: 10000,
  });
  assert.deepEqual(
    splitExpense(
      bill({ amount: 100, split: 'proportional', participants: ['bia', 'caio'] }),
      incomes,
      ids,
    ),
    { ana: 0, bia: 67, caio: 33 },
  );
  assert.deepEqual(
    splitExpense(bill({ amount: 5, split: 'proportional' }), { ana: 0, bia: 2, caio: 1 }, ids),
    { ana: 0, bia: 3, caio: 2 },
  );
  assert.deepEqual(splitExpense(bill({ amount: 1, split: 'proportional' }), { bia: 1 }, ids), {
    ana: 0,
    bia: 1,
    caio: 0,
  });
  assert.throws(
    () =>
      splitExpense(
        bill({ split: 'proportional', participants: ['bia', 'caio'] }),
        { ana: 100000 },
        ids,
      ),
    /renda/,
  );
});

test('custom percentages sum to exactly 100 in basis points, including zero and 100', () => {
  assert.deepEqual(
    splitExpense(
      bill({ amount: 101, split: 'custom', percentages: { ana: 33.33, bia: 33.33, caio: 33.34 } }),
      incomes,
      ids,
    ),
    { ana: 34, bia: 33, caio: 34 },
  );
  assert.deepEqual(
    splitExpense(
      bill({ amount: 1, split: 'custom', percentages: { ana: 0, bia: 100, caio: 0 } }),
      incomes,
      ids,
    ),
    { ana: 0, bia: 1, caio: 0 },
  );
  assert.deepEqual(
    splitExpense(
      bill({
        amount: 101,
        split: 'custom',
        participants: ['caio'],
        percentages: { caio: 100, ana: 'ignored' },
      }),
      incomes,
      ids,
    ),
    { ana: 0, bia: 0, caio: 101 },
  );
  for (const percentages of [
    { ana: 33.33, bia: 33.33, caio: 33.33 },
    { ana: 0, bia: 0, caio: 0 },
    { ana: 100, bia: 0 },
    { ana: 50, bia: 50, caio: 0.001 },
  ])
    assert.throws(() => splitExpense(bill({ split: 'custom', percentages }), incomes, ids));
  for (const value of [-1, 101, NaN, Infinity, '50', null, 1.001, 0.00001])
    assert.throws(() =>
      splitExpense(
        bill({ split: 'custom', percentages: { ana: value, bia: 50, caio: 0 } }),
        incomes,
        ids,
      ),
    );
});

test('pending bills affect shares but never balances, paid totals or transfers', () => {
  const result = summarize([bill(), bill({ status: 'pending', payer: 'bia' })], incomes, ids);
  assert.deepEqual(result, {
    total: 120000,
    paid: 60000,
    pending: 60000,
    shares: { ana: 40000, bia: 40000, caio: 40000 },
    paidBy: { ana: 60000, bia: 0, caio: 0 },
    balances: { ana: 40000, bia: -20000, caio: -20000 },
    transfers: [
      { from: 'bia', to: 'ana', amount: 20000 },
      { from: 'caio', to: 'ana', amount: 20000 },
    ],
  });
  const pending = summarize([bill({ status: 'pending' })], incomes, ids);
  assert.deepEqual(pending.balances, { ana: 0, bia: 0, caio: 0 });
  assert.deepEqual(pending.transfers, []);
});

test('a nonparticipating payer receives the full reimbursement', () => {
  const result = summarize([bill({ amount: 10001, participants: ['bia', 'caio'] })], incomes, ids);
  assert.deepEqual(result.shares, { ana: 0, bia: 5001, caio: 5000 });
  assert.deepEqual(result.transfers, [
    { from: 'bia', to: 'ana', amount: 5001 },
    { from: 'caio', to: 'ana', amount: 5000 },
  ]);
});

test('five-person multiple creditors and debtors settle deterministically and reconcile', () => {
  const members = ['a', 'b', 'c', 'd', 'e'];
  const result = summarize(
    [
      bill({ amount: 500, participants: members, payer: 'a' }),
      bill({ amount: 200, participants: members, payer: 'b' }),
      bill({ amount: 100, participants: ['d'], payer: 'e' }),
      bill({ amount: 777, participants: members, payer: 'd', status: 'pending' }),
    ],
    {},
    members,
  );
  assert.deepEqual(result.balances, { a: 360, b: 60, c: -140, d: -240, e: -40 });
  assert.deepEqual(result.transfers, [
    { from: 'c', to: 'a', amount: 140 },
    { from: 'd', to: 'a', amount: 220 },
    { from: 'd', to: 'b', amount: 20 },
    { from: 'e', to: 'b', amount: 40 },
  ]);
  const reconciled = { ...result.balances };
  for (const { from, to, amount } of result.transfers) {
    assert.ok(amount > 0 && Number.isSafeInteger(amount));
    reconciled[from] += amount;
    reconciled[to] -= amount;
  }
  assert.deepEqual(
    Object.values(reconciled),
    members.map(() => 0),
  );
  assert.equal(sum(Object.values(result.shares)), result.total);
  assert.equal(sum(Object.values(result.paidBy)), result.paid);
  assert.equal(sum(Object.values(result.balances)), 0);
});

test('arbitrary group sizes conserve cents for equal and proportional splits', () => {
  for (const size of [1, 3, 5, 10, 37]) {
    const members = Array.from({ length: size }, (_, index) => `member-${index}`);
    const earned = Object.fromEntries(members.map((id, index) => [id, index + 1]));
    for (const amount of [0, 1, 2, 17, 101, 123456, Number.MAX_SAFE_INTEGER]) {
      for (const split of ['equal', 'proportional']) {
        const result = splitExpense(
          bill({ amount, split, participants: members, payer: members[0] }),
          earned,
          members,
        );
        assert.equal(
          Object.values(result).reduce((total, value) => total + BigInt(value), 0n),
          BigInt(amount),
        );
        assert.ok(
          Object.values(result).every((value) => Number.isSafeInteger(value) && value >= 0),
        );
      }
    }
  }
});

test('empty summaries and prototype-shaped IDs return valid own-property records', () => {
  assert.deepEqual(summarize([], {}, ids), {
    total: 0,
    paid: 0,
    pending: 0,
    shares: { ana: 0, bia: 0, caio: 0 },
    paidBy: { ana: 0, bia: 0, caio: 0 },
    balances: { ana: 0, bia: 0, caio: 0 },
    transfers: [],
  });
  const members = ['__proto__', 'constructor'];
  const result = summarize(
    [bill({ amount: 1, participants: members, payer: '__proto__' })],
    {},
    members,
  );
  assert.equal(Object.hasOwn(result.shares, '__proto__'), true);
  assert.equal(result.shares.__proto__, 1);
  assert.equal(result.shares.constructor, 0);
});

test('invalid IDs, participants, payers, incomes, amounts, status and split are rejected', () => {
  for (const members of [[], ['ana', 'ana'], [''], [' '], [1], null])
    assert.throws(() => splitExpense(bill(), incomes, members));
  for (const participants of [[], ['ana', 'ana'], ['outsider'], [''], [1], null])
    assert.throws(() => splitExpense(bill({ participants }), incomes, ids));
  for (const payer of ['outsider', '', 0, null])
    assert.throws(() => splitExpense(bill({ payer }), incomes, ids));
  for (const amount of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => splitExpense(bill({ amount }), incomes, ids));
  for (const earned of [[], null, { ana: -1 }, { ana: 0.1 }, { ana: '100' }])
    assert.throws(() => splitExpense(bill(), earned, ids));
  for (const status of ['unknown', null, undefined])
    assert.throws(() => splitExpense(bill({ status }), incomes, ids));
  for (const split of ['personal0', 'personal1', 'unknown', undefined])
    assert.throws(() => splitExpense(bill({ split }), incomes, ids));
  assert.throws(() => summarize(null, incomes, ids));
  assert.throws(() => splitExpense(null, incomes, ids));
});

test('expense aggregate overflow is rejected and individual maximum values stay exact', () => {
  const members = ['a'];
  const big = bill({ amount: Number.MAX_SAFE_INTEGER, participants: members, payer: 'a' });
  assert.equal(summarize([big], {}, members).total, Number.MAX_SAFE_INTEGER);
  assert.throws(() => summarize([big, { ...big, amount: 1 }], {}, members), /limite/);
});
