import {
  collection,
  doc,
  getDocsFromServer,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { encodeFinance, decodeFinance } from '../../domain/budget/financeCloudCodec.js';

/** Individual documents and revision checks keep unrelated records untouched. */
export function createFinanceCloudStore(database, uid) {
  const ref = collection(database, 'users', uid, 'finance');
  let confirmedRecords;
  const unpack = (snapshot) => snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
  return {
    watch(receive, fail) {
      return onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
          try {
            const records = unpack(snapshot);
            const decoded = decodeFinance(records);
            confirmedRecords = records;
            receive(decoded);
          } catch (error) {
            fail(error);
          }
        },
        fail,
      );
    },
    async save(data, expectedRevision) {
      const encoded = encodeFinance(data);
      let base = confirmedRecords;
      if (
        !base ||
        (base.find((item) => item.id === 'state')?.revision ?? null) !== expectedRevision
      )
        base = unpack(await getDocsFromServer(ref));
      const existing = new Map(
        base.filter((item) => item.id !== 'state').map((item) => [item.id, item]),
      );
      const next = new Map(encoded.records.map((item) => [item.id, item]));
      const changes = encoded.records.filter(
        (item) => existing.get(item.id)?.payload !== item.payload,
      );
      const removed = [...existing.keys()].filter((id) => !next.has(id));
      if (changes.length + removed.length > 450)
        throw new Error(
          'Há mais de 450 registros para migrar de uma vez. Sua cópia local foi preservada; exporte um backup para uma migração assistida.',
        );
      const revision = await runTransaction(database, async (transaction) => {
        const stateRef = doc(ref, 'state');
        const current = await transaction.get(stateRef);
        if (
          (current.exists() ? current.data().revision : null) !== expectedRevision ||
          (base.find((item) => item.id === 'state')?.revision ?? null) !== expectedRevision
        ) {
          const error = new Error(
            'Outra sessão atualizou seus dados. Sua versão local foi preservada.',
          );
          error.code = 'finance/conflict';
          throw error;
        }
        const revision = (expectedRevision || 0) + 1;
        transaction.set(stateRef, {
          schemaVersion: 2,
          revision,
          recordCount: encoded.records.length,
          orders: encoded.orders,
          updatedAt: serverTimestamp(),
        });
        changes.forEach(({ id, ...record }) =>
          transaction.set(doc(ref, id), { ...record, revision }),
        );
        removed.forEach((id) => transaction.delete(doc(ref, id)));
        return revision;
      });
      const changedIds = new Set(changes.map((item) => item.id));
      confirmedRecords = [
        {
          id: 'state',
          schemaVersion: 2,
          revision,
          recordCount: encoded.records.length,
          orders: encoded.orders,
        },
        ...encoded.records.map((item) => ({
          ...item,
          revision: changedIds.has(item.id) ? revision : existing.get(item.id).revision,
        })),
      ];
      return revision;
    },
  };
}
