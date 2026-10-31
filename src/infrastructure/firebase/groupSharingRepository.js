import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { auth } from './client.js';
import { normalizeInviteEmail, projectSharedGroup } from '../../domain/groups/groupSharing.js';
import { revokeGroupMemberAccess } from './groupMemberAccess.js';
import { deleteSharedGroup, purgeSharedGroupHistory } from './groupDeletion.js';

const database = () => {
  if (!auth?.currentUser) throw new Error('Entre na sua conta para compartilhar um grupo.');
  return getFirestore(auth.app);
};
export const sharedGroupId = (uid, groupId) => `${uid}_${groupId}`;
export const removeSharedGroup = (groupId) =>
  deleteSharedGroup(database(), auth.currentUser.uid, sharedGroupId(auth.currentUser.uid, groupId));
export const eraseSharedGroupHistory = (groupId) =>
  purgeSharedGroupHistory(
    database(),
    auth.currentUser.uid,
    sharedGroupId(auth.currentUser.uid, groupId),
  );
export const removeMemberAccess = (groupId, personId) =>
  revokeGroupMemberAccess(
    database(),
    auth.currentUser.uid,
    sharedGroupId(auth.currentUser.uid, groupId),
    personId,
  );
export function watchSharing(collectionName, field, value, receive, fail) {
  return onSnapshot(
    query(collection(database(), collectionName), where(field, '==', value)),
    (snapshot) => receive(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))),
    fail,
  );
}
export function watchSharedGroup(id, receive, fail) {
  return onSnapshot(
    doc(database(), 'sharedGroups', id),
    (snapshot) => receive(snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null),
    fail,
  );
}
export async function publishGroup(data, groupId, expectedRevision = null) {
  const db = database();
  const adminUid = auth.currentUser.uid;
  const ref = doc(db, 'sharedGroups', sharedGroupId(adminUid, groupId));
  const snapshot = projectSharedGroup(data, groupId);
  if (data.groups.find((group) => group.id === groupId)?.deleted)
    throw new Error('Este grupo foi excluído e está disponível somente no histórico.');
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists() && existing.data().deleted)
      throw new Error(
        'Este grupo já foi excluído. Atualize os dados da conta para consultar o histórico.',
      );
    if (existing.exists() && existing.data().revision !== expectedRevision)
      throw new Error(
        'O grupo mudou em outra sessão. Reabra o compartilhamento antes de publicar.',
      );
    transaction.set(ref, {
      adminUid,
      snapshot,
      revision: (expectedRevision || 0) + 1,
      updatedAt: serverTimestamp(),
    });
  });
}
export async function saveGroupInvite(groupId, personId, email, personName, groupName) {
  const db = database();
  const ref = doc(db, 'groupInvites', `${groupId}_${personId}`);
  const normalized = normalizeInviteEmail(email);
  await runTransaction(db, async (transaction) => {
    const previous = await transaction.get(ref);
    if (previous.exists() && previous.data().status === 'accepted')
      throw new Error('Esta pessoa já vinculou uma conta ao grupo.');
    transaction.set(ref, {
      groupId,
      personId,
      email: normalized,
      personName,
      groupName,
      adminUid: auth.currentUser.uid,
      status: 'pending',
      updatedAt: serverTimestamp(),
    });
  });
}
export async function cancelGroupInvite(inviteId) {
  const db = database();
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, 'groupInvites', inviteId);
    const current = await transaction.get(ref);
    if (!current.exists() || current.data().status !== 'pending')
      throw new Error('Este convite não está mais pendente.');
    transaction.delete(ref);
  });
}
export async function acceptGroupInvite(inviteId) {
  const db = database();
  const user = auth.currentUser;
  await user.reload();
  const token = await user.getIdTokenResult(true);
  if (token.signInProvider !== 'google.com' || !user.emailVerified)
    throw new Error('Entre com a conta Google do e-mail convidado para aceitar.');
  await runTransaction(db, async (transaction) => {
    const inviteRef = doc(db, 'groupInvites', inviteId);
    const current = await transaction.get(inviteRef);
    if (!current.exists()) throw new Error('Convite cancelado ou indisponível.');
    const invite = current.data();
    if (invite.status !== 'pending' || invite.email !== user.email.toLowerCase())
      throw new Error('Este convite não está disponível para esta conta.');
    const membership = doc(db, 'groupMemberships', `${user.uid}_${invite.groupId}`);
    const previous = await transaction.get(membership);
    if (previous.exists()) throw new Error('Sua conta já participa deste grupo.');
    transaction.set(membership, {
      uid: user.uid,
      groupId: invite.groupId,
      personId: invite.personId,
      inviteId,
    });
    transaction.update(inviteRef, { status: 'accepted', acceptedUid: user.uid });
  });
}
