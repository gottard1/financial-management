const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function cents(value, label = 'Valor') {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} deve ser um valor válido em centavos.`);
  return value;
}

function safeNumber(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new Error('O total ultrapassa o limite de valores permitido.');
  return result;
}

export function money(value) {
  if (!Number.isSafeInteger(value)) throw new Error('Valor monetário inválido.');
  return formatter.format(value / 100);
}

export function parseMoney(input) {
  if (typeof input !== 'string') throw new Error('Informe um valor monetário.');
  const value = input.trim().replace(/^R\$\s*/, '');
  let normalized;
  if (/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(value)) {
    normalized = value.replaceAll('.', '').replace(',', '.');
  } else if (/^\d+(?:\.\d{1,2})?$/.test(value)) {
    normalized = value;
  } else {
    throw new Error('Use um valor como 1.250,50 ou 1250.50, com até duas casas decimais.');
  }
  const [whole, fraction = ''] = normalized.split('.');
  return safeNumber(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
}

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} deve ser um objeto por identificador.`);
  return value;
}

function validIds(ids, label) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error(`Informe ao menos um ${label}.`);
  const unique = new Set();
  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim())
      throw new Error(`Identificador de ${label} inválido.`);
    if (unique.has(id)) throw new Error(`Identificador de ${label} duplicado.`);
    unique.add(id);
  }
  return unique;
}

function validateContext(incomes, memberIds) {
  const members = validIds(memberIds, 'membro');
  record(incomes, 'Rendas');
  for (const value of Object.values(incomes)) cents(value, 'Renda');
  return members;
}

function percentageBasisPoints(value) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100 ||
    !/^\d+(?:\.\d{1,2})?$/.test(String(value))
  )
    throw new Error('Cada percentual deve estar entre 0 e 100, com até duas casas decimais.');
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** Largest remainders conserve every cent; equal remainders follow participant order. */
function allocate(amount, participants, weights, memberIds) {
  const denominator = weights.reduce((total, value) => total + value, 0n);
  const portions = participants.map((id, index) => {
    const weighted = BigInt(amount) * weights[index];
    return { id, index, value: weighted / denominator, remainder: weighted % denominator };
  });
  const assigned = portions.reduce((total, portion) => total + portion.value, 0n);
  const remainderOrder = [...portions].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  const remaining = Number(BigInt(amount) - assigned);
  for (let index = 0; index < remaining; index += 1) remainderOrder[index].value += 1n;
  const values = new Map(portions.map(({ id, value }) => [id, safeNumber(value)]));
  return Object.fromEntries(memberIds.map((id) => [id, values.get(id) ?? 0]));
}

export function splitExpense(expense, incomes, memberIds) {
  const members = validateContext(incomes, memberIds);
  record(expense, 'Despesa');
  const amount = cents(expense.amount);
  validIds(expense.participants, 'participante');
  if (expense.participants.some((id) => !members.has(id)))
    throw new Error('Os participantes devem pertencer ao espaço financeiro.');
  if (!members.has(expense.payer))
    throw new Error('Selecione quem pagou ou pagará entre os membros do espaço financeiro.');
  if (!['paid', 'pending'].includes(expense.status)) throw new Error('Situação da conta inválida.');
  let weights;
  if (expense.split === 'equal') weights = expense.participants.map(() => 1n);
  else if (expense.split === 'proportional') {
    weights = expense.participants.map((id) =>
      BigInt(Object.hasOwn(incomes, id) ? incomes[id] : 0),
    );
    if (weights.every((value) => value === 0n))
      throw new Error(
        'Informe pelo menos uma renda dos participantes para usar a divisão proporcional.',
      );
  } else if (expense.split === 'custom') {
    record(expense.percentages, 'Percentuais');
    weights = expense.participants.map((id) =>
      percentageBasisPoints(
        Object.hasOwn(expense.percentages, id) ? expense.percentages[id] : undefined,
      ),
    );
    if (weights.reduce((total, value) => total + value, 0n) !== 10000n)
      throw new Error('Os percentuais dos participantes devem somar exatamente 100%.');
  } else throw new Error('Selecione uma forma de divisão válida.');
  return allocate(amount, expense.participants, weights, memberIds);
}

export function buildTransfers(balances, memberIds) {
  const debtors = memberIds
    .filter((id) => balances[id] < 0)
    .map((id) => ({ id, amount: -balances[id] }));
  const creditors = memberIds
    .filter((id) => balances[id] > 0)
    .map((id) => ({ id, amount: balances[id] }));
  const transfers = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.id, to: creditor.id, amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }
  return transfers;
}

export function summarize(expenses, incomes, memberIds) {
  validateContext(incomes, memberIds);
  if (!Array.isArray(expenses)) throw new Error('Informe uma lista de despesas.');
  let total = 0n;
  let paid = 0n;
  const shares = new Map(memberIds.map((id) => [id, 0n]));
  const paidShares = new Map(shares);
  const paidBy = new Map(shares);
  for (const expense of expenses) {
    const division = splitExpense(expense, incomes, memberIds);
    total += BigInt(expense.amount);
    for (const id of memberIds) shares.set(id, shares.get(id) + BigInt(division[id]));
    if (expense.status === 'paid') {
      paid += BigInt(expense.amount);
      paidBy.set(expense.payer, paidBy.get(expense.payer) + BigInt(expense.amount));
      for (const id of memberIds) paidShares.set(id, paidShares.get(id) + BigInt(division[id]));
    }
  }
  const totalNumber = safeNumber(total);
  const balances = Object.fromEntries(
    memberIds.map((id) => [id, safeNumber(paidBy.get(id) - paidShares.get(id))]),
  );
  return {
    total: totalNumber,
    paid: safeNumber(paid),
    pending: safeNumber(total - paid),
    shares: Object.fromEntries(memberIds.map((id) => [id, safeNumber(shares.get(id))])),
    paidBy: Object.fromEntries(memberIds.map((id) => [id, safeNumber(paidBy.get(id))])),
    balances,
    transfers: buildTransfers(balances, memberIds),
  };
}
