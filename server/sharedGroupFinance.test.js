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
    id: path.split('/').at(-1),
    query,
    doc: (id) => ref(`${path}/${id || crypto.randomUUID()}`),
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
        delete: (target) => writes.push([target.path, undefined]),
        update: (target, value) =>
          writes.push([target.path, { ...rows.get(target.path), ...value }]),
      });
      writes.forEach(([path, value]) =>
        value === undefined ? rows.delete(path) : rows.set(path, value),
      );
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
test('authorized benefit payments persist source and unchanged rateio atomically; outsiders and private credit edits remain forbidden', async () => {
  const { execute, read, rows } = harness();
  await assert.rejects(() =>
    execute('stranger', {
      action: 'upsert',
      changes: [
        { kind: 'expenses', id: 'food', value: { ...bill, paymentSource: 'foodAllowance' } },
      ],
    }),
  );
  await assert.rejects(
    () =>
      execute('member', {
        action: 'upsert',
        changes: [{ kind: 'expenses', id: 'food', value: { ...bill, paymentSource: 'unknown' } }],
      }),
    { status: 400 },
  );
  await assert.rejects(
    () =>
      execute('member', {
        action: 'upsert',
        changes: [{ kind: 'income', id: '2026-11', value: { foodAllowance: 99999 } }],
      }),
    { status: 400 },
  );
  assert.equal(read().revision, 1);
  const result = await execute('member', {
    action: 'upsert',
    changes: [{ kind: 'expenses', id: 'food', value: { ...bill, paymentSource: 'foodAllowance' } }],
  });
  assert.equal(read().data.expenses[0].paymentSource, 'foodAllowance');
  assert.deepEqual(read().data.months, { '2026-11': { a: 100000, b: 300000 } });
  assert.deepEqual(result.snapshot.expenses[0].shares, { a: 2500, b: 7501 });
  assert.equal(result.snapshot.overview['2026-11'].stats.cashExpenses, 0);
  assert.equal(result.snapshot.incomeConfigs, undefined);
  assert.equal(rows.get('sharedGroups/owner_home').financeRevision, 2);
  await execute('member', {
    revision: 2,
    action: 'upsert',
    changes: [{ kind: 'expenses', id: 'food', value: { paymentSource: 'cash' } }],
  });
  assert.equal(read().data.expenses[0].paymentSource, 'cash');
  assert.equal(
    rows.get('sharedGroups/owner_home').snapshot.overview['2026-11'].stats.cashExpenses,
    10001,
  );
});
test('shared variable recurring payments require the new month value and preserve the preceding amount', async () => {
  const { execute, read } = harness();
  await execute('member', {
    action: 'upsert',
    changes: [
      {
        kind: 'expenses',
        id: 'variable',
        value: { ...bill, split: 'equal', fixed: true, fixedAmountType: 'variable' },
      },
    ],
  });
  await assert.rejects(
    () =>
      execute('member', {
        revision: 2,
        action: 'recurring',
        month: '2026-12',
        entries: { variable: { selected: true, amount: '' } },
      }),
    { status: 400 },
  );
  assert.equal(read().revision, 2);
  assert.equal(read().data.expenses.length, 1);
  await execute('member', {
    revision: 2,
    action: 'recurring',
    month: '2026-12',
    entries: { variable: { selected: true, amount: '190,25' } },
  });
  const history = read().data.expenses;
  assert.equal(history.find((e) => e.id === 'variable').amount, bill.amount);
  assert.equal(history.find((e) => e.originId === 'variable').amount, 19025);
});
test('new shared cards, events, reserve transfers and investments commit together without private income or duplicate wealth', async () => {
  const { execute, read, rows } = harness();
  const result = await execute('member', {
    action: 'upsert',
    changes: [
      { kind: 'cards', id: 'card', value: { name: 'Cartão grupo', closingDay: 10, dueDay: 20 } },
      { kind: 'events', id: 'event', value: { name: 'Viagem' } },
      {
        kind: 'reserveMovements',
        id: 'opening',
        value: { kind: 'opening', amount: 10000, date: '2026-11-01', goalId: '' },
      },
      {
        kind: 'investments',
        id: 'asset',
        value: { name: 'CDB grupo', type: 'Renda fixa', institution: 'Banco' },
      },
      {
        kind: 'investmentMovements',
        id: 'application',
        value: {
          investmentId: 'asset',
          kind: 'application',
          funding: 'reserve',
          amount: 6000,
          date: '2026-11-02',
          goalId: '',
        },
      },
      {
        kind: 'investmentValuations',
        id: 'valuation',
        value: { investmentId: 'asset', amount: 6500, date: '2026-11-03' },
      },
      {
        kind: 'expenses',
        id: 'bill',
        value: { ...bill, essential: true, companion: 'Família', eventId: 'event' },
      },
    ],
  });
  const saved = read();
  assert.equal(saved.revision, 2);
  assert.equal(saved.data.investmentMovements.length, 1);
  assert.equal(rows.get('sharedGroups/owner_home').financeRevision, 2);
  assert.equal(result.snapshot.overview['2026-11'].stats.reserveBalance, 4000);
  assert.equal(result.snapshot.overview['2026-11'].stats.invested, 6500);
  assert.equal(result.snapshot.overview['2026-11'].stats.wealth, 10500);
  assert.equal(result.snapshot.overview['2026-11'].stats.income, undefined);
  assert.equal(result.snapshot.people[0].profile, undefined);
  const prior = JSON.stringify([...rows]);
  await assert.rejects(
    () =>
      execute('member', {
        revision: 2,
        action: 'upsert',
        changes: [
          {
            kind: 'investmentMovements',
            id: 'bad',
            value: {
              investmentId: 'asset',
              kind: 'redemption',
              funding: 'cash',
              date: '2026-11-04',
              amount: 99999,
            },
          },
        ],
      }),
    { status: 400 },
  );
  assert.equal(JSON.stringify([...rows]), prior);
  await assert.rejects(
    () =>
      execute('outsider', {
        revision: 2,
        action: 'upsert',
        changes: [{ kind: 'events', id: 'bad', value: { name: 'Ataque' } }],
      }),
    { status: 403 },
  );
});
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

