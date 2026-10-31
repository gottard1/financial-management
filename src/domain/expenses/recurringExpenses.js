import { parseMoney } from './expenseCalculations.js';

export function validateInstallments(expense) {
  if (expense.installments === undefined) return;
  const value = expense.installments;
  if (
    !expense.fixed ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Number.isSafeInteger(value.total) ||
    value.total < 1 ||
    !Number.isSafeInteger(value.current) ||
    value.current < 1 ||
    value.current > value.total
  )
    throw new Error(
      'Informe uma quantidade inteira positiva de parcelas e uma parcela atual entre 1 e o total.',
    );
}

export function recurrenceLabel(expense) {
  if (!expense.fixed) return '';
  if (expense.installments)
    return `Parcela ${expense.installments.current} de ${expense.installments.total}${expense.installments.current === expense.installments.total ? ' · última' : ''}`;
  return expense.fixedAmountType === 'variable' ? 'Recorrente variável' : 'Recorrente fixa';
}

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
    validateInstallments(item);
    if (item.installments && item.installments.current >= item.installments.total) return false;
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
  activeMemberIds,
) {
  const [year, number] = monthParts(month);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const copies = recurringCandidates(expenses, scope, month)
    .filter((item) => entries[item.id]?.selected)
    .map((item) => {
      if (
        activeMemberIds &&
        (item.participants.some((id) => !activeMemberIds.includes(id)) ||
          !activeMemberIds.includes(item.payer))
      )
        throw new Error(
          `${item.description} inclui um participante removido. Cadastre uma nova recorrência com os participantes atuais.`,
        );
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
        ...(item.installments
          ? {
              installments: {
                total: item.installments.total,
                current: item.installments.current + 1,
              },
            }
          : {}),
      };
    });
  if (!copies.length)
    throw new Error('Selecione pelo menos uma conta ainda não copiada para este mês.');
  return copies;
}
