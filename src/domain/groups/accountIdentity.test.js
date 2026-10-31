import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGoogleAccountName } from './accountIdentity.js';
import { migrateData } from '../budget/workspaceCalculations.js';

const googleUser = {
  uid: 'ana-account',
  displayName: 'Ana Silva',
  providerData: [{ providerId: 'google.com', displayName: 'Ana Silva' }],
};

test('Google profile replaces only the default name and preserves IDs and history', () => {
  const data = migrateData(null);
  data.months = { '2026-10': { 'person-0': 300000 } };
  const next = applyGoogleAccountName(data, googleUser);
  assert.deepEqual(next.people[0], {
    id: 'person-0',
    name: 'Ana Silva',
    accountUid: 'ana-account',
  });
  assert.equal(next.months, data.months);
  assert.equal(data.people[0].name, 'Você');
  assert.equal(applyGoogleAccountName(next, googleUser), next);
});

test('custom names, other accounts, missing names and non-Google logins are preserved', () => {
  const data = migrateData(null);
  for (const user of [
    null,
    { uid: 'ana-account', displayName: 'Ana' },
    { ...googleUser, displayName: '', providerData: [{ providerId: 'google.com' }] },
  ])
    assert.equal(applyGoogleAccountName(data, user), data);
  const named = { ...data, people: [{ id: 'person-0', name: 'Nome escolhido' }] };
  assert.equal(applyGoogleAccountName(named, googleUser), named);
  const other = { ...data, people: [{ id: 'person-0', name: 'Você', accountUid: 'another' }] };
  assert.equal(applyGoogleAccountName(other, googleUser), other);
  const matchingName = {
    ...data,
    people: [{ id: 'other-person', name: 'Ana Silva' }, ...data.people],
  };
  assert.equal(applyGoogleAccountName(matchingName, googleUser).people[0], matchingName.people[0]);
  const literal = applyGoogleAccountName(data, {
    ...googleUser,
    providerData: [{ providerId: 'google.com', displayName: 'Você' }],
  });
  assert.equal(
    applyGoogleAccountName(literal, {
      ...googleUser,
      providerData: [{ providerId: 'google.com', displayName: 'Você' }],
    }),
    literal,
  );
});
