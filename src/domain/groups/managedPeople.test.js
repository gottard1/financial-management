import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activePeople,
  personRemovalGroups,
  removeManagedPerson,
  removeManagedPersonWithAccess,
  restoreManagedPerson,
} from './managedPeople.js';
import { activeGroupMembers } from './groupMembers.js';
import { migrateData, calculateWorkspace } from '../budget/workspaceCalculations.js';
import { projectSharedGroup } from './groupSharing.js';
import { prepareEmailInvitation } from './emailInvitation.js';
import { financeJson } from '../budget/financeCloudCodec.js';

function fixture() {
  return {
    ...migrateData(null),
    people: [
      { id: 'person-0', name: 'Maria', accountUid: 'admin' },
      { id: 'joao', name: 'João', inviteEmail: 'joao@example.com' },
      { id: 'ana', name: 'Ana' },
    ],
    groups: [
      { id: 'home', name: 'Casa', memberIds: ['person-0', 'joao'], adminPersonId: 'person-0' },
      { id: 'trip', name: 'Viagem', memberIds: ['person-0', 'joao'], adminPersonId: 'person-0' },
      { id: 'other', name: 'Outros planos', memberIds: ['person-0', 'ana'] },
    ],
    months: { '2026-11': { 'person-0': 10000, joao: 20000 } },
    expenses: [
      {
        id: 'bill',
        description: 'Luz',
        amount: 3600,
        category: 'Moradia',
        date: '2026-11-02',
        workspace: 'group:home',
        payer: 'person-0',
        participants: ['person-0', 'joao'],
        split: 'proportional',
        percentages: {},
        status: 'paid',
        fixed: false,
      },
    ],
    settlements: [
      {
        id: 'receipt',
        scope: 'group:home',
        from: 'joao',
        to: 'person-0',
        amount: 1200,
        date: '2026-11-02',
        referenceMonth: '2026-11',
        status: 'confirmed',
        note: '',
      },
    ],
  };
}

test('removing a managed person preserves history and balances across groups and backup round trips', () => {
  const data = fixture();
  const before = financeJson(data);
  const balances = calculateWorkspace(data, '2026-11', 'group:home', data.months['2026-11']);
  const next = removeManagedPerson(data, 'joao', 'admin');
  assert.deepEqual(
    activePeople(next).map((person) => person.id),
    ['person-0', 'ana'],
  );
  assert.equal(next.people.find((person) => person.id === 'joao').name, 'João');
  for (const group of next.groups.slice(0, 2)) {
    assert.deepEqual(activeGroupMembers(group), ['person-0']);
    assert.deepEqual(group.memberIds, ['person-0', 'joao']);
  }
  assert.equal(next.groups[2], data.groups[2]);
  for (const key of [
    'expenses',
    'settlements',
    'months',
    'incomeConfigs',
    'paymentReports',
    'plans',
  ])
    assert.equal(next[key], data[key]);
  assert.deepEqual(
    calculateWorkspace(next, '2026-11', 'group:home', next.months['2026-11']),
    balances,
  );
  assert.deepEqual(projectSharedGroup(next, 'home').activeMemberIds, ['person-0']);
  assert.equal(financeJson(migrateData(JSON.parse(financeJson(next)))), financeJson(next));
  assert.equal(financeJson(data), before);
});

test('own profile, group administrator and a sole active group member are protected', () => {
  const data = fixture();
  assert.throws(() => removeManagedPerson(data, 'person-0', 'admin'), /administrador/);
  const renamedAdmin = {
    ...data,
    groups: [{ ...data.groups[0], adminPersonId: 'joao' }],
  };
  assert.throws(() => removeManagedPerson(renamedAdmin, 'joao', 'admin'), /administrador/);
  const solo = { ...data, groups: [{ id: 'solo', name: 'Plano solo', memberIds: ['joao'] }] };
  assert.throws(() => removeManagedPerson(solo, 'joao', 'admin'), /Plano solo/);
  assert.equal(
    removeManagedPerson({ ...solo, groups: [] }, 'joao', 'admin').people[1].removed,
    true,
  );
  assert.throws(() => removeManagedPerson(data, 'missing', 'admin'), /não está disponível/);
});

