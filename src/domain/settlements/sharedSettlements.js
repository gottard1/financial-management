import { applySettlements, validateNewSettlement } from './settlementCalculations.js';

export function ledgerRecords(ledger) {
  return [...new Map((ledger?.records || []).map((record) => [record.id, record])).values()];
}

export function sharedMonthOverview(snapshot, month, ledger) {
  const overview = snapshot.overview?.[month] || snapshot.emptyOverview;
  if (!overview) return null;
  const members = snapshot.people.map((person) => person.id);
  const records = ledgerRecords(ledger).map((record) => ({ ...record, note: '' }));
  return { ...overview, stats: applySettlements(overview.stats, records, members) };
}

export function nextSettlementLedger(snapshot, ledger, { month, transfer, uid, id, date, voidId }) {
  const memberIds = snapshot.people.map((person) => person.id);
  const previous = ledger || { records: [], adjustments: {}, ids: {}, voided: {}, revision: 0 };
  if (previous.records.length >= 1000)
    throw new Error('O histórico desta competência atingiu o limite de registros.');
  let record;
  if (voidId) {
    const targetIndex = previous.records.findIndex(
      (item) => item.id === voidId && item.status === 'confirmed',
    );
    const original = previous.records[targetIndex];
    if (!original || original.receiverUid !== uid || previous.voided[voidId])
      throw new Error('Somente quem confirmou pode desfazer este recebimento.');
    record = { ...original, status: 'void', targetIndex };
  } else {
    record = {
      id,
      scope: `group:${snapshot.id}`,
      ...transfer,
      date,
      referenceMonth: month,
      note: '',
      status: 'confirmed',
      receiverUid: uid,
      targetIndex: -1,
    };
    if (previous.ids[id]) throw new Error('Este recebimento já foi registrado.');
    const overview = sharedMonthOverview(snapshot, month, previous);
    if (!overview) throw new Error('O administrador precisa atualizar os dados compartilhados.');
    validateNewSettlement(record, overview.stats, memberIds);
  }
  const direction = record.status === 'void' ? -1 : 1;
  return {
    revision: previous.revision + 1,
    records: [...previous.records, record],
    adjustments: {
      ...previous.adjustments,
      [record.from]: (previous.adjustments[record.from] || 0) + direction * record.amount,
      [record.to]: (previous.adjustments[record.to] || 0) - direction * record.amount,
    },
    ids: { ...previous.ids, [record.id]: true },
    voided: record.status === 'void' ? { ...previous.voided, [record.id]: true } : previous.voided,
  };
}

export function mergeSharedSettlements(data, groups) {
  const remote = groups.flatMap(({ localId, ledgers }) =>
    ledgers.flatMap((ledger) =>
      ledgerRecords(ledger).map((record) => ({
        ...record,
        scope: `group:${localId}`,
        sharedReceipt: true,
      })),
    ),
  );
  if (!remote.length) return data;
  const remoteIds = new Set(remote.map((item) => item.id));
  return {
    ...data,
    settlements: [...data.settlements.filter((item) => !remoteIds.has(item.id)), ...remote],
  };
}
