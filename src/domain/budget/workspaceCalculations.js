import { splitExpense, summarize } from '../expenses/expenseCalculations.js';
import {
  applySettlements,
  validateSettlementRecord,
} from '../settlements/settlementCalculations.js';

function cents(value, label = 'Valor') {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} deve ser um valor válido em centavos.`);
  return value;
}
function safe(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new Error('O total ultrapassa o limite de valores permitido.');
  return result;
}
function sum(values) {
  return safe(values.reduce((total, value) => total + BigInt(value), 0n));
}
function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} inválido no backup.`);
  return value;
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} inválido no backup.`);
  return value;
}
function monthKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    throw new Error('Mês inválido no backup.');
}
function monthOf(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error('Informe uma data válida.');
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  )
    throw new Error('Informe uma data válida.');
  return date.slice(0, 7);
}
function uniqueId(value, ids, label) {
  text(value, `Identificador de ${label}`);
  if (value.includes('|')) throw new Error(`Identificador de ${label} inválido no backup.`);
  if (ids.has(value)) throw new Error(`Identificador de ${label} duplicado no backup.`);
  ids.add(value);
}
function percent(value) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.0000001
  )
    throw new Error('Percentual inválido: use de 0 a 100 com até duas casas decimais.');
  return Math.round(value * 100);
}
function incomeConfig(value) {
  record(value, 'Perfil de renda');
  if (!['net', 'clt', 'mei', 'pj'].includes(value.type))
    throw new Error('Tipo de renda inválido no backup.');
  cents(value.gross, 'Renda bruta');
  if (
    value.dependents !== undefined &&
    (!Number.isSafeInteger(value.dependents) || value.dependents < 0 || value.dependents > 100)
  )
    throw new Error('Dependentes inválidos no backup.');
  for (const field of [
    'otherDeductions',
    'pjFixedCosts',
    'cashBonus',
    'otherCashIncome',
    'foodAllowance',
    'mealAllowance',
  ]) {
    if (value[field] !== undefined) cents(value[field], 'Desconto, adicional ou benefício');
  }
  if (
    value.meiActivity !== undefined &&
    !['commerce', 'services', 'mixed'].includes(value.meiActivity)
  )
    throw new Error('Atividade MEI inválida no backup.');
  if (
    value.pjTaxPercent !== undefined &&
    (typeof value.pjTaxPercent !== 'number' ||
      !Number.isFinite(value.pjTaxPercent) ||
      value.pjTaxPercent < 0 ||
      value.pjTaxPercent > 100)
  )
    throw new Error('Alíquota PJ inválida no backup.');
}

export function defaultIncomeConfig(netCents = 0) {
  return {
    type: 'net',
    gross: cents(netCents, 'Renda'),
    dependents: 0,
    otherDeductions: 0,
    meiActivity: 'services',
    pjTaxPercent: 6,
    pjFixedCosts: 0,
    cashBonus: 0,
    otherCashIncome: 0,
    foodAllowance: 0,
    mealAllowance: 0,
  };
}

function legacyScope(scope) {
  const scopes = {
    couple: 'group:group-legacy',
    personal0: 'person:person-0',
    personal1: 'person:person-1',
  };
  if (!Object.hasOwn(scopes, scope))
    throw new Error('Espaço financeiro legado inválido no backup.');
  return scopes[scope];
}
function upgradeLegacy(raw) {
  if (
    !Array.isArray(raw.names) ||
    raw.names.length !== 2 ||
    !raw.names.every((name) => typeof name === 'string' && name.trim()) ||
    !Array.isArray(raw.expenses)
  )
    throw new Error('Backup financeiro inválido ou incompatível.');
  const months = {};
  for (const [month, incomes] of Object.entries(record(raw.months, 'Rendas mensais'))) {
    monthKey(month);
    if (!Array.isArray(incomes) || incomes.length !== 2)
      throw new Error('Rendas mensais legadas inválidas.');
    months[month] = {
      'person-0': cents(incomes[0], 'Renda'),
      'person-1': cents(incomes[1], 'Renda'),
    };
  }
  const incomeConfigs = {};
  for (const [month, configs] of Object.entries(
    record(raw.incomeConfigs ?? {}, 'Configurações de renda'),
  )) {
    monthKey(month);
    if (!Array.isArray(configs) || configs.length !== 2)
      throw new Error('Configurações mensais legadas inválidas.');
    incomeConfigs[month] = {};
    configs.forEach((config, index) => {
      if (config !== null) incomeConfigs[month]['person-' + index] = config;
    });
  }
  const expenses = raw.expenses.map((expense) => {
    record(expense, 'Despesa');
    if (![0, 1].includes(expense.payer)) throw new Error('Pagador legado inválido.');
    if (!['equal', 'proportional', 'custom', 'personal0', 'personal1'].includes(expense.split))
      throw new Error('Divisão legada inválida.');
    const workspace = legacyScope(expense.workspace ?? 'couple');
    let participants = ['person-0', 'person-1'];
    let split = expense.split;
    const percentages = {};
    if (workspace.startsWith('person:')) {
      participants = [workspace.slice(7)];
      split = 'equal';
    } else if (expense.split === 'personal0' || expense.split === 'personal1') {
      participants = ['person-' + expense.split.slice(-1)];
      split = 'equal';
    } else if (expense.split === 'custom') {
      percent(expense.percent);
      percentages['person-0'] = expense.percent;
      percentages['person-1'] = Number((100 - expense.percent).toFixed(2));
    }
    const { percent: oldPercent, ...preserved } = expense;
    return {
      ...preserved,
      workspace,
      split,
      participants,
      percentages,
      payer: 'person-' + expense.payer,
    };
  });
  const plans = {};
  for (const [key, plan] of Object.entries(record(raw.plans ?? {}, 'Planejamento'))) {
    const match = /^(couple|personal0|personal1)[|:](\d{4}-\d{2})$/.exec(key);
    if (!match) throw new Error('Chave de planejamento legado inválida.');
    plans[legacyScope(match[1]) + '|' + match[2]] = plan;
  }
  const { names, ...preserved } = raw;
  return {
    ...preserved,
    version: 3,
    people: names.map((name, index) => ({ id: 'person-' + index, name })),
    groups: [
      { id: 'group-legacy', name: 'Grupo compartilhado', memberIds: ['person-0', 'person-1'] },
    ],
    months,
    incomeConfigs,
    expenses,
    plans,
    goals: (raw.goals ?? []).map((goal) => ({ ...goal, scope: legacyScope(goal.scope) })),
    contributions: (raw.contributions ?? []).map((contribution) => ({
      ...contribution,
      scope: legacyScope(contribution.scope),
    })),
  };
}
function scopeMembers(data, scope) {
  text(scope, 'Espaço financeiro');
  if (scope.startsWith('person:')) {
    const id = scope.slice(7);
    if (!data.people.some((person) => person.id === id))
      throw new Error('Pessoa inexistente no espaço financeiro.');
    return [id];
  }
  if (scope.startsWith('group:')) {
    const group = data.groups.find((item) => item.id === scope.slice(6));
    if (!group) throw new Error('Grupo inexistente no espaço financeiro.');
    return group.memberIds;
  }
  throw new Error('Selecione um espaço financeiro válido.');
}

export function migrateData(input) {
  if (input == null)
    return {
      version: 3,
      people: [{ id: 'person-0', name: 'Você' }],
      groups: [],
      months: {},
      incomeConfigs: {},
      expenses: [],
      plans: {},
      goals: [],
      contributions: [],
      settlements: [],
    };
  record(input, 'Backup financeiro');
  if (![1, 2, 3].includes(input.version))
    throw new Error('Backup financeiro inválido ou incompatível.');
  const raw = input.version === 3 ? input : upgradeLegacy(input);
  if (
    !Array.isArray(raw.people) ||
    raw.people.length === 0 ||
    !Array.isArray(raw.groups) ||
    !Array.isArray(raw.expenses)
  )
    throw new Error('Pessoas, grupos ou despesas inválidos no backup.');
  const personIds = new Set();
  const people = raw.people.map((person) => {
    record(person, 'Pessoa');
    uniqueId(person.id, personIds, 'pessoa');
    text(person.name, 'Nome da pessoa');
    return { ...person };
  });
  const groupIds = new Set();
  const groups = raw.groups.map((group) => {
    record(group, 'Grupo');
    uniqueId(group.id, groupIds, 'grupo');
    text(group.name, 'Nome do grupo');
    if (
      !Array.isArray(group.memberIds) ||
      group.memberIds.length === 0 ||
      new Set(group.memberIds).size !== group.memberIds.length ||
      group.memberIds.some((id) => !personIds.has(id))
    )
      throw new Error('Integrantes do grupo inválidos no backup.');
    return { ...group, memberIds: [...group.memberIds] };
  });
  const context = { people, groups };
  const months = {};
  for (const [month, incomes] of Object.entries(record(raw.months, 'Rendas mensais'))) {
    monthKey(month);
    record(incomes, 'Rendas do mês');
    months[month] = {};
    for (const [id, amount] of Object.entries(incomes)) {
      if (!personIds.has(id)) throw new Error('Renda de pessoa inexistente.');
      Object.defineProperty(months[month], id, {
        value: cents(amount, 'Renda'),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  const incomeConfigs = {};
  for (const [month, configs] of Object.entries(
    record(raw.incomeConfigs ?? {}, 'Configurações de renda'),
  )) {
    monthKey(month);
    record(configs, 'Configurações mensais de renda');
    incomeConfigs[month] = {};
    for (const [id, config] of Object.entries(configs)) {
      if (!personIds.has(id)) throw new Error('Perfil de renda de pessoa inexistente.');
      incomeConfig(config);
      Object.defineProperty(incomeConfigs[month], id, {
        value: { ...defaultIncomeConfig(), ...config },
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  const expenseIds = new Set();
  const expenses = raw.expenses.map((expense) => {
    record(expense, 'Despesa');
    uniqueId(expense.id, expenseIds, 'despesa');
    text(expense.description, 'Descrição da despesa');
    const category = expense.category === undefined ? 'Outros' : expense.category;
    text(category, 'Categoria da despesa');
    cents(expense.amount, 'Despesa');
    monthOf(expense.date);
    if (!['paid', 'pending'].includes(expense.status))
      throw new Error('Situação da despesa inválida.');
    const members = scopeMembers(context, expense.workspace);
    if (!members.includes(expense.payer))
      throw new Error('Pagador deve pertencer ao espaço financeiro.');
    if (
      !Array.isArray(expense.participants) ||
      expense.participants.length === 0 ||
      new Set(expense.participants).size !== expense.participants.length ||
      expense.participants.some((id) => !members.includes(id))
    )
      throw new Error('Participantes da despesa inválidos.');
    if (
      expense.workspace.startsWith('person:') &&
      (expense.participants.length !== 1 || expense.participants[0] !== members[0])
    )
      throw new Error('Despesa pessoal deve pertencer somente ao seu titular.');
    if (!['equal', 'proportional', 'custom'].includes(expense.split))
      throw new Error('Divisão inválida no backup.');
    const percentages = record(expense.percentages ?? {}, 'Percentuais da despesa');
    if (Object.keys(percentages).some((id) => !expense.participants.includes(id)))
      throw new Error('Percentual de participante inexistente.');
    if (expense.split === 'custom') {
      if (
        Object.keys(percentages).length !== expense.participants.length ||
        sum(Object.values(percentages).map(percent)) !== 10000
      )
        throw new Error('Os percentuais dos participantes devem somar 100%.');
    } else Object.values(percentages).forEach(percent);
    if (expense.fixed !== undefined && typeof expense.fixed !== 'boolean')
      throw new Error('Recorrência da despesa inválida.');
    if (
      expense.fixedAmountType !== undefined &&
      !['fixed', 'variable'].includes(expense.fixedAmountType)
    )
      throw new Error('Tipo de valor recorrente inválido.');
    return {
      ...expense,
      category,
      participants: [...expense.participants],
      percentages: { ...percentages },
    };
  });
  const goals = raw.goals ?? [];
  if (!Array.isArray(goals)) throw new Error('Metas inválidas no backup.');
  const goalIds = new Set();
  goals.forEach((goal) => {
    record(goal, 'Meta');
    uniqueId(goal.id, goalIds, 'meta');
    scopeMembers(context, goal.scope);
    text(goal.title, 'Título da meta');
    cents(goal.target, 'Valor da meta');
    if (goal.target === 0) throw new Error('O valor da meta deve ser maior que zero.');
    if (goal.targetDate !== undefined && goal.targetDate !== null && goal.targetDate !== '')
      monthOf(goal.targetDate);
  });
  const contributions = raw.contributions ?? [];
  if (!Array.isArray(contributions)) throw new Error('Aportes inválidos no backup.');
  const contributionIds = new Set();
  contributions.forEach((contribution) => {
    record(contribution, 'Aporte');
    uniqueId(contribution.id, contributionIds, 'aporte');
    scopeMembers(context, contribution.scope);
    cents(contribution.amount, 'Aporte');
    monthOf(contribution.date);
    if (contribution.amount === 0) throw new Error('O valor do aporte deve ser maior que zero.');
    if (contribution.note !== undefined && typeof contribution.note !== 'string')
      throw new Error('Observação do aporte inválida.');
    if (
      contribution.goalId !== undefined &&
      contribution.goalId !== null &&
      contribution.goalId !== ''
    ) {
      text(contribution.goalId, 'Referência da meta');
      const goal = goals.find((item) => item.id === contribution.goalId);
      if (!goal || goal.scope !== contribution.scope)
        throw new Error('O aporte deve referenciar uma meta existente no mesmo espaço financeiro.');
    }
  });
  const settlements = raw.settlements ?? [];
  if (!Array.isArray(settlements)) throw new Error('Repasses inválidos no backup.');
  const settlementIds = new Set();
  settlements.forEach((settlement) => {
    record(settlement, 'Repasse');
    uniqueId(settlement.id, settlementIds, 'repasse');
    if (typeof settlement.scope !== 'string' || !settlement.scope.startsWith('group:'))
      throw new Error('Repasses devem pertencer a um grupo.');
    const members = scopeMembers(context, settlement.scope);
    validateSettlementRecord(settlement, members);
  });
  const plans = {};
  for (const [key, plan] of Object.entries(record(raw.plans ?? {}, 'Planejamento'))) {
    const separator = key.lastIndexOf('|');
    if (separator < 0) throw new Error('Chave de planejamento inválida.');
    scopeMembers(context, key.slice(0, separator));
    monthKey(key.slice(separator + 1));
    record(plan, 'Planejamento mensal');
    if (plan.spendingLimit !== undefined) cents(plan.spendingLimit, 'Limite de gastos');
    if (plan.savingTarget !== undefined) cents(plan.savingTarget, 'Meta mensal de economia');
    if (plan.categories !== undefined)
      Object.values(record(plan.categories, 'Limites por categoria')).forEach((value) =>
        cents(value, 'Limite por categoria'),
      );
    plans[key] = {
      ...plan,
      ...(plan.categories !== undefined ? { categories: { ...plan.categories } } : {}),
    };
  }
  return {
    ...raw,
    version: 3,
    people,
    groups,
    months,
    incomeConfigs,
    expenses,
    plans,
    goals: goals.map((goal) => ({ ...goal })),
    contributions: contributions.map((contribution) => ({ ...contribution })),
    settlements: settlements.map((settlement) => ({
      ...settlement,
      ...(settlement.receipt ? { receipt: { ...settlement.receipt } } : {}),
    })),
  };
}

export function calculateWorkspace(data, month, scope, incomes) {
  monthKey(month);
  record(incomes, 'Rendas');
  Object.values(incomes).forEach((value) => cents(value, 'Renda'));
  const members = scopeMembers(data, scope);
  const currentExpenses = data.expenses.filter((expense) => monthOf(expense.date) === month);
  const categories = Object.create(null);
  const addCategory = (category, amount) => {
    const key = typeof category === 'string' && category.trim() ? category : 'Outros';
    categories[key] = sum([categories[key] ?? 0, amount]);
  };
  let stats,
    income,
    expensePersonalTotal = 0,
    sharedShareTotal = 0;
  if (scope.startsWith('group:')) {
    const shared = currentExpenses.filter((expense) => expense.workspace === scope);
    stats = applySettlements(
      summarize(shared, incomes, members),
      (data.settlements ?? []).filter(
        (settlement) => settlement.scope === scope && settlement.referenceMonth === month,
      ),
      members,
    );
    sharedShareTotal = stats.total;
    income = sum(members.map((id) => (Object.hasOwn(incomes, id) ? incomes[id] : 0)));
    shared.forEach((expense) => addCategory(expense.category, expense.amount));
  } else {
    const owner = members[0];
    income = Object.hasOwn(incomes, owner) ? incomes[owner] : 0;
    const personal = currentExpenses.filter((expense) => expense.workspace === scope);
    const personalStats = summarize(personal, incomes, members);
    expensePersonalTotal = personalStats.total;
    let sharedPaid = 0;
    for (const group of data.groups.filter((item) => item.memberIds.includes(owner))) {
      for (const expense of currentExpenses.filter(
        (item) => item.workspace === 'group:' + group.id,
      )) {
        if (!expense.participants.includes(owner)) continue;
        const amount = splitExpense(expense, incomes, group.memberIds)[owner] ?? 0;
        sharedShareTotal = sum([sharedShareTotal, amount]);
        if (expense.status === 'paid') sharedPaid = sum([sharedPaid, amount]);
        else if (expense.status !== 'pending') throw new Error('Situação da conta inválida.');
        addCategory(expense.category, amount);
      }
    }
    const total = sum([expensePersonalTotal, sharedShareTotal]);
    const paid = sum([personalStats.paid, sharedPaid]);
    personal.forEach((expense) => addCategory(expense.category, expense.amount));
    stats = {
      total,
      paid,
      pending: total - paid,
      shares: { [owner]: total },
      paidBy: { [owner]: personalStats.paidBy[owner] ?? 0 },
      balances: {},
      transfers: [],
    };
  }
  let savingsAll = 0,
    savingsThisMonth = 0;
  for (const contribution of data.contributions ?? []) {
    scopeMembers(data, contribution.scope);
    cents(contribution.amount, 'Aporte');
    const contributionMonth = monthOf(contribution.date);
    if (contribution.scope !== scope) continue;
    savingsAll = sum([savingsAll, contribution.amount]);
    if (contributionMonth === month)
      savingsThisMonth = sum([savingsThisMonth, contribution.amount]);
  }
  return {
    ...stats,
    income,
    categories: { ...categories },
    savingsThisMonth,
    savingsAll,
    available: safe(BigInt(income) - BigInt(stats.total) - BigInt(savingsThisMonth)),
    expensePersonalTotal,
    sharedShareTotal,
  };
}
