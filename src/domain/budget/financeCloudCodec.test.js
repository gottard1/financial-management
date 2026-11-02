import test from 'node:test';
import assert from 'node:assert/strict';
import { financeJson, encodeFinance, decodeFinance } from './financeCloudCodec.js';
import { migrateData } from './workspaceCalculations.js';

function records(data, revision = 1) {
  const encoded = encodeFinance(data);
  return [
    {
      id: 'state',
      schemaVersion: 2,
      revision,
      recordCount: encoded.records.length,
      orders: encoded.orders,
    },
    ...encoded.records.map((item) => ({ ...item, revision })),
  ];
}
test('preserves financial fields, empty months and original order through entity-based storage', () => {
  const original = migrateData(null);
  original.people.push({ id: 'a-first', name: 'Ana' });
  original.months = { '2026-10': { 'person-0': 450000 }, '2026-11': {} };
  assert.deepEqual(decodeFinance(records(original)).data, original);
  assert.equal(decodeFinance(records(original, 12)).revision, 12);
  assert.equal(decodeFinance([]), null);
  assert.deepEqual(
    encodeFinance(original).records.map((item) => item.kind),
    ['people', 'people', 'income', 'income'],
  );
});
test('preserves large Unicode records without truncation and keeps documents independently identified', () => {
  const original = migrateData(null);
  original.people[0].notes = '🧾'.repeat(70000);
  const encoded = encodeFinance(original);
  assert.equal(encoded.records.length, 1);
  assert.equal(encoded.records[0].id, 'people:person-0');
  assert.deepEqual(decodeFinance(records(original)).data, original);
});
test('rejects incomplete or malformed cloud data rather than replacing the local history', () => {
  const valid = records(migrateData(null));
  assert.throws(() => decodeFinance(valid.slice(0, 1)));
  assert.throws(() => decodeFinance([valid[1]]));
  assert.throws(() => decodeFinance([{ ...valid[0], recordCount: 25 }, valid[1]]));
  assert.throws(() => decodeFinance([valid[0], { ...valid[1], revision: 2 }]));
  assert.throws(() => decodeFinance([valid[0], { ...valid[1], payload: '{bad' }]));
  assert.throws(() => decodeFinance([valid[0], { ...valid[1], id: 'people:other' }]));
});
test('compares deterministically regardless of map order and rejects an oversized entity before upload', () => {
  const original = migrateData(null);
  assert.equal(
    financeJson(original),
    financeJson(Object.fromEntries(Object.entries(original).reverse())),
  );
  original.people[0].notes = 'x'.repeat(750001);
  assert.throws(() => encodeFinance(original));
});

test('legacy cloud orders without payment requests remain compatible', () => {
  const original = migrateData(null);
  const legacy = records(original);
  delete legacy[0].orders.paymentReports;
  assert.deepEqual(decodeFinance(legacy).data, original);
});

test('payment requests retain recipient, state and scope across private cloud serialization', () => {
  const data = migrateData(null);
  data.people.push({ id: 'payer', name: 'João' });
  data.groups = [
    { id: 'plans', name: 'Planos', memberIds: ['person-0', 'payer'], adminPersonId: 'person-0' },
  ];
  data.paymentReports = [
    {
      id: 'r1',
      scope: 'group:plans',
      month: '2026-11',
      from: 'payer',
      to: 'person-0',
      amount: 1200,
      date: '2026-11-02',
      requestedBy: 'payer',
      status: 'pending',
    },
  ];
  assert.deepEqual(decodeFinance(records(data)).data.paymentReports, data.paymentReports);
  const invalid = structuredClone(data);
  invalid.paymentReports[0].to = 'stranger';
  assert.throws(() => encodeFinance(invalid));
});
