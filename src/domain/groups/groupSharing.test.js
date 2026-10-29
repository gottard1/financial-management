import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInviteEmail, projectSharedGroup } from './groupSharing.js';

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
