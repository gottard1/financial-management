import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedGroupFinanceHandler, editSharedGroup } from './sharedGroupFinance.js';
import { migrateData } from '../src/domain/budget/workspaceCalculations.js';
import { encodeFinance, decodeFinance } from '../src/domain/budget/financeCloudCodec.js';
import { projectSharedGroup } from '../src/domain/groups/groupSharing.js';

function harness() {
  const data = migrateData({
    ...migrateData(null),
    people: [
      { id: 'a', name: 'Ana', profile: { phone: 'private' } },
      { id: 'b', name: 'Bia', inviteEmail: 'bia@example.com' },
    ],
    groups: [{ id: 'home', name: 'Casa', memberIds: ['a', 'b'], adminPersonId: 'a' }],
    months: { '2026-11': { a: 100000, b: 300000 } },
  });
  const encoded = encodeFinance(data);
  const rows = new Map([
    [
      'sharedGroups/owner_home',
      { adminUid: 'owner', snapshot: projectSharedGroup(data, 'home'), revision: 1 },
    ],
    [
      'groupMemberships/member_owner_home',
      { uid: 'member', groupId: 'owner_home', personId: 'b', inviteId: 'owner_home_b' },
    ],
    [
      'groupInvites/owner_home_b',
      { status: 'accepted', acceptedUid: 'member', groupId: 'owner_home', personId: 'b' },
    ],
    [
      'users/owner/finance/state',
      {
        schemaVersion: 2,
        revision: 1,
        recordCount: encoded.records.length,
        orders: encoded.orders,
      },
    ],
    ...encoded.records.map(({ id, ...record }) => [
      `users/owner/finance/${id}`,
      { ...record, revision: 1 },
    ]),
  ]);
  const ref = (path, query = false) => ({
    path,
    query,
    doc: (id) => ref(`${path}/${id}`),
    collection: (id) => ref(`${path}/${id}`, true),
  });
  const snapshot = (path) => ({
    id: path.split('/').at(-1),
    exists: rows.has(path),
    data: () => rows.get(path),
  });
  const db = {
    collection: (id) => ref(id, true),
    runTransaction: async (fn) => {
      const writes = [];
      const result = await fn({
        get: async (target) =>
          target.query
            ? {
                docs: [...rows.keys()]
                  .filter(
                    (path) =>
                      path.startsWith(target.path + '/') &&
                      path.split('/').length === target.path.split('/').length + 1,
                  )
                  .map(snapshot),
              }
            : snapshot(target.path),
        set: (target, value) => writes.push([target.path, value]),
        update: (target, value) =>
          writes.push([target.path, { ...rows.get(target.path), ...value }]),
      });
      writes.forEach(([path, value]) => rows.set(path, value));
      return result;
    },
  };
  return {
    rows,
    execute: (uid, command) =>
      editSharedGroup({
        db,
        timestamp: () => 'server-time',
        uid,
        command: { groupId: 'owner_home', revision: 1, ...command },
      }),
    read: () =>
      decodeFinance(
        [...rows]
          .filter(([path]) => path.startsWith('users/owner/finance/'))
          .map(([path, value]) => ({ id: path.split('/').at(-1), ...value })),
      ),
  };
}
const bill = {
  description: 'Luz',
  amount: 10001,
  date: '2026-11-01',
  status: 'paid',
  payer: 'a',
  participants: ['a', 'b'],
  split: 'proportional',
  percentages: {},
};
test('member edits persist in owner finance and public group atomically without returning private data', async () => {
  const { execute, read, rows } = harness();
  const result = await execute('member', {
    action: 'upsert',
    changes: [
      { kind: 'expenses', id: 'bill', value: bill },
      {
        kind: 'plans',
        id: 'group:home|2026-11',
        value: { spendingLimit: 50000, categories: { Moradia: 20000 } },
      },
    ],
  });
  assert.equal(read().revision, 2);
  assert.equal(read().data.expenses[0].amount, 10001);
  assert.equal(read().data.months['2026-11'].a, 100000);
  assert.equal(rows.get('sharedGroups/owner_home').financeRevision, 2);
  assert.deepEqual(result.snapshot.expenses[0].shares, { a: 2500, b: 7501 });
  assert.ok(!JSON.stringify(result).includes('private'));
  assert.ok(!JSON.stringify(result).includes('100000'));
  await assert.rejects(() => execute('member', { action: 'rename', name: 'Antigo' }), {
    status: 409,
  });
  assert.equal(read().revision, 2);
});
test('revoked, removed and foreign accounts cannot write; deletion and privilege escalation are rejected', async () => {
  const { execute, rows, read } = harness();
  await assert.rejects(() => execute('outsider', { action: 'rename', name: 'Inválido' }), {
    status: 403,
  });
  for (const action of ['delete', 'removeMember', 'purge', 'changeAdmin'])
    await assert.rejects(() => execute('member', { action }), { status: 403 });
  await assert.rejects(
    () =>
      execute('member', {
        action: 'upsert',
        changes: [{ kind: 'people', id: 'a', value: { accountUid: 'member' } }],
      }),
    { status: 400 },
  );
  rows.get('groupInvites/owner_home_b').status = 'revoked';
  await assert.rejects(() => execute('member', { action: 'rename', name: 'Inválido' }), {
    status: 403,
  });
  rows.get('groupInvites/owner_home_b').status = 'accepted';
  rows.get('sharedGroups/owner_home').snapshot.activeMemberIds = ['a'];
  await assert.rejects(() => execute('member', { action: 'rename', name: 'Inválido' }), {
    status: 403,
  });
  assert.equal(read().revision, 1);
});
test('preview never writes, only administrators rename, and members can invite new participants', async () => {
  const { execute, rows, read } = harness();
  const before = JSON.stringify([...rows]);
  assert.deepEqual(
    (
      await execute('member', {
        action: 'preview',
        changes: [{ kind: 'expenses', id: 'preview', value: bill }],
      })
    ).shares,
    { a: 2500, b: 7501 },
  );
  assert.equal(JSON.stringify([...rows]), before);
  await assert.rejects(() => execute('member', { action: 'rename', name: 'Novo nome' }), {
    status: 403,
  });
  assert.equal(JSON.stringify([...rows]), before);
  await execute('owner', { action: 'rename', name: 'Novo nome' });
  assert.equal(read().data.groups[0].name, 'Novo nome');
  await execute('member', {
    revision: 2,
    action: 'invite',
    email: 'nova@example.com',
    name: 'Nova',
  });
  assert.equal(read().data.groups[0].adminPersonId, 'a');
  assert.equal(read().data.groups[0].memberIds.length, 3);
  assert.equal(rows.get('groupInvites/owner_home_b').status, 'accepted');
  const invitations = [...rows]
    .filter(([path]) => path.startsWith('groupInvites/'))
    .map(([, value]) => value);
  assert.equal(invitations.find((item) => item.email === 'nova@example.com').status, 'pending');
});

