import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../expenses/expenseCalculations.js';
import {
  applySettlements,
  validateNewSettlement,
  validateSettlementRecord,
  MAX_RECEIPT_BYTES,
} from './settlementCalculations.js';
const members = ['ana', 'bia', 'cris'];
const expense = {
  id: 'bill',
  amount: 90000,
  split: 'equal',
  participants: members,
  payer: 'ana',
  status: 'paid',
};
const base = () => summarize([expense], {}, members);
const transfer = (overrides = {}) => ({
  id: 'transfer1',
  scope: 'group:home',
  from: 'bia',
  to: 'ana',
  amount: 10000,
  date: '2026-11-03',
  referenceMonth: '2026-10',
  note: 'Acerto parcial',
  status: 'confirmed',
  ...overrides,
});

test('partial confirmed transfers lower debt and credit without changing expenses or income', () => {
  const original = { ...base(), income: 300000, available: 210000 },
    snapshot = structuredClone(original),
    result = applySettlements(original, [transfer()], members);
  assert.deepEqual(result.balances, { ana: 50000, bia: -20000, cris: -30000 });
  assert.deepEqual(result.transfers, [
    { from: 'bia', to: 'ana', amount: 20000 },
    { from: 'cris', to: 'ana', amount: 30000 },
  ]);
  for (const field of ['total', 'paid', 'pending', 'shares', 'paidBy', 'income', 'available'])
    assert.deepEqual(result[field], original[field]);
  assert.deepEqual(original, snapshot);
});

test('fully paid balances remove suggested transfers and voided history does nothing', () => {
  const full = [transfer({ amount: 30000 }), transfer({ id: 't2', from: 'cris', amount: 30000 })];
  const settled = applySettlements(base(), full, members);
  assert.deepEqual(settled.balances, { ana: 0, bia: 0, cris: 0 });
  assert.deepEqual(settled.transfers, []);
  const voided = applySettlements(base(), [transfer({ status: 'void' })], members);
  assert.deepEqual(voided, base());
});

test('new transfer validation uses already adjusted balances and rejects overpayments', () => {
  const stats = applySettlements(base(), [transfer({ amount: 25000 })], members);
  const last = transfer({ id: 'last', amount: 5000 });
  assert.equal(validateNewSettlement(last, stats, members), last);
  for (const record of [
    transfer({ amount: 5001 }),
    transfer({ from: 'ana', to: 'bia' }),
    transfer({ from: 'bia', to: 'cris' }),
    transfer({ from: 'bia', to: 'bia' }),
    transfer({ status: 'void' }),
  ])
    assert.throws(() => validateNewSettlement(record, stats, members));
  const multiple = summarize(
    [
      { ...expense, amount: 120000, participants: ['bia', 'cris'], payer: 'ana' },
      { ...expense, id: 'other', amount: 40000, participants: ['bia'], payer: 'cris' },
    ],
    {},
    members,
  );
  assert.throws(() =>
    validateNewSettlement(transfer({ to: 'cris', amount: 50000 }), multiple, members),
  );
});

test('historical overpayment after expense edits remains valid and reverses the obligation', () => {
  const historical = transfer({ amount: 40000 });
  assert.doesNotThrow(() => validateSettlementRecord(historical, members));
  assert.throws(() => validateNewSettlement(historical, base(), members));
  const result = applySettlements(base(), [historical], members);
  assert.deepEqual(result.balances, { ana: 20000, bia: 10000, cris: -30000 });
  assert.deepEqual(result.transfers, [
    { from: 'cris', to: 'ana', amount: 20000 },
    { from: 'cris', to: 'bia', amount: 10000 },
  ]);
});

test('validates transfer identity, group scope, members, positive cents, dates and note', () => {
  for (const record of [
    null,
    transfer({ id: '' }),
    transfer({ scope: 'person:ana' }),
    transfer({ scope: 'group:' }),
    transfer({ from: 'missing' }),
    transfer({ to: 'missing' }),
    transfer({ amount: 0 }),
    transfer({ amount: -1 }),
    transfer({ amount: 0.1 }),
    transfer({ date: '2026-02-30' }),
    transfer({ referenceMonth: '2026-13' }),
    transfer({ note: null }),
    transfer({ status: 'pending' }),
  ])
    assert.throws(() => validateSettlementRecord(record, members));
  assert.doesNotThrow(() => validateSettlementRecord(transfer(), members));
  assert.throws(() => applySettlements(base(), [transfer(), transfer()], members), /duplicado/);
  assert.throws(
    () => applySettlements({ ...base(), balances: { ana: 1, bia: 0, cris: 0 } }, [], members),
    /compensar/,
  );
});

test('receipt metadata accepts only nonempty supported files up to 5 MB', () => {
  const receipt = {
    id: 'r1',
    name: 'comprovante.pdf',
    type: 'application/pdf',
    size: MAX_RECEIPT_BYTES,
  };
  assert.doesNotThrow(() => validateSettlementRecord(transfer({ receipt }), members));
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    assert.doesNotThrow(() =>
      validateSettlementRecord(transfer({ receipt: { ...receipt, type } }), members),
    );
  for (const bad of [
    null,
    { ...receipt, id: '' },
    { ...receipt, name: '' },
    { ...receipt, type: 'text/html' },
    { ...receipt, size: MAX_RECEIPT_BYTES + 1 },
    { ...receipt, size: 0 },
    { ...receipt, size: 1.2 },
    { ...receipt, size: '100' },
  ])
    assert.throws(() => validateSettlementRecord(transfer({ receipt: bad }), members));
});

test('settlement adjustment keeps prototype-shaped member IDs as own data fields', () => {
  const ids = ['__proto__', 'constructor'];
  const stats = summarize(
    [{ ...expense, participants: ids, payer: '__proto__', amount: 100 }],
    {},
    ids,
  );
  const result = applySettlements(
    stats,
    [transfer({ from: 'constructor', to: '__proto__', amount: 50 })],
    ids,
  );
  assert.deepEqual(result.balances, Object.fromEntries(ids.map((id) => [id, 0])));
  assert.deepEqual(result.transfers, []);
});