test('restoring a person never reactivates membership or invites', () => {
  const removed = removeManagedPerson(fixture(), 'joao', 'admin');
  assert.throws(() => removeManagedPerson(removed, 'joao', 'admin'), /já foi removida/);
  for (const personId of ['joao', undefined])
    assert.throws(
      () =>
        prepareEmailInvitation(removed, {
          groupId: 'home',
          email: 'joao@example.com',
          name: 'João',
          personId,
          newPersonId: 'another',
        }),
      /Reative o cadastro/,
    );
  const restored = restoreManagedPerson(removed, 'joao');
  assert.equal(activePeople(restored).length, 3);
  assert.equal(restored.groups, removed.groups);
  assert.deepEqual(activeGroupMembers(restored.groups[0]), ['person-0']);
  assert.equal(restored.people[1].inviteEmail, 'joao@example.com');
  assert.throws(() => restoreManagedPerson(restored, 'joao'), /não está removido/);
});

test('archived groups and previously removed memberships keep their history intact', () => {
  const data = fixture();
  data.groups[0].removedMemberIds = ['joao'];
  data.groups[1].deleted = true;
  assert.deepEqual(
    personRemovalGroups(data, 'joao', 'admin').map((group) => group.id),
    ['home'],
  );
  const next = removeManagedPerson(data, 'joao', 'admin');
  assert.deepEqual(next.groups[0].removedMemberIds, ['joao']);
  assert.equal(next.groups[1], data.groups[1]);
  assert.doesNotThrow(() => migrateData(next));
});

test('access removal completes for every linked group before hiding the person', async () => {
  let current = fixture();
  const revoked = [];
  await removeManagedPersonWithAccess({
    data: current,
    personId: 'joao',
    uid: 'admin',
    revokeAccess: async (groupId, personId) => {
      assert.equal(personId, 'joao');
      assert.equal(current.people[1].removed, undefined);
      revoked.push(groupId);
    },
    commitData: async (update) => (current = migrateData(update(current))),
  });
  assert.deepEqual(revoked, ['home', 'trip']);
  assert.equal(current.people[1].removed, true);
});

test('a failed revocation preserves completed steps and retry finishes without duplicating history', async () => {
  let current = fixture();
  const originalExpenses = current.expenses;
  const commitData = async (update) => (current = update(current));
  await assert.rejects(
    removeManagedPersonWithAccess({
      data: current,
      personId: 'joao',
      uid: 'admin',
      commitData,
      revokeAccess: async (groupId) => {
        if (groupId === 'trip') throw new Error('offline');
      },
    }),
    /offline/,
  );
  assert.equal(current.people[1].removed, undefined);
  assert.deepEqual(activeGroupMembers(current.groups[0]), ['person-0']);
  assert.deepEqual(activeGroupMembers(current.groups[1]), ['person-0', 'joao']);
  const retried = [];
  await removeManagedPersonWithAccess({
    data: current,
    personId: 'joao',
    uid: 'admin',
    commitData,
    revokeAccess: async (groupId) => retried.push(groupId),
  });
  assert.deepEqual(retried, ['home', 'trip']);
  assert.equal(current.people[1].removed, true);
  assert.equal(current.expenses, originalExpenses);
});

test('invalid removal is rejected before side effects and concurrent new groups require a retry', async () => {
  const data = fixture();
  let effects = 0;
  await assert.rejects(
    removeManagedPersonWithAccess({
      data,
      personId: 'person-0',
      uid: 'admin',
      revokeAccess: async () => {
        effects += 1;
      },
      commitData: async () => {
        effects += 1;
      },
    }),
    /administrador/,
  );
  assert.equal(effects, 0);
  const changed = { ...data, groups: [...data.groups, { ...data.groups[0], id: 'new' }] };
  await assert.rejects(
    removeManagedPersonWithAccess({
      data,
      personId: 'joao',
      uid: 'admin',
      commitData: async (update) => update(changed),
    }),
    /vínculos desta pessoa mudaram/,
  );
});

test('backup validation rejects invalid removal flags and an entirely removed people list', () => {
  const data = fixture();
  assert.throws(
    () =>
      migrateData({
        ...data,
        people: data.people.map((person) =>
          person.id === 'joao' ? { ...person, removed: true } : person,
        ),
      }),
    /participação ativa/,
  );
  assert.throws(
    () => migrateData({ ...data, people: [{ id: 'a', name: 'Ana', removed: 'true' }] }),
    /Situação da pessoa/,
  );
  assert.throws(
    () =>
      migrateData({ ...data, people: data.people.map((person) => ({ ...person, removed: true })) }),
    /pelo menos uma pessoa/,
  );
});
