import { splitExpense } from './expenseCalculations.js';
import { cashExpenseShare } from '../benefits/benefitPayments.js';
import { expenseMonth, monthlyIncomes, total } from '../finance/extendedFinance.js';

/** Read-only union. Never copies a group expense into personal storage. */
export function consolidatedExpenses(data, personId, month, remoteGroups = [], accountUid) {
  const rows = [],
    personalScope = `person:${personId}`;
  function add(expense, owner, group, remote = false) {
    if (expenseMonth(expense) !== month) return;
    if (group && !expense.participants.includes(owner) && expense.payer !== owner) return;
    let ownAmount = expense.amount,
      error = '';
    if (group) {
      if (!expense.participants.includes(owner)) ownAmount = 0;
      else
        try {
          ownAmount = remote
            ? expense.shares?.[owner]
            : splitExpense(expense, monthlyIncomes(data, month), group.memberIds)[owner];
          if (!Number.isSafeInteger(ownAmount) || ownAmount < 0)
            throw new Error('A cota compartilhada ainda não está disponível. Atualize o grupo.');
        } catch (e) {
          ownAmount = null;
          error = e.message;
        }
    }
    rows.push({
      key: `${remote ? 'remote' : 'local'}:${group?.id || personalScope}:${expense.id}`,
      expense,
      description: expense.description,
      category: expense.category || 'Outros',
      date: expense.date,
      month: expenseMonth(expense),
      status: expense.status,
      essential: expense.essential === true,
      totalAmount: expense.amount,
      ownAmount,
      cashAmount: ownAmount === null ? null : cashExpenseShare(expense, owner, ownAmount),
      payerIsMe: expense.payer === owner,
      error,
      paidByMe: expense.status === 'paid' && expense.payer === owner ? expense.amount : 0,
      kind: group ? 'group' : 'personal',
      origin: group?.name || 'Pessoal',
      originKey: group ? `${remote ? 'remote' : 'local'}:${group.id}` : 'personal',
      groupId: group?.id || '',
    });
  }
  data.expenses.filter((e) => e.workspace === personalScope).forEach((e) => add(e, personId));
  for (const group of data.groups.filter((g) => g.memberIds.includes(personId)))
    data.expenses
      .filter((e) => e.workspace === `group:${group.id}`)
      .forEach((e) => add(e, personId, group));
  const seen = new Set();
  for (const remote of remoteGroups) {
    if (seen.has(remote.id)) continue;
    seen.add(remote.id);
    const snapshot = remote.snapshot,
      member = remote.membership;
    if (
      !snapshot ||
      !member ||
      member.groupId !== remote.id ||
      !snapshot.people.some((p) => p.id === member.personId) ||
      !(snapshot.activeMemberIds || snapshot.people.map((p) => p.id)).includes(member.personId)
    )
      continue;
    if (
      accountUid &&
      remote.adminUid === accountUid &&
      data.groups.some((g) => g.id === snapshot.id)
    )
      continue;
    const group = { id: remote.id, name: snapshot.name };
    snapshot.expenses.forEach((e) => add(e, member.personId, group, true));
  }
  return rows.sort(
    (a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description),
  );
}

export function consolidatedTotals(rows) {
  const known = rows.filter((r) => !r.error);
  return {
    personal: total(known.filter((r) => r.kind === 'personal').map((r) => r.ownAmount)),
    shared: total(known.filter((r) => r.kind === 'group').map((r) => r.ownAmount)),
    total: total(known.map((r) => r.ownAmount)),
    cash: total(known.map((r) => r.cashAmount)),
    benefits: total(known.map((r) => r.ownAmount - r.cashAmount)),
    paidByMe: total(rows.map((r) => r.paidByMe)),
    incomplete: rows.some((r) => r.error),
  };
}