test('member invitations cannot modify or reactivate existing participants', async () => {
  const { execute, rows, read } = harness();
  const before = JSON.stringify([...rows]);
  for (const command of [
    { email: 'other@example.com', name: 'Outra', personId: 'b' },
    { email: '  BIA@example.com ', name: 'Outro nome' },
  ])
    await assert.rejects(() => execute('member', { action: 'invite', ...command }), {
      status: 403,
    });
  assert.equal(JSON.stringify([...rows]), before);
  assert.equal(read().data.groups[0].name, 'Casa');
  const ownerRecord = rows.get('users/owner/finance/people:a');
  ownerRecord.payload = JSON.stringify({
    ...JSON.parse(ownerRecord.payload),
    inviteEmail: 'ana@example.com',
  });
  const groupRecord = rows.get('users/owner/finance/groups:home');
  groupRecord.payload = JSON.stringify({
    ...JSON.parse(groupRecord.payload),
    removedMemberIds: ['a'],
  });
  rows.get('sharedGroups/owner_home').snapshot.activeMemberIds = ['b'];
  await assert.rejects(
    () => execute('member', { action: 'invite', email: 'ana@example.com', name: 'Ana' }),
    { status: 403 },
  );
  assert.deepEqual(read().data.groups[0].removedMemberIds, ['a']);
});
test('API rejects unauthenticated, non-Google and unverified sessions and hides internal failures', async () => {
  let token = { uid: 'member', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
  const handler = createSharedGroupFinanceHandler({
    verifyToken: async () => token,
    execute: async () => {
      throw new Error('secret-internals');
    },
  });
  const request = async (
    headers = { authorization: 'Bearer token' },
    body = { groupId: 'owner_home', revision: 1 },
  ) => {
    const res = {
      setHeader() {},
      status(code) {
        this.code = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await handler({ method: 'POST', headers, body }, res);
    return res;
  };
  assert.equal((await request({})).code, 401);
  token.email_verified = false;
  assert.equal((await request()).code, 403);
  token.email_verified = true;
  token.firebase.sign_in_provider = 'password';
  assert.equal((await request()).code, 403);
  token.firebase.sign_in_provider = 'google.com';
  assert.equal((await request(undefined, { groupId: '../private', revision: 1 })).code, 400);
  const response = await request();
  assert.equal(response.code, 500);
  assert.ok(!response.body.error.includes('secret'));
});
