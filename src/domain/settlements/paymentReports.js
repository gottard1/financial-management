import { validateNewSettlement, validateSettlementRecord } from './settlementCalculations.js';

export function validatePaymentReport(report, members) {
  if (typeof report.scope !== 'string' || !report.scope.startsWith('group:'))
    throw new Error('O pagamento deve pertencer a um grupo.');
  validateSettlementRecord(
    { ...report, referenceMonth: report.month, note: '', status: 'confirmed' },
    members,
  );
  if (
    !['pending', 'confirmed', 'rejected', 'reversed'].includes(report.status) ||
    report.requestedBy !== report.from
  )
    throw new Error('Solicitação de recebimento inválida.');
  return report;
}

export function createPaymentReport(
  { id, scope, month, transfer, date },
  actorId,
  stats,
  members,
  reports = [],
) {
  if (actorId !== transfer.from)
    throw new Error(
      'Somente quem paga pode informar este pagamento. Quem recebe pode registrar o recebimento diretamente.',
    );
  if (
    reports.some(
      (item) =>
        item.scope === scope &&
        item.month === month &&
        item.from === transfer.from &&
        item.to === transfer.to &&
        item.status === 'pending',
    )
  )
    throw new Error('Este acerto já aguarda confirmação de recebimento.');
  const report = {
    id,
    scope,
    month,
    from: transfer.from,
    to: transfer.to,
    amount: transfer.amount,
    date,
    requestedBy: actorId,
    status: 'pending',
  };
  validatePaymentReport(report, members);
  validateNewSettlement(
    { ...report, referenceMonth: month, note: '', status: 'confirmed' },
    stats,
    members,
  );
  return report;
}

export function resolvePaymentReport(report, actorId, action, stats, members) {
  validatePaymentReport(report, members);
  if (report.to !== actorId)
    throw new Error('Somente quem recebe pode confirmar ou recusar este pagamento.');
  if (report.status !== 'pending')
    throw new Error('Esta solicitação já foi respondida. Atualize os dados.');
  if (!['confirm', 'reject'].includes(action)) throw new Error('Resposta inválida.');
  if (action === 'confirm')
    validateNewSettlement(
      { ...report, referenceMonth: report.month, note: '', status: 'confirmed' },
      stats,
      members,
    );
  return { ...report, status: action === 'confirm' ? 'confirmed' : 'rejected' };
}
