import { migrateData } from './workspaceCalculations.js';

export function stableJson(data) {
  return JSON.stringify(data, (_, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value,
  );
}
export const financeJson = (data) => stableJson(migrateData(data));
const arrays = ['people', 'groups', 'expenses', 'goals', 'contributions', 'settlements'];
export const financeRecordId = (kind, key) => `${kind}:${encodeURIComponent(key)}`;

/** Each expense, person, plan, savings record or income month has its own document. */
export function encodeFinance(input) {
  const data = migrateData(input);
  const orders = {};
  const records = [];
  function add(kind, key, value) {
    const payload = stableJson(value);
    const id = financeRecordId(kind, key);
    if (id.length > 1200 || new TextEncoder().encode(payload).length > 750000)
      throw new Error(
        'Um registro excede o limite de sincronização. Exporte um backup antes de continuar.',
      );
    records.push({ id, kind, key, payload });
  }
  for (const kind of arrays) {
    orders[kind] = data[kind].map((item) => item.id);
    data[kind].forEach((item) => add(kind, item.id, item));
  }
  for (const month of new Set([...Object.keys(data.months), ...Object.keys(data.incomeConfigs)]))
    add('income', month, {
      ...(Object.hasOwn(data.months, month) ? { incomes: data.months[month] } : {}),
      ...(Object.hasOwn(data.incomeConfigs, month) ? { configs: data.incomeConfigs[month] } : {}),
    });
  for (const [key, plan] of Object.entries(data.plans)) add('plans', key, plan);
  if (records.length > 10000 || new TextEncoder().encode(stableJson(orders)).length > 500000)
    throw new Error(
      'O histórico excede o limite de sincronização desta versão. Sua cópia local foi preservada.',
    );
  return { records, orders };
}

export function decodeFinance(records) {
  if (!records.length) return null;
  const state = records.find((item) => item.id === 'state');
  if (
    !state ||
    state.schemaVersion !== 2 ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 1 ||
    !Number.isInteger(state.recordCount) ||
    state.recordCount !== records.length - 1 ||
    !state.orders
  )
    throw new Error('Dados financeiros incompletos na nuvem. A cópia local foi preservada.');
  const sections = Object.fromEntries(
    [...arrays, 'income', 'plans'].map((kind) => [kind, new Map()]),
  );
  for (const record of records.filter((item) => item.id !== 'state')) {
    if (
      !Object.hasOwn(sections, record.kind) ||
      !Number.isSafeInteger(record.revision) ||
      record.revision < 1 ||
      record.revision > state.revision ||
      typeof record.payload !== 'string' ||
      typeof record.key !== 'string' ||
      record.id !== financeRecordId(record.kind, record.key) ||
      sections[record.kind].has(record.key)
    )
      throw new Error('Registro financeiro inválido na nuvem. A cópia local foi preservada.');
    sections[record.kind].set(record.key, JSON.parse(record.payload));
  }
  const raw = {
    version: 3,
    months: {},
    incomeConfigs: {},
    plans: Object.fromEntries(sections.plans),
  };
  for (const kind of arrays) {
    const ids = state.orders[kind];
    if (
      !Array.isArray(ids) ||
      ids.length !== sections[kind].size ||
      new Set(ids).size !== ids.length
    )
      throw new Error('Histórico financeiro incompleto. A cópia local foi preservada.');
    raw[kind] = ids.map((id) => {
      const value = sections[kind].get(id);
      if (!value || value.id !== id) throw new Error('Identificador financeiro inválido.');
      return value;
    });
  }
  const incomes = [],
    configs = [];
  for (const [month, value] of sections.income) {
    if (Object.hasOwn(value, 'incomes')) incomes.push([month, value.incomes]);
    if (Object.hasOwn(value, 'configs')) configs.push([month, value.configs]);
  }
  raw.months = Object.fromEntries(incomes);
  raw.incomeConfigs = Object.fromEntries(configs);
  return { revision: state.revision, data: migrateData(raw) };
}
