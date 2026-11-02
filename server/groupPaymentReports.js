import { randomUUID } from 'node:crypto';
import {
  createPaymentReport,
  resolvePaymentReport,
} from '../src/domain/settlements/paymentReports.js';
import {
  nextSettlementLedger,
  sharedMonthOverview,
} from '../src/domain/settlements/sharedSettlements.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

/** Runs inside the same authenticated membership transaction as shared finance edits. */
export async function editGroupPayment({
  db,
  transaction,
  ref,
  group,
  actorId,
  uid,
  command,
  timestamp,
}) {
  const reports = ref.collection('paymentReports');
  let report, reportRef;
  if (command.action === 'report-payment') {
    if (!command.transfer || command.transfer.from !== actorId)
      throw fail(403, 'Somente quem paga pode informar o pagamento.');
    reportRef = reports.doc(randomUUID());
  } else {
    if (
      typeof command.reportId !== 'string' ||
      !command.reportId ||
      command.reportId.includes('/') ||
      command.reportId.length > 150
    )
      throw fail(400, 'Solicitação inválida.');
    reportRef = reports.doc(command.reportId);
    report = (await transaction.get(reportRef)).data();
    if (!report || report.to !== actorId || report.toUid !== uid)
      throw fail(403, 'Somente quem recebe pode responder esta solicitação.');
    if (report.status !== 'pending') throw fail(409, 'Esta solicitação já foi respondida.');
  }
  const month = report?.month || command.month;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw fail(400, 'Competência inválida.');
  const ledgerRef = ref.collection('settlementMonths').doc(month);
  const ledger = (await transaction.get(ledgerRef)).data();
  const overview = sharedMonthOverview(group.snapshot, month, ledger);
  if (!overview) throw fail(409, 'Aguarde o administrador atualizar os dados do grupo.');
  const members = group.snapshot.people.map((person) => person.id);
  const active = group.snapshot.activeMemberIds || members;
  const transfer = report || command.transfer;
  if (!active.includes(transfer.from) || !active.includes(transfer.to))
    throw fail(403, 'Este acerto envolve um participante sem acesso ativo.');
  const lockRef = ref
    .collection('paymentReportLocks')
    .doc(encodeURIComponent(`${month}|${transfer.from}|${transfer.to}`));
  const lock = (await transaction.get(lockRef)).data();
  try {
    if (!report) {
      if (lock?.reportId) throw fail(409, 'Este acerto já aguarda confirmação.');
      let toUid;
      if (transfer.to === group.snapshot.adminPersonId) toUid = group.adminUid;
      else {
        const invitation = (
          await transaction.get(
            db.collection('groupInvites').doc(`${command.groupId}_${transfer.to}`),
          )
        ).data();
        if (
          invitation?.status === 'accepted' &&
          invitation.groupId === command.groupId &&
          invitation.personId === transfer.to
        ) {
          const membership = (
            await transaction.get(
              db.collection('groupMemberships').doc(`${invitation.acceptedUid}_${command.groupId}`),
            )
          ).data();
          if (
            membership?.personId === transfer.to &&
            membership.inviteId === `${command.groupId}_${transfer.to}`
          )
            toUid = invitation.acceptedUid;
        }
      }
      if (!toUid)
        throw fail(409, 'Quem recebe precisa aceitar o convite e vincular uma conta ao grupo.');
      report = {
        ...createPaymentReport(
          {
            id: reportRef.id,
            scope: `group:${group.snapshot.id}`,
            month,
            transfer: command.transfer,
            date: command.date,
          },
          actorId,
          overview.stats,
          members,
        ),
        groupId: command.groupId,
        groupName: group.snapshot.name,
        fromUid: uid,
        toUid,
        fromName: group.snapshot.people.find((person) => person.id === transfer.from).name,
        toName: group.snapshot.people.find((person) => person.id === transfer.to).name,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      transaction.set(reportRef, report);
      transaction.set(lockRef, { reportId: reportRef.id });
    } else {
      const action = command.action === 'confirm-payment' ? 'confirm' : 'reject';
      const resolved = resolvePaymentReport(report, actorId, action, overview.stats, members);
      if (action === 'confirm') {
        const next = nextSettlementLedger(group.snapshot, ledger, {
          month,
          transfer: { from: report.from, to: report.to, amount: report.amount },
          uid,
          id: report.id,
          date: report.date,
        });
        transaction.set(ledgerRef, {
          ...next,
          baseRevision: group.revision,
          updatedAt: timestamp(),
        });
      }
      transaction.update(reportRef, { status: resolved.status, updatedAt: timestamp() });
      if (lock?.reportId === report.id) transaction.delete(lockRef);
    }
  } catch (error) {
    throw error.status ? error : fail(400, error.message);
  }
  return { ok: true };
}
