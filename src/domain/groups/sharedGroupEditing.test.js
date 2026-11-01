import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateData } from '../budget/workspaceCalculations.js';
import { projectSharedGroup } from './groupSharing.js';
import {
  applySharedGroupChanges,
  sharedGroupData,
  sharedGroupChanges,
  copySharedRecurring,
} from './sharedGroupEditing.js';

export function fixture() {
  return migrateData({
    ...migrateData(null),
    people: [
      { id: 'a', name: 'Ana', profile: { phone: 'private-phone' } },
      { id: 'b', name: 'Bia' },
      { id: 'c', name: 'Caio' },
    ],
    groups: [
      {
        id: 'g',
        name: 'Casa',
        memberIds: ['a', 'b', 'c'],
        adminPersonId: 'a',
        removedMemberIds: ['c'],
      },
      { id: 'other', name: 'Outro', memberIds: ['a'] },
    ],
    months: { '2026-11': { a: 100000, b: 300000 } },
    expenses: [
      {
        id: 'bill',
        workspace: 'group:g',
        description: 'Luz',
        amount: 10000,
        date: '2026-11-01',
        status: 'paid',
        payer: 'a',
        participants: ['a', 'b'],
        split: 'proportional',
        fixed: true,
      },
      {
        id: 'private',
        workspace: 'person:a',
        description: 'Privada',
        amount: 100,
        date: '2026-11-01',
        status: 'paid',
        payer: 'a',
        participants: ['a'],
        split: 'equal',
      },
    ],
  });
}
test('participants upsert group records with exact proportional splits while private data stays intact', () => {
  const original = fixture();
  const next = applySharedGroupChanges(original, 'g', [
    { kind: 'expenses', id: 'bill', value: { amount: 20001 } },
    {
      kind: 'plans',
      id: 'group:g|2026-11',
      value: { spendingLimit: 50000, categories: { Moradia: 40000 } },
    },
    { kind: 'goals', id: 'goal', value: { title: 'Reserva', target: 100000 } },
    {
      kind: 'contributions',
      id: 'deposit',
      value: { amount: 1000, goalId: 'goal', date: '2026-11-02' },
    },
  ]);
  assert.deepEqual(next.months, original.months);
  assert.deepEqual(next.people, original.people);
  assert.deepEqual(
    next.expenses.find((item) => item.id === 'private'),
    original.expenses[1],
  );
  const snapshot = projectSharedGroup(next, 'g');
  assert.deepEqual(snapshot.expenses[0].shares, { a: 5000, b: 15001, c: 0 });
  assert.equal(snapshot.goals.length, 1);
  assert.equal(snapshot.contributions.length, 1);
  assert.deepEqual(snapshot.overview['2026-11'].plan.categories, { Moradia: 40000 });
  const publicData = sharedGroupData(snapshot);
  assert.ok(!JSON.stringify(publicData).includes('private'));
  assert.deepEqual(publicData.months, {});
  assert.equal(original.expenses[0].amount, 10000);
});
test('shared editing denies deletes, role escalation, other scopes, invalid money and new inactive participants', () => {
  const original = fixture();
  for (const change of [
    { kind: 'delete', id: 'bill', value: {} },
    { kind: 'people', id: 'a', value: { accountUid: 'attacker' } },
    { kind: 'groups', id: 'g', value: { adminPersonId: 'b' } },
    { kind: 'expenses', id: 'private', value: { amount: 2000 } },
    { kind: 'plans', id: 'person:a|2026-11', value: {} },
    { kind: 'expenses', id: 'bill', value: { workspace: 'person:a' } },
    { kind: 'expenses', id: 'bill', value: { participants: ['a', 'c'] } },
    { kind: 'expenses', id: 'bill', value: { amount: -1 } },
  ])
    assert.throws(() => applySharedGroupChanges(original, 'g', [change]));
  const publicData = sharedGroupData(projectSharedGroup(original, 'g'));
  assert.throws(
    () => sharedGroupChanges(publicData, { ...publicData, expenses: [] }),
    /administrador/,
  );
});

test('shared expenses recover their workspace and payment edits round-trip without modifying the public snapshot', () => {
  const original = fixture();
  const snapshot = projectSharedGroup(original, 'g');
  const untouched = JSON.stringify(snapshot);
  const previous = sharedGroupData(snapshot);
  assert.equal(previous.expenses[0].workspace, 'group:g');
  assert.equal(snapshot.expenses[0].workspace, undefined);
  const next = {
    ...previous,
    expenses: previous.expenses.map((expense) => ({ ...expense, payer: 'b', amount: 12000 })),
  };
  const changes = sharedGroupChanges(previous, next);
  assert.equal(changes[0].value.workspace, undefined);
  const saved = applySharedGroupChanges(original, 'g', changes);
  const restored = sharedGroupData(projectSharedGroup(saved, 'g')).expenses[0];
  assert.equal(restored.workspace, 'group:g');
  assert.equal(restored.payer, 'b');
  assert.equal(restored.amount, 12000);
  assert.equal(JSON.stringify(snapshot), untouched);
});
test('shared forms generate allowed patches and recurring copying preserves origin and rejects duplicates', () => {
  const original = fixture();
  const publicData = sharedGroupData(projectSharedGroup(original, 'g'));
  const next = {
    ...publicData,
    expenses: publicData.expenses.map((item) => ({ ...item, description: 'Luz atualizada' })),
  };
  const changes = sharedGroupChanges(publicData, next);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].value.shares, undefined);
  assert.equal(
    applySharedGroupChanges(original, 'g', changes).expenses.find((item) => item.id === 'bill')
      .description,
    'Luz atualizada',
  );
  original.months['2026-12'] = original.months['2026-11'];
  const copied = copySharedRecurring(original, 'g', '2026-12', {
    bill: { selected: true, amount: '120,00' },
  });
  assert.equal(copied.expenses.at(-1).originId, 'bill');
  assert.throws(() =>
    copySharedRecurring(copied, 'g', '2026-12', { bill: { selected: true, amount: '120,00' } }),
  );
});

test('partial expense edits preserve installments and explicit recurrence changes remove them', () => {
  const original = fixture();
  original.expenses[0].installments = { total: 12, current: 2 };
  const edited = applySharedGroupChanges(original, 'g', [
    { kind: 'expenses', id: 'bill', value: { amount: 15000 } },
  ]);
  assert.deepEqual(edited.expenses.at(-1).installments, { total: 12, current: 2 });
  const previous = sharedGroupData(projectSharedGroup(edited, 'g'));
  const next = {
    ...previous,
    expenses: previous.expenses.map(({ installments, ...item }) => ({ ...item, fixed: false })),
  };
  const changes = sharedGroupChanges(previous, next);
  assert.equal(changes[0].value.installments, null);
  assert.equal(
    applySharedGroupChanges(edited, 'g', changes).expenses.at(-1).installments,
    undefined,
  );
});
