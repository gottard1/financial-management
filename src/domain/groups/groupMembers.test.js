import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeGroupMembers,
  removeGroupMember,
  deleteGroup,
  purgeGroupHistoryBatch,
  groupHistoryCount,
} from './groupMembers.js';
import { migrateData, calculateWorkspace } from '../budget/workspaceCalculations.js';
import { projectSharedGroup } from './groupSharing.js';
import { copyRecurringExpenses } from '../expenses/recurringExpenses.js';

function fixture() {
  return {
    ...migrateData(null),
    people: [
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Bia' },
    ],
    groups: [{ id: 'home', name: 'Casa', memberIds: ['a', 'b'] }],
    months: { '2026-10': { a: 10000, b: 20000 } },
    expenses: [
      {
        id: 'bill',
        description: 'Luz',
        amount: 30000,
        category: 'Moradia',
        date: '2026-10-20',
        workspace: 'group:home',
        payer: 'b',
        participants: ['a', 'b'],
        percentages: {},
        split: 'proportional',
        status: 'paid',
        fixed: true,
      },
    ],
    settlements: [
      {
        id: 's',
        scope: 'group:home',
        from: 'a',
        to: 'b',
        amount: 2000,
        date: '2026-10-21',
        referenceMonth: '2026-10',
        note: '',
        status: 'confirmed',
      },
    ],
  };
}

test('permanent purge removes only the archived group history, preserving people, income and other scopes', () => {
  const original = fixture();
  const personal = {
    ...original.expenses[0],
    id: 'personal',
    workspace: 'person:a',
    participants: ['a'],
    payer: 'a',
    split: 'equal',
  };
  const other = { ...original.expenses[0], id: 'other', workspace: 'group:other' };
  const data = {
    ...original,
    groups: [
      { ...original.groups[0], deleted: true },
      { ...original.groups[0], id: 'other' },
    ],
    expenses: [...original.expenses, personal, other],
    goals: [{ id: 'goal', scope: 'group:home', title: 'Reserva', target: 100000, targetDate: '' }],
    contributions: [
      {
        id: 'deposit',
        scope: 'group:home',
        date: '2026-10-20',
        amount: 1000,
        goalId: 'goal',
        note: '',
      },
    ],
    plans: {
      'group:home|2026-10': { spendingLimit: 100000, savingTarget: 1000, categories: {} },
      'group:other|2026-10': { spendingLimit: 50000, savingTarget: 0, categories: {} },
    },
  };
  let next = migrateData(data);
  while (next.groups.some((group) => group.id === 'home')) {
    const before = groupHistoryCount(next, 'home');
    next = purgeGroupHistoryBatch(next, 'home', 1);
    migrateData(next);
    assert.ok(before - groupHistoryCount(next, 'home') <= 1);
  }
  assert.deepEqual(
    next.groups.map((item) => item.id),
    ['other'],
  );
  assert.deepEqual(
    next.expenses.map((item) => item.id),
    ['personal', 'other'],
  );
  assert.equal(next.settlements.length, 0);
  assert.equal(purgeGroupHistoryBatch(next, 'home'), next);
  assert.equal(next.goals.length, 0);
  assert.equal(next.contributions.length, 0);
  assert.deepEqual(Object.keys(next.plans), ['group:other|2026-10']);
  assert.deepEqual(next.months, data.months);
  assert.deepEqual(next.people, data.people);
  assert.throws(() => purgeGroupHistoryBatch(original, 'home'));
});

