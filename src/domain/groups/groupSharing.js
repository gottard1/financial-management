import { splitExpense } from '../expenses/expenseCalculations.js';

export function normalizeInviteEmail(value) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Informe um e-mail válido.');
  return email;
}

// An explicit allowlist prevents private incomes, personal expenses and receipt metadata leaking.
export function projectSharedGroup(data, groupId) {
  const group = data.groups.find((item) => item.id === groupId);
  if (!group) throw new Error('Grupo não encontrado.');
  return {
    id: group.id,
    name: group.name,
    people: group.memberIds.map((id) => ({
      id,
      name: data.people.find((person) => person.id === id).name,
    })),
    expenses: data.expenses
      .filter((expense) => expense.workspace === `group:${group.id}`)
      .map((expense) => ({
        id: expense.id,
        description: expense.description,
        amount: expense.amount,
        date: expense.date,
        status: expense.status,
        payer: expense.payer,
        shares: splitExpense(expense, data.months[expense.date.slice(0, 7)] || {}, group.memberIds),
      })),
    settlements: (data.settlements || [])
      .filter((item) => item.scope === `group:${group.id}`)
      .map(({ id, from, to, amount, date, referenceMonth, status }) => ({
        id,
        from,
        to,
        amount,
        date,
        referenceMonth,
        status,
      })),
  };
}
