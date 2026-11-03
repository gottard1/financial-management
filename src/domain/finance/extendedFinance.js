import { splitExpense } from '../expenses/expenseCalculations.js';
/** Optional finance rules. All amounts are integer cents; no I/O or market operations. */
export const extensionArrays = [
  'cards',
  'events',
  'incomeEntries',
  'reserveMovements',
  'investments',
  'investmentMovements',
  'investmentValuations',
];
export function integer(value, label = 'Valor', min = 0) {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${label} inválido.`);
  return value;
}
export function total(values) {
  const n = Number(values.reduce((a, b) => a + BigInt(b), 0n));
  if (!Number.isSafeInteger(n)) throw new Error('Total excede o limite permitido.');
  return n;
}
export function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date))
    throw new Error('Data inválida.');
  const d = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== date)
    throw new Error('Data inválida.');
  return date;
}
export function addMonths(month, offset) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error('Mês inválido.');
  integer(offset, 'Deslocamento', -120000);
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + offset;
  const year = Math.floor(index / 12),
    m = index - year * 12 + 1;
  if (year < 0 || year > 9999) throw new Error('Ano fora do intervalo.');
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
}
export function dateInMonth(month, day) {
  addMonths(month, 0);
  integer(day, 'Dia', 1);
  const last = new Date(`${addMonths(month, 1)}-01T12:00:00Z`);
  last.setUTCDate(0);
  return `${month}-${String(Math.min(day, last.getUTCDate())).padStart(2, '0')}`;
}
export function validateCardTerms(card) {
  if (!card || typeof card !== 'object') throw new Error('Selecione um cartão válido.');
  integer(card.closingDay, 'Fechamento', 1);
  integer(card.dueDay, 'Vencimento', 1);
  if (card.closingDay > 31 || card.dueDay > 31) throw new Error('Use dias entre 1 e 31.');
  if (card.dueMonthMode !== undefined && !['auto', 'same', 'next'].includes(card.dueMonthMode))
    throw new Error('Mês do vencimento inválido.');
  if (card.dueMonthMode === 'same' && card.dueDay < card.closingDay)
    throw new Error(
      'O vencimento não pode ser anterior ao fechamento. Selecione mês seguinte ou automático.',
    );
}
export function cardInvoicePeriod(invoiceMonth, card) {
  validateCardTerms(card);
  const offset =
    card.dueMonthMode === 'next'
      ? 1
      : card.dueMonthMode === 'same'
        ? 0
        : card.dueDay <= card.closingDay
          ? 1
          : 0;
  return {
    invoiceMonth,
    closingDate: dateInMonth(invoiceMonth, card.closingDay),
    date: dateInMonth(addMonths(invoiceMonth, offset), card.dueDay),
  };
}
export function invoiceDates(purchaseDate, card) {
  validDate(purchaseDate);
  validateCardTerms(card);
  const purchaseMonth = purchaseDate.slice(0, 7);
  const invoiceMonth = addMonths(
    purchaseMonth,
    purchaseDate > dateInMonth(purchaseMonth, card.closingDay) ? 1 : 0,
  );
  // Competência identifica o mês do fechamento; vencimento pode ser no mês seguinte.
  return { invoiceMonth, date: cardInvoicePeriod(invoiceMonth, card).date };
}
export function expenseMonth(expense) {
  return expense.cardId && expense.invoiceMonth ? expense.invoiceMonth : expense.date.slice(0, 7);
}
export function installmentAmount(purchaseTotal, count, current) {
  integer(purchaseTotal);
  integer(count, 'Parcelas', 1);
  integer(current, 'Parcela', 1);
  if (current > count) throw new Error('Parcela fora do intervalo.');
  return Math.floor(purchaseTotal / count) + (current <= purchaseTotal % count ? 1 : 0);
}
export function prepareExpense(draft, data, parse) {
  const { generateFuture, amountMode, totalInput, ...item } = draft;
  item.amount = parse(draft.amount);
  if (item.installments)
    item.installments = {
      total: Number(item.installments.total),
      current: Number(item.installments.current),
    };
  if (item.recurrence)
    item.recurrence = {
      total: Number(item.recurrence.total),
      current: Number(item.recurrence.current),
    };
  if (item.installments && amountMode === 'total') {
    item.purchaseTotal = parse(totalInput || draft.amount);
    item.amount = installmentAmount(
      item.purchaseTotal,
      item.installments.total,
      item.installments.current,
    );
  }
  if (!item.installments) delete item.purchaseTotal;
  if (item.cardId) {
    const card = (data.cards || []).find((c) => c.id === item.cardId && c.scope === item.workspace);
    if (!card) throw new Error('Selecione um cartão deste espaço.');
    // Snapshot terms: changing a card never recalculates recorded invoices.
    if (!item.cardTerms || item.cardTerms.id !== card.id || draft.recalculateInvoice) {
      item.cardTerms = {
        id: card.id,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        ...(card.dueMonthMode !== undefined ? { dueMonthMode: card.dueMonthMode } : {}),
      };
      Object.assign(item, invoiceDates(item.purchaseDate, item.cardTerms));
    }
  } else {
    delete item.invoiceMonth;
    delete item.cardTerms;
  }
  delete item.recalculateInvoice;
  return item;
}
export function futureInstallments(
  expense,
  expenses,
  createId = () => crypto.randomUUID(),
  projectionLimit,
) {
  if (!expense.installments) return [];
  integer(expense.installments.total, 'Parcelas', 1);
  if (!projectionLimit && expense.installments.total - expense.installments.current > 600)
    throw new Error('Gere até 600 parcelas por vez.');
  const originId = expense.originId || expense.id;
  const result = [];
  for (
    let i = expense.installments.current + 1;
    i <=
    Math.min(expense.installments.total, expense.installments.current + (projectionLimit || 600));
    i++
  ) {
    const offset = i - expense.installments.current;
    const month = addMonths(expenseMonth(expense), offset);
    if (
      expenses.some(
        (e) =>
          e.workspace === expense.workspace &&
          (e.originId || e.id) === originId &&
          expenseMonth(e) === month,
      )
    )
      continue;
    result.push({
      ...expense,
      id: createId(),
      originId,
      status: 'pending',
      date: dateInMonth(
        addMonths(expense.date.slice(0, 7), offset),
        Number(expense.date.slice(-2)),
      ),
      ...(expense.cardId ? { invoiceMonth: month } : {}),
      amount:
        expense.purchaseTotal === undefined
          ? expense.amount
          : installmentAmount(expense.purchaseTotal, expense.installments.total, i),
      installments: { ...expense.installments, current: i },
    });
  }
  return result;
}
export function monthlyIncomes(data, month, base = data.months?.[month] || {}) {
  return Object.fromEntries(
    data.people.map((person) => {
      const entries = (data.incomeEntries || []).filter(
        (e) => e.scope === `person:${person.id}` && e.date.startsWith(month),
      );
      const configs = data.incomeConfigs?.[month] || {};
      const mode =
        (Object.hasOwn(configs, person.id) ? configs[person.id].receiptMode : null) || 'supplement';
      const profileIncome = Object.hasOwn(base, person.id) ? base[person.id] : 0;
      return [
        person.id,
        mode === 'entries'
          ? total(entries.map((e) => e.amount))
          : mode === 'profile'
            ? profileIncome
            : total([
                profileIncome,
                ...entries.filter((e) => !e.includedInProfile).map((e) => e.amount),
              ]),
      ];
    }),
  );
}

export function installmentCommitments(data, scope, month, horizon = 600) {
  const owner = scope.startsWith('person:') ? scope.slice(7) : null;
  const relevant = (e) =>
    e.workspace === scope ||
    (owner && e.workspace.startsWith('group:') && e.participants.includes(owner));
  const anchors = data.expenses
    .filter((e) => e.installments && relevant(e))
    .sort((a, b) => b.installments.current - a.installments.current);
  const projected = [];
  let seq = 0;
  for (const e of anchors)
    projected.push(
      ...futureInstallments(
        e,
        [...data.expenses, ...projected],
        () => `projected-${seq++}`,
        horizon,
      ),
    );
  return [...anchors, ...projected]
    .filter((e) => expenseMonth(e) > month)
    .map((e) => {
      if (!owner || e.workspace === scope) return e;
      const group = data.groups.find((g) => e.workspace === `group:${g.id}`);
      try {
        return {
          ...e,
          amount:
            splitExpense(e, monthlyIncomes(data, expenseMonth(e)), group.memberIds)[owner] || 0,
        };
      } catch (error) {
        return { ...e, amount: 0, projectionError: error.message };
      }
    })
    .sort((a, b) => expenseMonth(a).localeCompare(expenseMonth(b)));
}
const before = (items, scope, date) =>
  (items || []).filter((e) => e.scope === scope && e.date <= date);
export function investmentPosition(data, asset, date = '9999-12-31') {
  const moves = before(data.investmentMovements, asset.scope, date).filter(
    (m) => m.investmentId === asset.id,
  );
  const sumKind = (kind) => total(moves.filter((m) => m.kind === kind).map((m) => m.amount));
  const effect = (m) => (['application', 'yield'].includes(m.kind) ? m.amount : -m.amount);
  const realizedGains = total(moves.map((m) => m.realizedGain || 0));
  const realizedLosses = total(moves.map((m) => m.realizedLoss || 0));
  const book = total([...moves.map(effect), realizedGains, -realizedLosses]);
  const valuation = before(data.investmentValuations, asset.scope, date)
    .filter((v) => v.investmentId === asset.id)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const current = valuation
    ? total([valuation.amount, ...moves.filter((m) => m.date > valuation.date).map(effect)])
    : book;
  return {
    applied: sumKind('application'),
    withdrawn: sumKind('redemption'),
    yields: sumKind('yield'),
    fees: sumKind('fee'),
    taxes: sumKind('tax'),
    realizedGains,
    realizedLosses,
    book,
    current,
    valuation,
    unrealized: total([current, -book]),
  };
}
export function reserveBalances(data, scope, date = '9999-12-31') {
  const balances = new Map();
  const add = (id, amount) => balances.set(id || '', total([balances.get(id || '') || 0, amount]));
  before(data.contributions, scope, date).forEach((m) => add(m.goalId, m.amount));
  before(data.reserveMovements, scope, date).forEach((m) => {
    if (m.kind === 'opening' || m.kind === 'deposit') add(m.goalId, m.amount);
    if (m.kind === 'withdrawal') add(m.goalId, -m.amount);
    if (m.kind === 'transfer') {
      add(m.goalId, -m.amount);
      add(m.toGoalId, m.amount);
    }
  });
  before(data.investmentMovements, scope, date)
    .filter((m) => m.funding === 'reserve')
    .forEach((m) => {
      if (m.kind === 'application') add(m.goalId, -m.amount);
      if (m.kind === 'redemption') add(m.goalId, m.amount);
    });
  return balances;
}
export function assetSummary(data, scope, date = '9999-12-31') {
  const reserves = reserveBalances(data, scope, date);
  const positions = (data.investments || [])
    .filter((a) => a.scope === scope)
    .map((a) => ({ ...a, ...investmentPosition(data, a, date) }));
  const reserveTotal = total([...reserves.values()]),
    invested = total(positions.map((p) => p.current));
  return { reserves, positions, reserveTotal, invested, wealth: total([reserveTotal, invested]) };
}
export function monthlyAssetFlows(data, scope, month) {
  const r = (data.reserveMovements || []).filter(
    (m) => m.scope === scope && m.date.startsWith(month),
  );
  const i = (data.investmentMovements || []).filter(
    (m) => m.scope === scope && m.date.startsWith(month) && m.funding === 'cash',
  );
  return {
    deposits: total(r.filter((m) => m.kind === 'deposit').map((m) => m.amount)),
    redemptions: total(
      [
        ...r.filter((m) => m.kind === 'withdrawal'),
        ...i.filter((m) => m.kind === 'redemption'),
      ].map((m) => m.amount),
    ),
    applications: total(i.filter((m) => m.kind === 'application').map((m) => m.amount)),
  };
}
export const suggestedDistribution = [
  ['Longo prazo', 65],
  ['Viagens', 20],
  ['Apartamento', 9],
  ['Pais', 2],
  ['Samantha', 1],
  ['Amigos', 1],
  ['S2', 1],
  ['Carro novo', 1],
];
export function percentage(value) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 1e-7
  )
    throw new Error('Percentual deve ter até duas casas, entre 0 e 100.');
  return Math.round(value * 100);
}
export function validateStrategy(s) {
  if (!s || !['amount', 'percent'].includes(s.targetType))
    throw new Error('Tipo de meta inválido.');
  integer(s.targetAmount);
  percentage(s.targetPercent);
  if (!Array.isArray(s.distribution) || !s.distribution.length || s.distribution.length > 100)
    throw new Error('Informe destinos para a distribuição.');
  const ids = new Set();
  for (const d of s.distribution) {
    if (typeof d.name !== 'string' || !d.name.trim() || typeof d.id !== 'string' || ids.has(d.id))
      throw new Error('Destino inválido ou duplicado.');
    ids.add(d.id);
    integer(d.fixedAmount);
    percentage(d.percent);
  }
  if (total(s.distribution.map((d) => percentage(d.percent))) !== 10000)
    throw new Error('A distribuição deve somar 100%.');
}
export function savingsSuggestions(strategy, income, balance, contributions = []) {
  validateStrategy(strategy);
  let remaining = Math.max(0, balance);
  const fixed = strategy.distribution.map((d) => {
    const n = Math.min(d.fixedAmount, remaining);
    remaining -= n;
    return n;
  });
  const allocations = strategy.distribution.map((d, index) => {
    const product = BigInt(remaining) * BigInt(percentage(d.percent));
    return { index, amount: Number(product / 10000n), remainder: Number(product % 10000n) };
  });
  let extra = remaining - total(allocations.map((a) => a.amount));
  for (const a of [...allocations].sort((a, b) => b.remainder - a.remainder || a.index - b.index))
    if (extra-- > 0) a.amount++;
  return {
    target:
      strategy.targetType === 'amount'
        ? strategy.targetAmount
        : Number((BigInt(income) * BigInt(percentage(strategy.targetPercent)) + 5000n) / 10000n),
    rows: strategy.distribution.map((d, index) => ({
      ...d,
      suggested: total([fixed[index], allocations[index].amount]),
      actual: total(contributions.filter((c) => c.destinationId === d.id).map((c) => c.amount)),
    })),
  };
}

export function validateExtensions(data, scopeMembers) {
  const label = (v) => {
    if (typeof v !== 'string' || !v.trim() || v.length > 200)
      throw new Error('Nome ou descrição inválida.');
  };
  const scopeCheck = (scope) => scopeMembers(data, scope);
  const goalCheck = (id, scope) => {
    if (id && !data.goals.some((g) => g.id === id && g.scope === scope))
      throw new Error('Objetivo deve pertencer ao mesmo espaço.');
  };
  const assetCheck = (m) => {
    if (!data.investments.some((a) => a.id === m.investmentId && a.scope === m.scope))
      throw new Error('Investimento deve pertencer ao mesmo espaço.');
  };
  for (const kind of extensionArrays) {
    if (!Array.isArray(data[kind])) throw new Error('Seção financeira inválida.');
    const ids = new Set();
    for (const item of data[kind]) {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        throw new Error('Registro financeiro inválido.');
      label(item.id);
      if (item.id.includes('|') || ids.has(item.id))
        throw new Error('Identificador financeiro duplicado ou inválido.');
      ids.add(item.id);
      scopeCheck(item.scope);
      for (const key of ['note', 'destinationId', 'goalId', 'toGoalId'])
        if (item[key] !== undefined && typeof item[key] !== 'string')
          throw new Error('Texto ou referência financeira inválida.');
      if (['cards', 'events', 'investments'].includes(kind)) label(item.name);
      else {
        validDate(item.date);
        integer(item.amount, 'Valor', kind === 'investmentValuations' ? 0 : 1);
      }
      if (kind === 'cards') {
        validateCardTerms(item);
      }
      if (kind === 'incomeEntries') {
        if (!item.scope.startsWith('person:'))
          throw new Error('Receitas individuais são privadas.');
        label(item.description);
        label(item.category);
        if (typeof item.includedInProfile !== 'boolean')
          throw new Error('Informe se a receita já consta no perfil.');
      }
      if (kind === 'reserveMovements') {
        if (!['opening', 'deposit', 'withdrawal', 'transfer'].includes(item.kind))
          throw new Error('Movimento de reserva inválido.');
        goalCheck(item.goalId, item.scope);
        goalCheck(item.toGoalId, item.scope);
        if (item.kind === 'transfer' && (item.goalId || '') === (item.toGoalId || ''))
          throw new Error('Escolha destinos diferentes.');
      }
      if (kind === 'investments') {
        label(item.type);
        label(item.institution);
        if (item.identifier !== undefined && typeof item.identifier !== 'string')
          throw new Error('Identificador inválido.');
        goalCheck(item.goalId, item.scope);
      }
      if (kind === 'investmentMovements') {
        assetCheck(item);
        goalCheck(item.goalId, item.scope);
        if (
          !['application', 'redemption', 'yield', 'fee', 'tax'].includes(item.kind) ||
          !['cash', 'reserve', 'asset'].includes(item.funding)
        )
          throw new Error('Movimentação de investimento inválida.');
        if (
          ['application', 'redemption'].includes(item.kind)
            ? item.funding === 'asset'
            : item.funding !== 'asset'
        )
          throw new Error('Origem/destino incompatível com o movimento.');
        integer(item.realizedGain ?? 0, 'Ganho realizado');
        integer(item.realizedLoss ?? 0, 'Perda realizada');
        if ((item.realizedGain || item.realizedLoss) && item.kind !== 'redemption')
          throw new Error('Ganho/perda de resgate exige um resgate.');
        if (item.realizedGain && item.realizedLoss)
          throw new Error('Informe ganho ou perda neste resgate.');
        if ((item.realizedGain || 0) > item.amount)
          throw new Error('Ganho realizado não pode superar o valor resgatado.');
      }
      if (kind === 'investmentValuations') {
        assetCheck(item);
        if (
          data[kind].some(
            (v) => v !== item && v.investmentId === item.investmentId && v.date === item.date,
          )
        )
          throw new Error('Já existe uma avaliação para esta data.');
      }
    }
  }
  for (const c of data.contributions)
    if (c.destinationId !== undefined && typeof c.destinationId !== 'string')
      throw new Error('Destino de aporte inválido.');
  for (const e of data.expenses) {
    for (const key of ['eventId', 'cardId', 'originId'])
      if (e[key] !== undefined && typeof e[key] !== 'string')
        throw new Error('Referência de despesa inválida.');
    if (e.essential !== undefined && typeof e.essential !== 'boolean')
      throw new Error('Classificação essencial inválida.');
    if (e.companion !== undefined && (typeof e.companion !== 'string' || e.companion.length > 120))
      throw new Error('Com quem inválido.');
    if (e.eventId && !data.events.some((v) => v.id === e.eventId && v.scope === e.workspace))
      throw new Error('Evento deve pertencer ao mesmo espaço.');
    if (e.purchaseDate) validDate(e.purchaseDate);
    if (e.cardId) {
      if (
        !data.cards.some((v) => v.id === e.cardId && v.scope === e.workspace) ||
        !e.purchaseDate ||
        !e.invoiceMonth ||
        !e.cardTerms
      )
        throw new Error('Fatura incompleta.');
      addMonths(e.invoiceMonth, 0);
      invoiceDates(e.purchaseDate, e.cardTerms);
    }
    if (e.purchaseTotal !== undefined) {
      integer(e.purchaseTotal, 'Total da compra', 1);
      if (
        !e.installments ||
        e.amount !==
          installmentAmount(e.purchaseTotal, e.installments.total, e.installments.current)
      )
        throw new Error('Parcela não conserva o total da compra.');
    }
    if (e.recurrence !== undefined) {
      if (!e.fixed || e.installments)
        throw new Error('Recorrência e compra parcelada são opções distintas.');
      integer(e.recurrence.total, 'Meses', 1);
      integer(e.recurrence.current, 'Mês atual', 1);
      if (e.recurrence.current > e.recurrence.total) throw new Error('Recorrência encerrada.');
    }
  }
  for (const configs of Object.values(data.incomeConfigs))
    for (const config of Object.values(configs))
      if (
        config.receiptMode !== undefined &&
        !['profile', 'supplement', 'entries'].includes(config.receiptMode)
      )
        throw new Error('Modo de receita inválido.');
  for (const [key, plan] of Object.entries(data.plans)) {
    if (plan.savingsStrategy) {
      validateStrategy(plan.savingsStrategy);
      plan.savingsStrategy.distribution.forEach((d) => goalCheck(d.goalId, key.split('|')[0]));
    }
    if (plan.savingsStrategyHistory !== undefined) {
      if (!Array.isArray(plan.savingsStrategyHistory))
        throw new Error('Histórico de estratégias inválido.');
      plan.savingsStrategyHistory.forEach(validateStrategy);
    }
  }
  // Validate chronological balances, including backdated corrections, without rewriting history.
  const scopes = new Set(
    [...data.reserveMovements, ...data.investmentMovements].map((m) => m.scope),
  );
  for (const scope of scopes) {
    if (data.groups.some((g) => scope === `group:${g.id}` && g.deleted && g.purging)) continue;
    const dates = [
      ...new Set(
        [
          ...data.reserveMovements,
          ...data.investmentMovements,
          ...data.contributions,
          ...data.investmentValuations,
        ]
          .filter((m) => m.scope === scope)
          .map((m) => m.date),
      ),
    ].sort();
    for (const date of dates) {
      if ([...reserveBalances(data, scope, date).values()].some((v) => v < 0))
        throw new Error('Saldo da reserva insuficiente nesta data ou no histórico posterior.');
      for (const a of data.investments.filter((a) => a.scope === scope))
        if (investmentPosition(data, a, date).current < 0)
          throw new Error('Saldo do investimento insuficiente nesta data.');
    }
  }
}
