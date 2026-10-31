import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFinanceCloudStore } from '../../src/infrastructure/firebase/financeCloudStore.js';
import { revokeGroupMemberAccess } from '../../src/infrastructure/firebase/groupMemberAccess.js';
import {
  deleteSharedGroup,
  purgeSharedGroupHistory,
} from '../../src/infrastructure/firebase/groupDeletion.js';
import { purgeGroupHistoryBatch } from '../../src/domain/groups/groupMembers.js';
import { migrateData, defaultIncomeConfig } from '../../src/domain/budget/workspaceCalculations.js';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let environment;
const projectId = 'demo-financial-sharing';
const groupId = 'admin_home';
const inviteId = `${groupId}_person-b`;
const memberId = `member_${groupId}`;
test(
  'permanent purge physically deletes private history and invitations while retaining only a small shared tombstone',
  { skip: !enabled },
  async () => {
    const owner = context('purge-owner'),
      outsider = context('purge-outsider');
    const id = 'purge-owner_home';
    const snapshot = {
      id: 'home',
      name: 'Casa antiga',
      activeMemberIds: ['a', 'b'],
      people: [
        { id: 'a', name: 'Ana' },
        { id: 'b', name: 'Bia' },
      ],
      expenses: [{ id: 'bill', amount: 20000 }],
      settlements: [],
    };
    await setDoc(doc(owner, 'sharedGroups', id), {
      adminUid: 'purge-owner',
      snapshot,
      revision: 1,
      updatedAt: serverTimestamp(),
    });
    const invitationId = `${id}_b`;
    await setDoc(doc(owner, 'groupInvites', invitationId), {
      groupId: id,
      personId: 'b',
      personName: 'Bia',
      groupName: 'Casa antiga',
      email: 'bia@example.com',
      adminUid: 'purge-owner',
      status: 'pending',
      updatedAt: serverTimestamp(),
    });
    await assert.rejects(() => purgeSharedGroupHistory(owner, 'purge-owner', id));
    await deleteSharedGroup(owner, 'purge-owner', id);
    await assertFails(deleteDoc(doc(outsider, 'groupInvites', invitationId)));
    await purgeSharedGroupHistory(owner, 'purge-owner', id);
    assert.equal((await getDoc(doc(owner, 'groupInvites', invitationId))).exists(), false);
    const marker = (await getDoc(doc(owner, 'sharedGroups', id))).data();
    assert.equal(marker.deleted, true);
    assert.equal(marker.snapshot.name, 'Grupo apagado');
    assert.deepEqual(marker.snapshot.expenses, []);
    assert.deepEqual(marker.snapshot.people, []);
    const base = migrateData(null);
    const expense = {
      id: 'bill',
      description: 'Luz',
      amount: 20000,
      date: '2026-10-20',
      category: 'Moradia',
      workspace: 'group:home',
      payer: 'person-0',
      participants: ['person-0'],
      percentages: {},
      split: 'equal',
      status: 'paid',
    };
    let data = {
      ...base,
      groups: [{ id: 'home', name: 'Casa antiga', memberIds: ['person-0'], deleted: true }],
      months: { '2026-10': { 'person-0': 250000 } },
      expenses: [expense, { ...expense, id: 'personal', workspace: 'person:person-0' }],
      plans: { 'group:home|2026-10': { spendingLimit: 30000, savingTarget: 0, categories: {} } },
    };
    const store = createFinanceCloudStore(owner, 'purge-owner');
    await store.save(data, null);
    const before = (await getDocs(collection(owner, 'users', 'purge-owner', 'finance'))).size;
    data = purgeGroupHistoryBatch(data, 'home');
    await store.save(data, 1);
    assert.equal(
      (await getDoc(doc(owner, 'users', 'purge-owner', 'finance', 'expenses:bill'))).exists(),
      false,
    );
    assert.equal(
      (await getDoc(doc(owner, 'users', 'purge-owner', 'finance', 'groups:home'))).exists(),
      false,
    );
    assert.equal(
      (await getDoc(doc(owner, 'users', 'purge-owner', 'finance', 'expenses:personal'))).exists(),
      true,
    );
    assert.equal(
      (await getDoc(doc(owner, 'users', 'purge-owner', 'finance', 'income:2026-10'))).exists(),
      true,
    );
    assert.ok((await getDocs(collection(owner, 'users', 'purge-owner', 'finance'))).size < before);
    await assert.rejects(
      () =>
        store.save(
          { ...data, groups: [{ id: 'home', name: 'Old offline copy', memberIds: ['person-0'] }] },
          1,
        ),
      { code: 'finance/conflict' },
    );
  },
);
test(
  'group deletion blocks all access immediately, revokes invitations and cannot be undone by stale sessions',
  { skip: !enabled },
  async () => {
    const owner = context('delete-owner'),
      member = context('delete-member'),
      outsider = context('delete-outsider');
    const id = 'delete-owner_trip',
      inviteId = `${id}_b`,
      membershipId = `delete-member_${id}`;
    const groupRef = doc(owner, 'sharedGroups', id);
    const snapshot = {
      id: 'trip',
      name: 'Viagem',
      activeMemberIds: ['a', 'b'],
      people: [
        { id: 'a', name: 'Ana' },
        { id: 'b', name: 'Bia' },
      ],
      expenses: [{ id: 'e', amount: 50000 }],
      settlements: [],
    };
    await setDoc(groupRef, {
      adminUid: 'delete-owner',
      snapshot,
      revision: 1,
      updatedAt: serverTimestamp(),
    });
    const invite = {
      groupId: id,
      personId: 'b',
      personName: 'Bia',
      groupName: 'Viagem',
      email: 'delete-member@example.com',
      adminUid: 'delete-owner',
      status: 'pending',
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(owner, 'groupInvites', inviteId), invite);
    const acceptance = writeBatch(member);
    acceptance.set(doc(member, 'groupMemberships', membershipId), {
      uid: 'delete-member',
      groupId: id,
      personId: 'b',
      inviteId,
    });
    acceptance.update(doc(member, 'groupInvites', inviteId), {
      status: 'accepted',
      acceptedUid: 'delete-member',
    });
    await acceptance.commit();
    await setDoc(doc(owner, 'groupInvites', `${id}_a`), {
      ...invite,
      personId: 'a',
      personName: 'Ana',
      email: 'another@example.com',
    });
    await assert.rejects(() => deleteSharedGroup(outsider, 'delete-outsider', id));
    // Simulate interruption after the access-blocking transaction, before cleanup.
    await updateDoc(groupRef, {
      deleted: true,
      snapshot: { ...snapshot, activeMemberIds: [] },
      revision: 2,
      updatedAt: serverTimestamp(),
    });
    await assertFails(getDoc(doc(member, 'sharedGroups', id)));
    await assertFails(setDoc(doc(owner, 'groupInvites', `${id}_a`), { ...invite, personId: 'a' }));
    await assertFails(
      updateDoc(groupRef, { deleted: false, revision: 3, updatedAt: serverTimestamp() }),
    );
    await assertFails(
      setDoc(groupRef, {
        adminUid: 'delete-owner',
        snapshot,
        revision: 3,
        updatedAt: serverTimestamp(),
      }),
    );
    const result = await deleteSharedGroup(owner, 'delete-owner', id);
    assert.equal(result.cleanupPending, false);
    assert.equal((await getDoc(doc(owner, 'groupInvites', inviteId))).data().status, 'revoked');
    assert.equal((await getDoc(doc(owner, 'groupInvites', `${id}_a`))).data().status, 'revoked');
    assert.equal((await getDoc(doc(member, 'groupMemberships', membershipId))).exists(), false);
    const stored = (await getDoc(groupRef)).data();
    assert.equal(stored.deleted, true);
    assert.deepEqual(stored.snapshot.expenses, snapshot.expenses);
    assert.equal((await deleteSharedGroup(owner, 'delete-owner', id)).cleanupPending, false);
    const unpublished = 'delete-owner_unpublished';
    assert.equal(
      (await deleteSharedGroup(owner, 'delete-owner', unpublished)).cleanupPending,
      false,
    );
    assert.equal((await getDoc(doc(owner, 'sharedGroups', unpublished))).data().deleted, true);
    await assertFails(
      setDoc(doc(owner, 'sharedGroups', unpublished), {
        adminUid: 'delete-owner',
        snapshot: { ...snapshot, id: 'unpublished' },
        revision: 2,
        updatedAt: serverTimestamp(),
      }),
    );
  },
);
const invitation = {
  groupId,
  personId: 'person-b',
  email: 'member@example.com',
  personName: 'Bia',
  groupName: 'Casa',
  adminUid: 'admin',
  status: 'pending',
};
const context = (uid, email = `${uid}@example.com`, verified = true) =>
  environment.authenticatedContext(uid, { email, email_verified: verified }).firestore();

