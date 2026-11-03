import test from 'node:test';
import assert from 'node:assert/strict';
import { financeSyncErrorMessage } from './financeSyncErrors.js';

test('permission failures explain the rules/project check without pretending to prove their cause', () => {
  const result = financeSyncErrorMessage({
    code: 'permission-denied',
    message: 'private payload and token',
  });
  assert.match(result, /permission-denied/);
  assert.match(result, /mesmo projeto/);
  assert.match(result, /cópia local/);
  assert.ok(!result.includes('private payload'));
  assert.equal(financeSyncErrorMessage({ code: 'firestore/permission-denied' }), result);
});
test('network, expired sessions and quota failures have distinct actionable messages', () => {
  for (const code of ['unavailable', 'deadline-exceeded', 'auth/network-request-failed'])
    assert.match(financeSyncErrorMessage({ code }), /conexão/);
  for (const code of ['unauthenticated', 'auth/user-token-expired', 'auth/invalid-user-token'])
    assert.match(financeSyncErrorMessage({ code }), /mesma conta/);
  assert.match(financeSyncErrorMessage({ code: 'resource-exhausted' }), /cotas/);
});
test('business validation and conflict explanations are preserved, and unknown SDK messages stay private', () => {
  assert.equal(financeSyncErrorMessage(null), '');
  assert.equal(
    financeSyncErrorMessage(new Error('Mais de 450 registros.')),
    'Mais de 450 registros.',
  );
  assert.equal(
    financeSyncErrorMessage({ code: 'finance/conflict', message: 'Versões divergentes.' }),
    'Versões divergentes.',
  );
  assert.match(
    financeSyncErrorMessage({ code: 'failed-precondition', message: 'private key abc' }),
    /failed-precondition/,
  );
  assert.ok(
    !financeSyncErrorMessage({
      code: 'invalid token secret data',
      message: 'private key abc',
    }).includes('secret'),
  );
});
