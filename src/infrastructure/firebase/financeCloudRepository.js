import { getFirestore } from 'firebase/firestore';
import { auth } from './client.js';
import { createFinanceCloudStore } from './financeCloudStore.js';

function requireAccount(uid) {
  if (!auth?.currentUser || auth.currentUser.uid !== uid)
    throw new Error('Entre na conta correta para sincronizar seus dados.');
}

export function createAccountFinanceStore(uid) {
  requireAccount(uid);
  const store = createFinanceCloudStore(getFirestore(auth.app), uid);
  return {
    watch(receive, fail) {
      requireAccount(uid);
      return store.watch(receive, fail);
    },
    save(data, revision) {
      requireAccount(uid);
      return store.save(data, revision);
    },
  };
}
