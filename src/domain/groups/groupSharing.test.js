import { publicGroupStats } from './groupOverview.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInviteEmail, projectSharedGroup, invitableGroupMembers } from './groupSharing.js';
import { calculateWorkspace, migrateData } from '../budget/workspaceCalculations.js';

test('invite choices exclude the administrator, removed participants and archived groups', () => {
  const group = { memberIds: ['a', 'b', 'c'], adminPersonId: 'a', removedMemberIds: ['c'] };
  assert.deepEqual(invitableGroupMembers(group), ['b']);
  assert.deepEqual(invitableGroupMembers({ ...group, deleted: true }), []);
  assert.deepEqual(invitableGroupMembers(undefined), []);
});

test('normalizes invite email and rejects malformed addresses', () => {
  assert.equal(normalizeInviteEmail('  Ana@Example.COM '), 'ana@example.com');
  for (const value of [
    '',
    'ana',
    'ana@',
    'a b@example.com',
    'a@example',
    'a'.repeat(250) + '@x.com',
  ])
    assert.throws(() => normalizeInviteEmail(value));
});
test('shares only group history with exact existing participant IDs and calculated shares', () => {
  const expense = {
    id: 'e',
    description: 'Conta',
    amount: 10001,
    date: '2026-10-02',
    workspace: 'group:g',
    status: 'paid',
    payer: 'a',
    participants: ['a', 'b'],
    split: 'proportional',
    privateNote: 'secret',
    receipt: { name: 'secret.pdf' },
  };
  const data = {
    people: [
      { id: 'a', name: 'Ana', email: 'secret@example.com' },
      { id: 'b', name: 'Bia' },
      { id: 'c', name: 'Outra' },
    ],
    groups: [{ id: 'g', name: 'Casa', memberIds: ['a', 'b'] }],
    months: { '2026-10': { a: 100, b: 300, c: 900 } },
    incomeConfigs: { secret: true },
    expenses: [
      expense,
      { ...expense, id: 'personal', workspace: 'person:a' },
      { ...expense, id: 'other', workspace: 'group:other' },
    ],
    settlements: [
      {
        id: 's',
        scope: 'group:g',
        from: 'b',
        to: 'a',
        amount: 50,
        date: '2026-10-03',
        referenceMonth: '2026-10',
        status: 'confirmed',
        note: 'private',
        receipt: { id: 'secret' },
      },
      { id: 'other', scope: 'group:other' },
    ],
  };
  const result = projectSharedGroup(data, 'g');
  assert.deepEqual(result.people, [
    { id: 'a', name: 'Ana' },
    { id: 'b', name: 'Bia' },
  ]);
  assert.equal(result.expenses.length, 1);
  assert.deepEqual(result.expenses[0].shares, { a: 2500, b: 7501 });
  assert.equal(result.settlements.length, 1);
  assert.equal(result.settlements[0].id, 's');
  assert.equal(result.overview['2026-10'].stats.income, undefined);
  assert.equal(result.overview['2026-10'].stats.available, undefined);
  assert.equal(result.overview['2026-10'].stats.total, 10001);
  assert.deepEqual(result.overview['2026-10'].stats.shares, { a: 2500, b: 7501 });
  const json = JSON.stringify(result);
  for (const secret of [
    'secret',
    'private',
    'personal',
    'incomeConfigs',
    'months',
    'receipt',
    'email',
  ])
    assert.ok(!json.includes(secret));
  assert.equal(data.expenses[0], expense);
  assert.throws(() => projectSharedGroup(data, 'missing'));
});

test('shared overview matches common owner totals and budget without sharing salaries or benefits while isolating personal records', () => {
  const data = migrateData(null);
  data.groups = [{ id: 'g', name: 'Casa', memberIds: ['person-0'] }];
  data.months = { '2026-10': { 'person-0': 500000 } };
  data.incomeConfigs = { '2026-10': { 'person-0': { foodAllowance: 30000 } } };
  data.contributions = [
    { id: 'shared', scope: 'group:g', amount: 20000, date: '2026-10-01' },
    { id: 'private', scope: 'person:person-0', amount: 90000, date: '2026-10-01' },
  ];
  data.plans = { 'group:g|2026-10': { spendingLimit: 100000, savingTarget: 50000 } };
  const shared = projectSharedGroup(data, 'g');
  assert.deepEqual(
    shared.overview['2026-10'].stats,
    publicGroupStats(calculateWorkspace(data, '2026-10', 'group:g', data.months['2026-10'])),
  );
  assert.deepEqual(shared.overview['2026-10'].plan, {
    ...data.plans['group:g|2026-10'],
    categories: {},
  });
  assert.equal(shared.overview['2026-10'].benefits, undefined);
  assert.equal(shared.overview['2026-10'].stats.income, undefined);
  assert.equal(shared.overview['2026-10'].stats.available, undefined);
  assert.ok(!JSON.stringify(shared).includes('500000'));
  assert.ok(!JSON.stringify(shared).includes('30000'));
  assert.equal(shared.emptyOverview.stats.total, 0);
  assert.equal(shared.emptyOverview.stats.savingsAll, 20000);
  assert.ok(!JSON.stringify(shared).includes('private'));
});
