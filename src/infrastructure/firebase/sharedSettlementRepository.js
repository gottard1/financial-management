import { collection, doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { auth } from './client.js';
import { writeSharedSettlement } from './sharedSettlementStore.js';

export function watchSettlementMonths(groupId, receive, fail) {
  return onSnapshot(
    collection(getFirestore(auth.app), 'sharedGroups', groupId, 'settlementMonths'),
    (snapshot) => receive(snapshot.docs.map((item) => ({ ...item.data(), month: item.id }))),
    fail,
  );
}

export async function saveSharedSettlement(groupId, options) {
  if (!auth?.currentUser) throw new Error('Entre na sua conta para confirmar um recebimento.');
  const db = getFirestore(auth.app);
  const uid = auth.currentUser.uid;
  return writeSharedSettlement(db, uid, groupId, options);
}
