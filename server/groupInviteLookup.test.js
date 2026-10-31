import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupInviteLookup } from './groupInviteLookup.js';

const token = {
  uid: 'owner',
  email: 'owner@example.com',
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
};
const account = {
  uid: 'member',
  emailVerified: true,
  displayName: 'Beatriz Silva',
  providerData: [{ providerId: 'google.com' }],
  phoneNumber: 'secret',
  salary: 500000,
};
const dependencies = {
  verifyToken: async () => token,
  getGroup: async () => ({ adminUid: 'owner' }),
  lookupUser: async () => account,
  lookupProfileName: async () => 'Bia',
  consumeLookup: async () => true,
};
async function request(overrides = {}, reqOverrides = {}) {
  const response = {
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
  await createGroupInviteLookup({ ...dependencies, ...overrides })(
    {
      method: 'POST',
      headers: { authorization: 'Bearer valid' },
      body: { email: 'member@example.com', groupId: 'owner_home' },
      ...reqOverrides,
    },
    response,
  );
  return response;
}

test('lookup returns only the account name to the owner of an active group', async () => {
  const response = await request();
  assert.equal(response.code, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(response.body, { found: true, name: 'Bia' });
  assert.deepEqual((await request({ lookupProfileName: async () => null })).body, {
    found: true,
    name: 'Beatriz Silva',
  });
  assert.deepEqual((await request({ lookupUser: async () => null })).body, {
    found: false,
    name: null,
  });
  assert.deepEqual(
    (
      await request({
        lookupUser: async () => ({ ...account, providerData: [{ providerId: 'password' }] }),
      })
    ).body,
    { found: false, name: null },
  );
});

test('unauthorized, password-only, deleted and rate-limited requests cannot search accounts', async () => {
  let searches = 0;
  const lookupUser = async () => {
    searches += 1;
    return account;
  };
  const cases = [
    [{}, { headers: {} }, 401],
    [
      {
        verifyToken: async () => {
          throw new Error('invalid');
        },
      },
      {},
      401,
    ],
    [
      { verifyToken: async () => ({ ...token, firebase: { sign_in_provider: 'password' } }) },
      {},
      403,
    ],
    [{ getGroup: async () => ({ adminUid: 'other' }) }, {}, 403],
    [{ getGroup: async () => ({ adminUid: 'owner', deleted: true }) }, {}, 403],
    [{ consumeLookup: async () => false }, {}, 429],
    [{}, { method: 'GET' }, 405],
    [{}, { body: { email: 'invalid', groupId: 'owner_home' } }, 400],
    [{}, { body: { email: 'owner@example.com', groupId: 'owner_home' } }, 400],
  ];
  for (const [overrides, req, status] of cases)
    assert.equal((await request({ ...overrides, lookupUser }, req)).code, status);
  assert.equal(searches, 0);
});

test('missing server credentials are actionable and unexpected errors never expose internals', async () => {
  const missing = await request({
    verifyToken: async () => {
      throw Object.assign(new Error('Servidor não configurado.'), { status: 503 });
    },
  });
  assert.equal(missing.code, 503);
  const failed = await request({
    lookupUser: async () => {
      throw new Error('secret credential');
    },
  });
  assert.equal(failed.code, 500);
  assert.ok(!JSON.stringify(failed.body).includes('secret'));
});