test('large histories purge in bounded resumable steps, with no orphaned records or lost receipt cleanup IDs', () => {
  const original = fixture();
  let data = {
    ...original,
    groups: [{ ...original.groups[0], deleted: true }],
    expenses: Array.from({ length: 700 }, (_, index) => ({
      ...original.expenses[0],
      id: `bill-${index}`,
    })),
    settlements: [
      {
        ...original.settlements[0],
        receipt: { id: 'receipt', name: 'file.pdf', type: 'application/pdf', size: 100 },
      },
    ],
  };
  data = migrateData(data);
  let steps = 0;
  while (data.groups.length) {
    data = purgeGroupHistoryBatch(data, 'home');
    data = migrateData(JSON.parse(JSON.stringify(data)));
    steps += 1;
    if (data.groups.length) {
      assert.equal(data.groups[0].purging, true);
      assert.deepEqual(data.groups[0].purgeReceiptIds, ['receipt']);
    }
  }
  assert.equal(steps, 3);
  assert.equal(data.expenses.length, 0);
  assert.equal(data.settlements.length, 0);
  assert.equal(data.people.length, 2);
});
test('group deletion preserves financial history and permits exclusion of a single-member group', () => {
  const original = fixture();
  const before = calculateWorkspace(original, '2026-10', 'group:home', original.months['2026-10']);
  const archived = deleteGroup(original, 'home');
  assert.equal(archived.groups[0].deleted, true);
  assert.deepEqual(activeGroupMembers(archived.groups[0]), []);
  assert.equal(archived.expenses, original.expenses);
  assert.equal(archived.settlements, original.settlements);
  assert.equal(archived.people, original.people);
  assert.equal(archived.months, original.months);
  assert.deepEqual(
    calculateWorkspace(archived, '2026-10', 'group:home', archived.months['2026-10']),
    before,
  );
  assert.equal(migrateData(archived).groups[0].deleted, true);
  assert.equal(original.groups[0].deleted, undefined);
  assert.throws(() => deleteGroup(archived, 'home'));
  assert.throws(() => deleteGroup(original, 'missing'));
  const last = removeGroupMember(original, 'home', 'b');
  assert.equal(deleteGroup(last, 'home').groups[0].deleted, true);
  assert.throws(() =>
    migrateData({ ...original, groups: [{ ...original.groups[0], deleted: 'yes' }] }),
  );
});

test('removes from active membership without deleting the person, expenses, income or repayments', () => {
  const original = fixture();
  const before = JSON.stringify(original);
  const historical = calculateWorkspace(
    original,
    '2026-10',
    'group:home',
    original.months['2026-10'],
  );
  const next = removeGroupMember(original, 'home', 'b');
  assert.deepEqual(activeGroupMembers(next.groups[0]), ['a']);
  assert.deepEqual(next.groups[0].memberIds, ['a', 'b']);
  assert.equal(JSON.stringify(original), before);
  assert.equal(next.people, original.people);
  assert.equal(next.expenses, original.expenses);
  assert.equal(next.months, original.months);
  assert.equal(next.settlements, original.settlements);
  assert.deepEqual(
    calculateWorkspace(next, '2026-10', 'group:home', next.months['2026-10']),
    historical,
  );
  const projection = projectSharedGroup(next, 'home');
  assert.deepEqual(projection.activeMemberIds, ['a']);
  assert.equal(projection.people.length, 2);
  assert.deepEqual(projection.expenses[0].shares, { a: 10000, b: 20000 });
  assert.deepEqual(migrateData(next).groups, next.groups);
});
test('prevents removal of the last participant, duplicates and invalid archived references', () => {
  const next = removeGroupMember(fixture(), 'home', 'b');
  assert.throws(() => removeGroupMember(next, 'home', 'a'));
  assert.throws(() => removeGroupMember(next, 'home', 'b'));
  assert.throws(() => removeGroupMember(next, 'missing', 'a'));
  for (const removed of [['missing'], ['b', 'b'], ['a', 'b']])
    assert.throws(() =>
      migrateData({
        ...fixture(),
        groups: [{ ...fixture().groups[0], removedMemberIds: removed }],
      }),
    );
});
test('recurring copies cannot reintroduce a removed participant or payer', () => {
  const next = removeGroupMember(fixture(), 'home', 'b');
  const entries = { bill: { selected: true, amount: '320' } };
  assert.throws(
    () =>
      copyRecurringExpenses(
        next.expenses,
        'group:home',
        '2026-11',
        entries,
        undefined,
        activeGroupMembers(next.groups[0]),
      ),
    /removido/,
  );
  const activeOnly = { ...next.expenses[0], participants: ['a'], payer: 'a', split: 'equal' };
  const copies = copyRecurringExpenses(
    [activeOnly],
    'group:home',
    '2026-11',
    entries,
    () => 'copy',
    ['a'],
  );
  assert.deepEqual(copies[0].participants, ['a']);
  assert.equal(copies[0].payer, 'a');
});
