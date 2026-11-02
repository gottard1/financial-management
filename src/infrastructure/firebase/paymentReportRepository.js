import { collection, doc, getDocFromServer, getFirestore, onSnapshot } from 'firebase/firestore';
import { auth } from './client.js';
import { editSharedGroup } from './sharedGroupEditingRepository.js';

export function watchPaymentReports(groupId, receive, fail) {
  return onSnapshot(
    collection(getFirestore(auth.app), 'sharedGroups', groupId, 'paymentReports'),
    (snapshot) => receive(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))),
    fail,
  );
}
export async function sendPaymentCommand(groupId, command) {
  if (!auth?.currentUser) throw new Error('Entre com Google para registrar este pagamento.');
  const group = await getDocFromServer(doc(getFirestore(auth.app), 'sharedGroups', groupId));
  if (!group.exists() || group.data().deleted) throw new Error('Grupo indisponível.');
  return editSharedGroup(groupId, group.data().revision, command);
}
