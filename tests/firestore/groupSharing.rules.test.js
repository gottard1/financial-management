import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
