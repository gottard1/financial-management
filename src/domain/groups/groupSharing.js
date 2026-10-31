import { splitExpense } from '../expenses/expenseCalculations.js';
import { activeGroupMembers } from './groupMembers.js';
import { calculateWorkspace } from '../budget/workspaceCalculations.js';
import { sumRestrictedBenefits } from '../income/calculateCompensation.js';

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
    activeMemberIds: activeGroupMembers(group),
    emptyOverview: {
      stats: calculateWorkspace(
        { ...data, expenses: [], settlements: [] },
        '0000-01',
        `group:${groupId}`,
        {},
      ),
      plan: {},
    },
    overview: Object.fromEntries(
      [
        ...new Set([
          ...Object.keys(data.months || {}),
          ...Object.keys(data.incomeConfigs || {}),
          ...Object.keys(data.plans || {})
            .filter((key) => key.startsWith(`group:${groupId}|`))
            .map((key) => key.split('|')[1]),
          ...data.expenses
            .filter((item) => item.workspace === `group:${groupId}`)
            .map((item) => item.date.slice(0, 7)),
          ...(data.contributions || [])
            .filter((item) => item.scope === `group:${groupId}`)
            .map((item) => item.date.slice(0, 7)),
          ...(data.settlements || [])
            .filter((item) => item.scope === `group:${groupId}`)
            .map((item) => item.referenceMonth),
        ]),
      ]
        .filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        .map((month) => [
          month,
          {
            stats: calculateWorkspace(
              {
                ...data,
                settlements: (data.settlements || []).map(({ receipt, ...item }) => item),
              },
              month,
              `group:${groupId}`,
              data.months[month] || {},
            ),
            benefits: sumRestrictedBenefits(
              group.memberIds.map((id) => data.incomeConfigs?.[month]?.[id]),
            ),
            plan: {
              spendingLimit: data.plans?.[`group:${groupId}|${month}`]?.spendingLimit || 0,
              savingTarget: data.plans?.[`group:${groupId}|${month}`]?.savingTarget || 0,
            },
          },
        ]),
    ),
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
        ...(expense.installments ? { installments: { ...expense.installments } } : {}),
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
