import { splitExpense } from '../expenses/expenseCalculations.js';
import { activeGroupMembers } from './groupMembers.js';
import { calculateWorkspace } from '../budget/workspaceCalculations.js';
import { publicGroupStats } from './groupOverview.js';

export function normalizeInviteEmail(value) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Informe um e-mail válido.');
  return email;
}

export function invitableGroupMembers(group) {
  return activeGroupMembers(group).filter((id) => id !== group?.adminPersonId);
}

// An explicit allowlist prevents private incomes, personal expenses and receipt metadata leaking.
export function projectSharedGroup(data, groupId) {
  data = { ...data, settlements: (data.settlements || []).filter((item) => !item.sharedReceipt) };
  const group = data.groups.find((item) => item.id === groupId);
  if (!group) throw new Error('Grupo não encontrado.');
  return {
    id: group.id,
    name: group.name,
    adminPersonId: group.adminPersonId || null,
    activeMemberIds: activeGroupMembers(group),
    emptyOverview: {
      stats: publicGroupStats(
        calculateWorkspace(
          { ...data, expenses: [], settlements: [] },
          '0000-01',
          `group:${groupId}`,
          {},
        ),
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
            stats: publicGroupStats(
              calculateWorkspace(
                {
                  ...data,
                  settlements: (data.settlements || []).map(({ receipt, ...item }) => item),
                },
                month,
                `group:${groupId}`,
                data.months[month] || {},
              ),
            ),
            plan: {
              spendingLimit: data.plans?.[`group:${groupId}|${month}`]?.spendingLimit || 0,
              savingTarget: data.plans?.[`group:${groupId}|${month}`]?.savingTarget || 0,
              categories: data.plans?.[`group:${groupId}|${month}`]?.categories || {},
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
        category: expense.category || 'Outros',
        participants: [...expense.participants],
        split: expense.split,
        percentages: { ...(expense.percentages || {}) },
        ...(expense.originId ? { originId: expense.originId } : {}),
        ...(expense.fixed
          ? { fixed: true, fixedAmountType: expense.fixedAmountType || 'fixed' }
          : {}),
        shares: splitExpense(expense, data.months[expense.date.slice(0, 7)] || {}, group.memberIds),
        ...(expense.installments ? { installments: { ...expense.installments } } : {}),
      })),
    goals: (data.goals || [])
      .filter((item) => item.scope === `group:${groupId}`)
      .map(({ id, scope, title, target, targetDate }) => ({
        id,
        scope,
        title,
        target,
        ...(targetDate ? { targetDate } : {}),
      })),
    contributions: (data.contributions || [])
      .filter((item) => item.scope === `group:${groupId}`)
      .map(({ id, scope, amount, date, goalId, note }) => ({
        id,
        scope,
        amount,
        date,
        ...(goalId ? { goalId } : {}),
        ...(note ? { note } : {}),
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
