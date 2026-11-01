import { migrateData } from '../budget/workspaceCalculations.js';
import { stableJson } from '../budget/financeCloudCodec.js';
import { splitExpense } from '../expenses/expenseCalculations.js';
import { copyRecurringExpenses } from '../expenses/recurringExpenses.js';
import { activeGroupMembers } from './groupMembers.js';

const fields = {
  expenses: [
    'description',
    'amount',
    'date',
    'category',
    'status',
    'payer',
    'participants',
    'split',
    'percentages',
    'fixed',
    'fixedAmountType',
    'installments',
  ],
  goals: ['title', 'target', 'targetDate'],
  contributions: ['amount', 'date', 'goalId', 'note'],
  plans: ['spendingLimit', 'savingTarget', 'categories'],
};
const pick = (value, keys) =>
  Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
  );

export function sharedGroupData(snapshot) {
  const scope = `group:${snapshot.id}`;
  return {
    ...migrateData(null),
    people: snapshot.people,
    groups: [
      {
        id: snapshot.id,
        name: snapshot.name,
        adminPersonId: snapshot.adminPersonId,
        memberIds: snapshot.people.map((person) => person.id),
        removedMemberIds: snapshot.people
          .map((person) => person.id)
          .filter(
            (id) =>
              !(snapshot.activeMemberIds || snapshot.people.map((person) => person.id)).includes(
                id,
              ),
          ),
      },
    ],
    expenses: snapshot.expenses,
    goals: snapshot.goals || [],
    contributions: snapshot.contributions || [],
    plans: Object.fromEntries(
      Object.entries(snapshot.overview || {}).map(([month, overview]) => [
        `${scope}|${month}`,
        overview.plan,
      ]),
    ),
    settlements: (snapshot.settlements || []).map((item) => ({ ...item, scope })),
  };
}

/** Translate shared forms to explicit upserts; omissions can never delete history. */
export function sharedGroupChanges(previous, next) {
  const changes = [];
  for (const kind of ['expenses', 'goals', 'contributions']) {
    if (previous[kind].some((item) => !next[kind].some((value) => value.id === item.id)))
      throw new Error('Somente o administrador pode excluir registros do grupo.');
    for (const item of next[kind]) {
      const old = previous[kind].find((value) => value.id === item.id);
      if (stableJson(old && pick(old, fields[kind])) !== stableJson(pick(item, fields[kind])))
        changes.push({
          kind,
          id: item.id,
          value: {
            ...pick(item, fields[kind]),
            ...(kind === 'expenses' && old?.installments && !item.installments
              ? { installments: null }
              : {}),
          },
        });
    }
  }
  for (const [id, value] of Object.entries(next.plans)) {
    if (stableJson(previous.plans[id]) !== stableJson(value))
      changes.push({ kind: 'plans', id, value });
  }
  return changes;
}

/** Applied only to the owner's complete dataset on the trusted server. */
export function applySharedGroupChanges(input, groupId, changes) {
  let data = migrateData(input);
  const group = data.groups.find((item) => item.id === groupId && !item.deleted);
  if (!group) throw new Error('Grupo indisponível.');
  const scope = `group:${groupId}`;
  const active = activeGroupMembers(group);
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 100)
    throw new Error('Informe de 1 a 100 alterações por vez.');
  for (const change of changes) {
    const { kind, id, value } = change || {};
    if (
      !Object.hasOwn(fields, kind) ||
      typeof id !== 'string' ||
      !id ||
      id.length > 300 ||
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    )
      throw new Error('Alteração não permitida. Exclusões são restritas ao administrador.');
    if (Object.keys(value).some((key) => !fields[kind].includes(key)))
      throw new Error('Campo não permitido na edição compartilhada.');
    if (kind === 'plans') {
      if (!id.startsWith(`${scope}|`)) throw new Error('O orçamento deve pertencer a este grupo.');
      data = { ...data, plans: { ...data.plans, [id]: pick(value, fields.plans) } };
      continue;
    }
    const existing = data[kind].find((item) => item.id === id);
    const scopeKey = kind === 'expenses' ? 'workspace' : 'scope';
    if (existing && existing[scopeKey] !== scope)
      throw new Error('O registro pertence a outro espaço.');
    const item = { ...existing, ...pick(value, fields[kind]), id, [scopeKey]: scope };
    if (kind === 'expenses') {
      // Unchecking recurrence and installments must remove the optional old terms.
      if (value.installments === null || !item.fixed) delete item.installments;
      const prior = existing ? [...existing.participants, existing.payer] : [];
      if (
        [...(item.participants || []), item.payer].some(
          (personId) => !active.includes(personId) && !prior.includes(personId),
        )
      )
        throw new Error('Selecione apenas participantes ativos para novos vínculos.');
      if (item.amount <= 0) throw new Error('A despesa deve ser maior que zero.');
      splitExpense(item, data.months[item.date?.slice(0, 7)] || {}, group.memberIds);
    }
    data = { ...data, [kind]: [...data[kind].filter((record) => record.id !== id), item] };
  }
  return migrateData(data);
}

export function copySharedRecurring(data, groupId, month, entries) {
  const group = data.groups.find((item) => item.id === groupId && !item.deleted);
  if (!group) throw new Error('Grupo indisponível.');
  const copies = copyRecurringExpenses(
    data.expenses,
    `group:${groupId}`,
    month,
    entries,
    undefined,
    activeGroupMembers(group),
  );
  copies.forEach((item) => splitExpense(item, data.months[month] || {}, group.memberIds));
  return migrateData({ ...data, expenses: [...data.expenses, ...copies] });
}
