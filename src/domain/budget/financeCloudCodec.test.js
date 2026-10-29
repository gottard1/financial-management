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
