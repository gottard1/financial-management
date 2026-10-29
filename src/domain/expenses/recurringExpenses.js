import { parseMoney } from './expenseCalculations.js';

function monthParts(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês de referência inválido.');
  return [Number(month.slice(0, 4)), Number(month.slice(5))];
}

export function recurringCandidates(expenses, scope, month) {
  const [year, number] = monthParts(month);
  const previous = `${number === 1 ? year - 1 : year}-${String(number === 1 ? 12 : number - 1).padStart(2, '0')}`;
  const existing = new Set(
    expenses
      .filter((item) => item.workspace === scope && item.date.startsWith(month))
      .map((item) => item.originId || item.id),
  );
  const seen = new Set(existing);
  return expenses.filter((item) => {
    const origin = item.originId || item.id;
    if (
      item.workspace !== scope ||
      !item.fixed ||
      !item.date.startsWith(previous) ||
      seen.has(origin)
    )
      return false;
    seen.add(origin);
    return true;
  });
}

/** A new month's amount belongs only to that occurrence; historical records stay untouched. */
export function copyRecurringExpenses(
  expenses,
  scope,
  month,
  entries,
  createId = () => crypto.randomUUID(),
) {
  const [year, number] = monthParts(month);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const copies = recurringCandidates(expenses, scope, month)
    .filter((item) => entries[item.id]?.selected)
    .map((item) => {
      const amount = parseMoney(entries[item.id].amount);
      if (amount <= 0) throw new Error(`Informe um valor maior que zero para ${item.description}.`);
      return {
        ...item,
        id: createId(),
        originId: item.originId || item.id,
        amount,
        date: `${month}-${String(Math.min(Number(item.date.slice(-2)), lastDay)).padStart(2, '0')}`,
        status: 'pending',
        participants: [...item.participants],
        percentages: { ...item.percentages },
      };
    });
  if (!copies.length)
    throw new Error('Selecione pelo menos uma conta ainda não copiada para este mês.');
  return copies;
}
