import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateData } from '../budget/workspaceCalculations.js';
import { consolidatedExpenses, consolidatedTotals } from './consolidatedExpenses.js';

function fixture() {
  const data = migrateData(null);
  data.people.push({ id: 'b', name: 'Bia' });
  data.groups = [{ id: 'g', name: 'Casa', memberIds: ['person-0', 'b'] }];
  data.months = { '2026-11': { 'person-0': 10000, b: 20000 } };
  const expense = {
    id: 'personal',
    workspace: 'person:person-0',
    description: 'Gasto pessoal',
    amount: 1000,
    date: '2026-11-01',
    category: 'Outros',
    status: 'paid',
    payer: 'person-0',
    participants: ['person-0'],
    split: 'equal',
    percentages: {},
  };
  data.expenses = [
    expense,
    {
      ...expense,
      id: 'group',
      workspace: 'group:g',
      description: 'Conta compartilhada',
      amount: 10001,
      participants: ['person-0', 'b'],
    },
    {
      ...expense,
      id: 'other-person',
      workspace: 'person:b',
      payer: 'b',
      participants: ['b'],
      amount: 999999,
    },
  ];
  return data;
}
test('personal and shared responsibilities appear together once while other people personal expenses stay private', () => {
  const d = fixture(),
    before = JSON.stringify(d),
    rows = consolidatedExpenses(d, 'person-0', '2026-11');
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.kind === 'group').ownAmount, 5001);
  assert.equal(rows.find((r) => r.kind === 'group').totalAmount, 10001);
  assert.deepEqual(consolidatedTotals(rows), {
    personal: 1000,
    shared: 5001,
    total: 6001,
    cash: 6001,
    benefits: 0,
    paidByMe: 11001,
    incomplete: false,
  });
  assert.equal(JSON.stringify(d), before);
});
test('a payer outside the participants sees the payment with zero responsibility, while unrelated group accounts stay out', () => {
  const d = fixture();
  d.expenses[1].participants = ['b'];
  let rows = consolidatedExpenses(d, 'person-0', '2026-11');
  assert.equal(rows.find((r) => r.kind === 'group').ownAmount, 0);
  assert.equal(consolidatedTotals(rows).total, 1000);
  d.expenses[1].payer = 'b';
  rows = consolidatedExpenses(d, 'person-0', '2026-11');
  assert.equal(rows.length, 1);
});
test('uses invoice competence for cards and due month for old records with exact proportional cents', () => {
  const d = fixture();
  d.expenses[1].split = 'proportional';
  d.expenses[1].cardId = 'c';
  d.expenses[1].invoiceMonth = '2026-11';
  d.expenses[1].date = '2026-12-06';
  const november = consolidatedExpenses(d, 'person-0', '2026-11');
  assert.equal(november.length, 2);
  assert.equal(november.find((r) => r.kind === 'group').ownAmount, 3334);
  assert.equal(consolidatedExpenses(d, 'person-0', '2026-12').length, 0);
});
function remoteGroup() {
  return {
    id: 'other-owner_g',
    adminUid: 'other-owner',
    membership: { groupId: 'other-owner_g', personId: 'remote-me' },
    snapshot: {
      id: 'g',
      name: 'Viagem',
      activeMemberIds: ['remote-me', 'someone'],
      people: [
        { id: 'remote-me', name: 'Eu no grupo' },
        { id: 'someone', name: 'Outra pessoa' },
      ],
      expenses: [
        {
          id: 'group',
          description: 'Despesa convidada',
          date: '2026-11-02',
          amount: 9000,
          category: 'Viagens',
          status: 'paid',
          participants: ['remote-me', 'someone'],
          payer: 'someone',
          split: 'proportional',
          shares: { 'remote-me': 3000, someone: 6000 },
        },
      ],
    },
  };
}
test('invited groups use the authenticated membership identity and public shares without requiring other people income', () => {
  const d = fixture(),
    remote = remoteGroup(),
    rows = consolidatedExpenses(d, 'person-0', '2026-11', [remote, remote], 'me');
  assert.equal(rows.length, 3);
  assert.equal(consolidatedTotals(rows).total, 9001);
  assert.equal(rows.find((r) => r.groupId === remote.id).ownAmount, 3000);
  const wrong = structuredClone(remote);
  wrong.membership.personId = 'foreign';
  assert.equal(consolidatedExpenses(d, 'person-0', '2026-11', [wrong]).length, 2);
  const removed = structuredClone(remote);
  removed.snapshot.activeMemberIds = ['someone'];
  assert.equal(consolidatedExpenses(d, 'person-0', '2026-11', [removed]).length, 2);
});
test('does not sum an owned group projection again or hide a different owner group with the same local ID', () => {
  const d = fixture(),
    remote = remoteGroup();
  remote.adminUid = 'me';
  assert.equal(consolidatedExpenses(d, 'person-0', '2026-11', [remote], 'me').length, 2);
  remote.adminUid = 'other';
  assert.equal(consolidatedExpenses(d, 'person-0', '2026-11', [remote], 'me').length, 3);
});
test('unavailable proportional or remote shares mark totals incomplete instead of fabricating a valid zero', () => {
  const d = fixture();
  d.expenses[1].split = 'proportional';
  d.months = {};
  const remote = remoteGroup();
  delete remote.snapshot.expenses[0].shares;
  const rows = consolidatedExpenses(d, 'person-0', '2026-11', [remote]);
  assert.equal(rows.filter((r) => r.error).length, 2);
  assert.equal(consolidatedTotals(rows).incomplete, true);
  assert.equal(consolidatedTotals(rows).total, 1000);
});
