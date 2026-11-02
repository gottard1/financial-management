import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { nextSettlementLedger } from '../../domain/settlements/sharedSettlements.js';

export async function writeSharedSettlement(db, uid, groupId, options) {
  await runTransaction(db, async (transaction) => {
    const groupRef = doc(db, 'sharedGroups', groupId);
    const ref = doc(groupRef, 'settlementMonths', options.month);
    const groupDoc = await transaction.get(groupRef);
    const ledgerDoc = await transaction.get(ref);
    let reportRef, reportDoc;
    if (options.voidId) {
      reportRef = doc(groupRef, 'paymentReports', options.voidId);
      reportDoc = await transaction.get(reportRef);
    } else if (options.transfer) {
      const key = encodeURIComponent(
        `${options.month}|${options.transfer.from}|${options.transfer.to}`,
      );
      const pending = await transaction.get(doc(groupRef, 'paymentReportLocks', key));
      if (pending.exists())
        throw new Error(
          'Este acerto já aguarda confirmação. Responda à solicitação de recebimento.',
        );
    }
    if (!groupDoc.exists() || groupDoc.data().deleted)
      throw new Error('Este grupo não está disponível.');
    const group = groupDoc.data();
    let personId = group.snapshot.adminPersonId;
    if (group.adminUid !== uid) {
      const membership = await transaction.get(doc(db, 'groupMemberships', `${uid}_${groupId}`));
      personId = membership.exists() ? membership.data().personId : null;
    }
    const previous = ledgerDoc.exists() ? ledgerDoc.data() : null;
    const next = nextSettlementLedger(group.snapshot, previous, { ...options, uid });
    if (next.records.at(-1).to !== personId)
      throw new Error('Você só pode confirmar o dinheiro que recebeu.');
    transaction.set(ref, { ...next, baseRevision: group.revision, updatedAt: serverTimestamp() });
    if (reportDoc?.exists() && reportDoc.data().status === 'confirmed')
      transaction.update(reportRef, { status: 'reversed', updatedAt: serverTimestamp() });
  });
}
