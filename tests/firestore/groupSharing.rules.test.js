import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFinanceCloudStore } from '../../src/infrastructure/firebase/financeCloudStore.js';
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