test('payer reports do not settle debt; only the receiver resolves the request, exactly once', async () => {
  const h = harness();
  await h.execute('member', {
    action: 'upsert',
    changes: [{ kind: 'expenses', id: 'bill', value: bill }],
  });
  const command = {
    revision: 2,
    action: 'report-payment',
    month: '2026-11',
    date: '2026-11-02',
    transfer: {
      from: 'b',
      to: 'a',
      amount: 7501,
      scope: 'group:forged',
      id: 'forged',
      toUid: 'forged',
    },
  };
  await assert.rejects(() => h.execute('owner', command), { status: 403 });
  await h.execute('member', command);
  const path = [...h.rows.keys()].find((path) => path.includes('/paymentReports/'));
  const report = h.rows.get(path);
  assert.equal(report.status, 'pending');
  assert.equal(report.scope, 'group:home');
  assert.equal(report.fromUid, 'member');
  assert.equal(report.toUid, 'owner');
  assert.notEqual(report.id, 'forged');
  assert.equal(h.rows.has('sharedGroups/owner_home/settlementMonths/2026-11'), false);
  await assert.rejects(() => h.execute('member', command), { status: 409 });
  await assert.rejects(
    () => h.execute('member', { revision: 2, action: 'confirm-payment', reportId: report.id }),
    { status: 403 },
  );
  await h.execute('owner', { revision: 2, action: 'confirm-payment', reportId: report.id });
  assert.equal(h.rows.get(path).status, 'confirmed');
  const ledger = h.rows.get('sharedGroups/owner_home/settlementMonths/2026-11');
  assert.equal(ledger.records.length, 1);
  assert.equal(ledger.records[0].amount, 7501);
  assert.equal(ledger.records[0].receiverUid, 'owner');
  assert.equal(
    [...h.rows.keys()].some((path) => path.includes('/paymentReportLocks/')),
    false,
  );
  await assert.rejects(
    () => h.execute('owner', { revision: 2, action: 'confirm-payment', reportId: report.id }),
    { status: 409 },
  );
  assert.equal(h.rows.get('sharedGroups/owner_home/settlementMonths/2026-11').records.length, 1);
});

test('refusal leaves debt open and a subsequent partial report can be confirmed', async () => {
  const h = harness();
  await h.execute('member', {
    action: 'upsert',
    changes: [{ kind: 'expenses', id: 'bill', value: bill }],
  });
  const command = {
    revision: 2,
    action: 'report-payment',
    month: '2026-11',
    date: '2026-11-02',
    transfer: { from: 'b', to: 'a', amount: 1000 },
  };
  await h.execute('member', command);
  const path = [...h.rows.keys()].find((path) => path.includes('/paymentReports/'));
  await h.execute('owner', {
    revision: 2,
    action: 'reject-payment',
    reportId: h.rows.get(path).id,
  });
  assert.equal(h.rows.get(path).status, 'rejected');
  assert.equal(h.rows.has('sharedGroups/owner_home/settlementMonths/2026-11'), false);
  await h.execute('member', command);
  const next = [...h.rows].find(
    ([key, value]) => key.includes('/paymentReports/') && value.status === 'pending',
  )[1];
  await h.execute('owner', { revision: 2, action: 'confirm-payment', reportId: next.id });
  assert.equal(h.rows.get('sharedGroups/owner_home/settlementMonths/2026-11').adjustments.b, 1000);
});

test('a group owner can report a payment to a linked participant without confirming it for them', async () => {
  const h = harness();
  await h.execute('member', {
    action: 'upsert',
    changes: [{ kind: 'expenses', id: 'bill', value: { ...bill, payer: 'b' } }],
  });
  await h.execute('owner', {
    revision: 2,
    action: 'report-payment',
    month: '2026-11',
    date: '2026-11-02',
    transfer: { from: 'a', to: 'b', amount: 2500 },
  });
  const report = [...h.rows].find(([key]) => key.includes('/paymentReports/'))[1];
  assert.equal(report.toUid, 'member');
  await assert.rejects(
    () => h.execute('owner', { revision: 2, action: 'confirm-payment', reportId: report.id }),
    { status: 403 },
  );
  await h.execute('member', { revision: 2, action: 'confirm-payment', reportId: report.id });
  assert.equal(
    h.rows.get('sharedGroups/owner_home/settlementMonths/2026-11').records[0].receiverUid,
    'member',
  );
});
