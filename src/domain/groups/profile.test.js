import test from 'node:test';
import assert from 'node:assert/strict';
import { profilePerson, saveProfile } from './profile.js';
import { migrateData } from '../budget/workspaceCalculations.js';
import { projectSharedGroup } from './groupSharing.js';

test('profile edits the linked account only and preserves all financial history', () => {
  const data = migrateData(null);
  data.people.push({ id: 'b', name: 'Bia', accountUid: 'bia' });
  data.groups = [{ id: 'g', name: 'Casa', memberIds: ['person-0', 'b'] }];
  const fields = {
    name: ' Beatriz ',
    phone: '11912345678',
    city: 'Cidade privada',
    occupation: 'Ocupação privada',
  };
  const next = saveProfile(data, 'bia', fields);
  assert.equal(profilePerson(next, 'bia').id, 'b');
  assert.equal(next.people[0], data.people[0]);
  assert.equal(next.people[1].name, 'Beatriz');
  assert.equal(next.people[1].profile.phone, fields.phone);
  for (const key of ['months', 'incomeConfigs', 'expenses', 'groups', 'settlements'])
    assert.equal(next[key], data[key]);
  assert.equal(migrateData(next).people[1].profile.city, fields.city);
  const shared = JSON.stringify(projectSharedGroup(next, 'g'));
  for (const value of [fields.phone, fields.city, fields.occupation, 'accountUid'])
    assert.ok(!shared.includes(value));
  assert.ok(shared.includes('Beatriz'));
});

test('legacy own profile can be linked without using another account and invalid fields are rejected', () => {
  const data = migrateData(null);
  const next = saveProfile(data, 'ana', { name: 'Ana' });
  assert.equal(next.people[0].accountUid, 'ana');
  assert.equal(profilePerson(next, 'other'), null);
  assert.throws(() => saveProfile(next, 'other', { name: 'Outra' }));
  for (const fields of [
    { name: '' },
    { name: 'a'.repeat(61) },
    { name: 'Ana', phone: '1'.repeat(31) },
    { name: 'Ana', city: 'a'.repeat(101) },
  ])
    assert.throws(() => saveProfile(data, 'ana', fields));
});