before(async () => {
  if (!enabled) return;
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(async () => {
  if (environment) await environment.cleanup();
});

test(
  'administrator removes pending and accepted access while preserving history; reactivation needs new acceptance',
  { skip: !enabled },
  async () => {
    const admin = context('removal-owner'),
      member = context('departing'),
      stranger = context('outsider');
    const id = 'removal-owner_home',
      invitationId = `${id}_b`,
      membershipId = `departing_${id}`;
    const snapshot = {
      id: 'home',
      name: 'Casa',
      activeMemberIds: ['a', 'b', 'c'],
      people: [
        { id: 'a', name: 'Ana' },
        { id: 'b', name: 'Bia' },
        { id: 'c', name: 'Caio' },
      ],
      expenses: [{ id: 'historical', amount: 200, shares: { a: 100, b: 100 } }],
      settlements: [],
    };
    await setDoc(doc(admin, 'sharedGroups', id), {
      adminUid: 'removal-owner',
      snapshot,
      revision: 1,
      updatedAt: serverTimestamp(),
    });
    const invitation = {
      groupId: id,
      personId: 'b',
      email: 'departing@example.com',
      personName: 'Bia',
      groupName: 'Casa',
      adminUid: 'removal-owner',
      status: 'pending',
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(admin, 'groupInvites', invitationId), invitation);
    async function accept() {
      const batch = writeBatch(member);
      batch.set(doc(member, 'groupMemberships', membershipId), {
        uid: 'departing',
        groupId: id,
        personId: 'b',
        inviteId: invitationId,
      });
      batch.update(doc(member, 'groupInvites', invitationId), {
        status: 'accepted',
        acceptedUid: 'departing',
      });
      await batch.commit();
    }
    await accept();
    await assertSucceeds(getDoc(doc(member, 'sharedGroups', id)));
    await assert.rejects(() => revokeGroupMemberAccess(stranger, 'outsider', id, 'b'));
    await revokeGroupMemberAccess(admin, 'removal-owner', id, 'b');
    await assertFails(getDoc(doc(member, 'sharedGroups', id)));
    assert.equal((await getDoc(doc(member, 'groupMemberships', membershipId))).exists(), false);
    assert.equal((await getDoc(doc(admin, 'groupInvites', invitationId))).data().status, 'revoked');
    const after = (await getDoc(doc(admin, 'sharedGroups', id))).data();
    assert.deepEqual(after.snapshot.expenses, snapshot.expenses);
    assert.equal(after.snapshot.people.length, 3);
    assert.deepEqual(after.snapshot.activeMemberIds, ['a', 'c']);
    await assertFails(setDoc(doc(admin, 'groupInvites', invitationId), invitation));
    await updateDoc(doc(admin, 'sharedGroups', id), {
      snapshot,
      revision: 3,
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(admin, 'groupInvites', invitationId), invitation);
    await assertFails(getDoc(doc(member, 'sharedGroups', id)));
    await accept();
    await assertSucceeds(getDoc(doc(member, 'sharedGroups', id)));
    await setDoc(doc(admin, 'groupInvites', `${id}_c`), {
      ...invitation,
      personId: 'c',
      personName: 'Caio',
      email: 'caio@example.com',
    });
    await revokeGroupMemberAccess(admin, 'removal-owner', id, 'c');
    assert.equal((await getDoc(doc(admin, 'groupInvites', `${id}_c`))).exists(), false);
    await revokeGroupMemberAccess(admin, 'removal-owner', id, 'a');
    await assert.rejects(
      () => revokeGroupMemberAccess(admin, 'removal-owner', id, 'b'),
      /pelo menos um/,
    );
  },
);

test(
  'private finance survives reload, isolates accounts and rejects stale writes atomically',
  { skip: !enabled },
  async () => {
    const owner = context('private-owner');
    const other = context('member');
    const store = createFinanceCloudStore(owner, 'private-owner');
    const data = migrateData(null);
    data.months = { '2026-10': { 'person-0': 230000 } };
    data.incomeConfigs = {
      '2026-10': {
        'person-0': {
          ...defaultIncomeConfig(220000),
          cashBonus: 10000,
          foodAllowance: 60000,
          mealAllowance: 30000,
        },
      },
    };
    data.people[0].notes = '🧾'.repeat(70000);
    data.expenses = [
      {
        id: 'bill',
        description: 'Luz',
        amount: 18745,
        date: '2026-10-20',
        category: 'Moradia',
        workspace: 'person:person-0',
        payer: 'person-0',
        participants: ['person-0'],
        percentages: {},
        split: 'equal',
        status: 'pending',
        fixed: true,
        fixedAmountType: 'variable',
      },
    ];
    await assertSucceeds(getDocs(collection(owner, 'users', 'private-owner', 'finance')));
    assert.equal(await store.save(data, null), 1);
    await assertFails(getDocs(collection(other, 'users', 'private-owner', 'finance')));
    await assertFails(getDoc(doc(other, 'users', 'private-owner', 'finance', 'state')));
    await assertFails(
      setDoc(doc(other, 'users', 'private-owner', 'finance', 'state'), {
        schemaVersion: 2,
        revision: 2,
        recordCount: 1,
        orders: {},
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      getDoc(
        doc(
          environment.unauthenticatedContext().firestore(),
          'users',
          'private-owner',
          'finance',
          'people:person-0',
        ),
      ),
    );
    const secondDevice = createFinanceCloudStore(context('private-owner'), 'private-owner');
    const restored = await new Promise((resolve, reject) => {
      let stop;
      const timeout = setTimeout(() => {
        stop?.();
        reject(new Error('Cloud listener timed out'));
      }, 10000);
      stop = secondDevice.watch(
        (value) => {
          if (value) {
            clearTimeout(timeout);
            stop?.();
            resolve(value);
          }
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
    assert.deepEqual(restored.data, migrateData(data));
    assert.equal(restored.revision, 1);
    const smaller = { ...data, people: [{ id: 'person-0', name: 'Você' }] };
    assert.equal(await store.save(smaller, 1), 2);
    const records = await getDocs(collection(owner, 'users', 'private-owner', 'finance'));
    assert.equal(records.size, 4);
    assert.equal(
      (await getDoc(doc(owner, 'users', 'private-owner', 'finance', 'expenses:bill'))).data()
        .revision,
      1,
    );
    assert.equal(
      (await getDoc(doc(owner, 'users', 'private-owner', 'finance', 'income:2026-10'))).data()
        .revision,
      1,
    );
    assert.equal(await store.save({ ...smaller, expenses: [] }, 2), 3);
    assert.equal(
      (await getDoc(doc(owner, 'users', 'private-owner', 'finance', 'expenses:bill'))).exists(),
      false,
    );
    await assert.rejects(() => secondDevice.save(data, 1), { code: 'finance/conflict' });
    assert.equal(
      (await getDoc(doc(owner, 'users', 'private-owner', 'finance', 'state'))).data().revision,
      3,
    );
    await assertFails(deleteDoc(doc(owner, 'users', 'private-owner', 'finance', 'state')));
  },
);

test(
  'Firestore enforces invitation ownership, verified consent and immutable account links',
  { skip: !enabled },
  async () => {
    await environment.clearFirestore();
    const admin = context('admin');
    const member = context('member');
    const stranger = context('stranger');
    const unverified = context('member', 'member@example.com', false);
    const anonymous = environment.unauthenticatedContext().firestore();
    const group = {
      adminUid: 'admin',
      snapshot: { id: 'home', name: 'Casa' },
      revision: 1,
      updatedAt: serverTimestamp(),
    };
    await assertSucceeds(getDoc(doc(admin, 'sharedGroups', groupId)));
    await assertSucceeds(setDoc(doc(admin, 'sharedGroups', groupId), group));
    await assertFails(getDoc(doc(anonymous, 'sharedGroups', groupId)));
    await assertFails(getDoc(doc(stranger, 'sharedGroups', groupId)));
    await assertFails(getDoc(doc(member, 'sharedGroups', groupId)));
    await assertFails(
      setDoc(doc(stranger, 'groupInvites', inviteId), {
        ...invitation,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDoc(doc(admin, 'groupInvites', inviteId)));
    await assertSucceeds(
      setDoc(doc(admin, 'groupInvites', inviteId), { ...invitation, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(
      getDocs(query(collection(admin, 'groupInvites'), where('adminUid', '==', 'admin'))),
    );
    await assertSucceeds(
      getDocs(
        query(collection(member, 'groupInvites'), where('email', '==', 'member@example.com')),
      ),
    );
    await assertFails(getDoc(doc(unverified, 'groupInvites', inviteId)));
    await assertFails(getDocs(collection(member, 'groupInvites')));
    await assertFails(
      updateDoc(doc(member, 'groupInvites', inviteId), {
        status: 'accepted',
        acceptedUid: 'member',
      }),
    );
    const membership = { uid: 'member', groupId, personId: 'person-b', inviteId };
    await assertFails(setDoc(doc(member, 'groupMemberships', memberId), membership));
    function acceptance(db, uid = 'member', personId = 'person-b') {
      const batch = writeBatch(db);
      batch.set(doc(db, 'groupMemberships', `${uid}_${groupId}`), { ...membership, uid, personId });
      batch.update(doc(db, 'groupInvites', inviteId), { status: 'accepted', acceptedUid: uid });
      return batch.commit();
    }
    await assertFails(acceptance(stranger, 'stranger'));
    await assertFails(acceptance(unverified));
    await assertFails(acceptance(member, 'member', 'person-a'));
    await assertSucceeds(getDoc(doc(member, 'groupMemberships', memberId)));
    await assertSucceeds(acceptance(member));
    const linked = await assertSucceeds(getDoc(doc(member, 'groupMemberships', memberId)));
    assert.equal(linked.data().personId, 'person-b');
    await assertSucceeds(getDoc(doc(member, 'sharedGroups', groupId)));
    await assertSucceeds(
      getDocs(query(collection(member, 'groupMemberships'), where('uid', '==', 'member'))),
    );
    await assertFails(getDoc(doc(stranger, 'groupMemberships', memberId)));
    await assertFails(
      updateDoc(doc(member, 'groupMemberships', memberId), { personId: 'person-a' }),
    );
    await assertFails(
      updateDoc(doc(member, 'sharedGroups', groupId), {
        revision: 2,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(admin, 'groupInvites', inviteId), {
        ...invitation,
        email: 'other@example.com',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(admin, 'sharedGroups', groupId), {
        adminUid: 'member',
        revision: 2,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(admin, 'sharedGroups', groupId), { revision: 2, updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(doc(admin, 'sharedGroups', groupId), { revision: 2, updatedAt: serverTimestamp() }),
    );
  },
);
