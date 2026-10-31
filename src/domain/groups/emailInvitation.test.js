import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateData } from '../budget/workspaceCalculations.js';
import { prepareEmailInvitation } from './emailInvitation.js';
import { projectSharedGroup } from './groupSharing.js';

function fixture() {
  const data = migrateData(null);
  data.people[0].name = 'Ana';
  data.groups = [{ id: 'home', name: 'Casa', memberIds: ['person-0'], adminPersonId: 'person-0' }];
  return data;
}
const invitation = { groupId: 'home', email: ' Bia@Example.com ', name: ' Bia ', newPersonId: 'b' };

test('email invitation adds a provisional participant and retries without duplication or profile replacement', () => {
  const data = fixture();
  const first = prepareEmailInvitation(data, invitation);
  assert.deepEqual(first.data.groups[0].memberIds, ['person-0', 'b']);
  assert.deepEqual(first.data.people[1], { id: 'b', name: 'Bia', inviteEmail: 'bia@example.com' });
  assert.equal(data.people.length, 1);
  const retry = prepareEmailInvitation(first.data, {
    ...invitation,
    newPersonId: 'duplicate',
    name: 'Beatriz Silva',
  });
  assert.equal(retry.personId, 'b');
  assert.equal(retry.personName, 'Bia');
  assert.equal(retry.data.people.length, 2);
  const trip = prepareEmailInvitation(
    {
      ...retry.data,
      groups: [
        ...retry.data.groups,
        { id: 'trip', name: 'Viagem', memberIds: ['person-0'], adminPersonId: 'person-0' },
      ],
    },
    { ...invitation, groupId: 'trip', name: 'Beatriz da viagem', newPersonId: 'trip-b' },
  );
  assert.equal(trip.personName, 'Beatriz da viagem');
  assert.equal(trip.data.people.find((person) => person.id === 'b').name, 'Bia');
  assert.equal(
    JSON.stringify(projectSharedGroup(retry.data, 'home')).includes('bia@example.com'),
    false,
  );
});

test('linking an existing participant preserves their name, ID and financial records', () => {
  const data = fixture();
  data.people.push({ id: 'legacy', name: 'Bia da casa' });
  data.groups[0].memberIds.push('legacy');
  const next = prepareEmailInvitation(data, {
    ...invitation,
    personId: 'legacy',
    name: 'Beatriz Silva',
  });
  assert.equal(next.personId, 'legacy');
  assert.equal(next.personName, 'Bia da casa');
  for (const key of ['expenses', 'settlements', 'months', 'incomeConfigs'])
    assert.equal(next.data[key], data[key]);
  assert.throws(() =>
    prepareEmailInvitation(next.data, {
      ...invitation,
      personId: 'legacy',
      email: 'other@example.com',
    }),
  );
  const corrected = prepareEmailInvitation(next.data, {
    ...invitation,
    personId: 'legacy',
    email: 'correct@example.com',
    previousEmail: 'bia@example.com',
  });
  assert.equal(corrected.personId, 'legacy');
  assert.equal(corrected.personName, 'Bia da casa');
});

test('names are not identities and administrator, inactive groups and missing names cannot be invited', () => {
  const data = fixture();
  const sameName = prepareEmailInvitation(data, { ...invitation, name: 'Ana' });
  assert.equal(sameName.data.people.length, 2);
  assert.throws(() => prepareEmailInvitation(data, { ...invitation, personId: 'person-0' }));
  assert.throws(() => prepareEmailInvitation(data, { ...invitation, personId: 'missing' }));
  assert.throws(() => prepareEmailInvitation(data, { ...invitation, name: '' }));
  assert.throws(() =>
    prepareEmailInvitation({ ...data, groups: [{ ...data.groups[0], deleted: true }] }, invitation),
  );
});
