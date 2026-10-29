import { buildTransfers } from '../expenses/expenseCalculations.js';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const RECEIPT_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} inválido.`);
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} inválido.`);
}
function safe(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error('O saldo ultrapassa o limite de valores permitido.');
  return number;
}
function members(memberIds) {
  if (
    !Array.isArray(memberIds) ||
    memberIds.length === 0 ||
    new Set(memberIds).size !== memberIds.length
  )
    throw new Error('Informe membros únicos para o grupo.');
  memberIds.forEach((id) => text(id, 'Identificador de membro'));
  return new Set(memberIds);
}
function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error('Data do repasse inválida.');
  const [year, month, day] = date.split('-').map(Number);
  const actual = new Date(Date.UTC(year, month - 1, day));
  if (
    actual.getUTCFullYear() !== year ||
    actual.getUTCMonth() !== month - 1 ||
    actual.getUTCDate() !== day
  )
    throw new Error('Data do repasse inválida.');
}
function balancesOf(stats, memberIds) {
  object(stats, 'Resumo');
  object(stats.balances, 'Saldos');
  const entries = memberIds.map((id) => {
    if (!Object.hasOwn(stats.balances, id) || !Number.isSafeInteger(stats.balances[id]))
      throw new Error('Saldo de integrante inválido.');
    return [id, BigInt(stats.balances[id])];
  });
  if (entries.reduce((sum, [, amount]) => sum + amount, 0n) !== 0n)
    throw new Error('Os saldos do grupo precisam se compensar.');
  return new Map(entries);
}

export function validateSettlementRecord(record, memberIds) {
  const ids = members(memberIds);
  object(record, 'Repasse');
  text(record.id, 'Identificador do repasse');
  if (typeof record.scope !== 'string' || !/^group:.+/.test(record.scope))
    throw new Error('Repasses devem pertencer a um grupo.');
  if (!ids.has(record.from) || !ids.has(record.to) || record.from === record.to)
    throw new Error('Pagador e recebedor devem ser integrantes diferentes do grupo.');
  if (!Number.isSafeInteger(record.amount) || record.amount <= 0)
    throw new Error('O valor do repasse deve ser maior que zero, em centavos.');
  validDate(record.date);
  if (
    typeof record.referenceMonth !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(record.referenceMonth)
  )
    throw new Error('Competência do repasse inválida.');
  if (typeof record.note !== 'string') throw new Error('Observação do repasse inválida.');
  if (!['confirmed', 'void'].includes(record.status))
    throw new Error('Situação do repasse inválida.');
  if (record.receipt !== undefined) {
    object(record.receipt, 'Comprovante');
    text(record.receipt.id, 'Identificador do comprovante');
    text(record.receipt.name, 'Nome do comprovante');
    if (!RECEIPT_TYPES.includes(record.receipt.type))
      throw new Error('Comprovante deve ser JPEG, PNG, WEBP ou PDF.');
    if (
      !Number.isSafeInteger(record.receipt.size) ||
      record.receipt.size <= 0 ||
      record.receipt.size > MAX_RECEIPT_BYTES
    )
      throw new Error('Comprovante deve ter até 5 MB e não pode estar vazio.');
  }
  return record;
}

/** Validate against the CURRENT adjusted balances, only when recording a new transfer. */
export function validateNewSettlement(record, stats, memberIds) {
  validateSettlementRecord(record, memberIds);
  if (record.status !== 'confirmed') throw new Error('Um novo repasse precisa estar confirmado.');
  const balances = balancesOf(stats, memberIds);
  const debt = -balances.get(record.from);
  const credit = balances.get(record.to);
  if (debt <= 0n) throw new Error('A pessoa que paga não tem dívida pendente nesta competência.');
  if (credit <= 0n)
    throw new Error('A pessoa que recebe não tem crédito pendente nesta competência.');
  if (BigInt(record.amount) > debt || BigInt(record.amount) > credit)
    throw new Error(
      'O repasse não pode exceder a dívida de quem paga nem o crédito de quem recebe.',
    );
  return record;
}

/** Historical transfers adjust balances, never expenses or income. Recalculation may reverse a balance. */
export function applySettlements(baseStats, records, memberIds) {
  members(memberIds);
  if (!Array.isArray(records)) throw new Error('Informe uma lista de repasses.');
  const balances = balancesOf(baseStats, memberIds);
  const ids = new Set();
  for (const record of records) {
    validateSettlementRecord(record, memberIds);
    if (ids.has(record.id)) throw new Error('Identificador de repasse duplicado.');
    ids.add(record.id);
    if (record.status === 'void') continue;
    balances.set(record.from, balances.get(record.from) + BigInt(record.amount));
    balances.set(record.to, balances.get(record.to) - BigInt(record.amount));
  }
  const adjusted = Object.fromEntries(memberIds.map((id) => [id, safe(balances.get(id))]));
  return { ...baseStats, balances: adjusted, transfers: buildTransfers(adjusted, memberIds) };
}
