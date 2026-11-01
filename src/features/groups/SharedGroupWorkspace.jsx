import React, { useEffect, useRef, useState } from 'react';
import { MonthlyOverview } from '../overview/MonthlyOverview.jsx';
import { ExpenseList } from '../expenses/ExpenseList.jsx';
import { ExpenseDialog } from '../expenses/ExpenseDialog.jsx';
import { RecurringExpensesDialog } from '../expenses/RecurringExpensesDialog.jsx';
import { BudgetPanel } from '../budget/BudgetPanel.jsx';
import { SavingsPanel } from '../savings/SavingsPanel.jsx';
import { SettlementsPanel } from '../settlements/SettlementsPanel.jsx';
import { MonthlyComparisonPanel } from '../comparison/MonthlyComparisonPanel.jsx';
import { parseMoney, splitExpense } from '../../domain/expenses/expenseCalculations.js';
import { recurringCandidates } from '../../domain/expenses/recurringExpenses.js';
import { sharedGroupData, sharedGroupChanges } from '../../domain/groups/sharedGroupEditing.js';
import { ledgerRecords, sharedMonthOverview } from '../../domain/settlements/sharedSettlements.js';
import { editSharedGroup } from '../../infrastructure/firebase/sharedGroupEditingRepository.js';
import { saveSharedSettlement } from '../../infrastructure/firebase/sharedSettlementRepository.js';
import { SharedGroupInvitationPanel } from './SharedGroupInvitationPanel.jsx';

const amountText = (amount) => (amount / 100).toFixed(2).replace('.', ',');
function expenseInput(draft, scope) {
  return {
    ...draft,
    workspace: scope,
    amount: parseMoney(draft.amount),
    description: draft.description.trim(),
    percentages: Object.fromEntries(
      Object.entries(draft.percentages || {}).map(([id, value]) => [id, Number(value)]),
    ),
    ...(draft.installments
      ? {
          installments: {
            total: Number(draft.installments.total),
            current: Number(draft.installments.current),
          },
        }
      : {}),
  };
}

export function SharedGroupWorkspace({
  group,
  membership,
  month,
  ledgers,
  user,
  tab = 'overview',
  onNavigate,
  onSaved,
  execute = editSharedGroup,
}) {
  const [localTab, setTab] = useState('overview');
  const selectedTab = tab === 'groups' ? 'groups' : onNavigate ? tab : localTab;
  const go = onNavigate || setTab;
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState(null);
  const [recurring, setRecurring] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false),
    dialog = useRef(null),
    newId = useRef('');
  const snapshot = group.snapshot;
  const scope = `group:${snapshot.id}`;
  const data = sharedGroupData(snapshot);
  data.settlements = [
    ...data.settlements.map((item) => ({ ...item, sharedReceipt: true })),
    ...ledgers.flatMap((ledger) =>
      ledgerRecords(ledger).map((item) => ({ ...item, scope, sharedReceipt: true })),
    ),
  ];
  const overview = sharedMonthOverview(
    snapshot,
    month,
    ledgers.find((item) => item.month === month),
  );
  const members = data.groups[0].memberIds;
  const active = snapshot.activeMemberIds || members;
  const expenses = data.expenses.filter((item) => item.date.startsWith(month));
  const context = useRef(null);
  context.current = { group, data, scope };

  useEffect(() => {
    if (draft) dialog.current?.showModal();
  }, [Boolean(draft)]);
  useEffect(() => {
    setDraft(null);
    setRecurring(null);
    setError('');
  }, [month]);
  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    if (!draft?.amount) return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const item = expenseInput(draft, scope);
        let shares;
        if (item.split !== 'proportional') shares = splitExpense(item, {}, members);
        else {
          const previous = {
            ...context.current.data,
            expenses: context.current.data.expenses.filter((expense) => expense.id !== draft.id),
          };
          const changes = sharedGroupChanges(previous, {
            ...previous,
            expenses: [
              ...previous.expenses.filter((expense) => expense.id !== draft.id),
              { ...item, id: draft.id || newId.current, description: item.description || 'Prévia' },
            ],
          });
          shares = (
            await execute(membership.groupId, group.revision, {
              action: 'preview',
              changes,
            })
          ).shares;
        }
        if (current) setPreview(shares);
      } catch (err) {
        if (current) setPreviewError(err.message);
      }
    }, 500);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [draft, scope, group.revision, execute]);

  async function mutate(command) {
    if (lock.current) throw new Error('Aguarde o salvamento em andamento.');
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const current = context.current.group;
      const result = await execute(membership.groupId, current.revision, command);
      onSaved(result);
      setNotice('Alterações do grupo salvas na nuvem.');
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function setData(update) {
    const previous = context.current.data;
    const next = typeof update === 'function' ? update(previous) : update;
    const changes = sharedGroupChanges(previous, next);
    if (changes.length) await mutate({ action: 'upsert', changes });
  }
  const onSharedReceive = (transfer, id) =>
    saveSharedSettlement(membership.groupId, {
      month,
      transfer: { from: transfer.from, to: transfer.to, amount: transfer.amount },
      id: id || transfer.id,
      date: transfer.date || new Date().toLocaleDateString('sv-SE'),
    });
  const onSharedUndo = (voidId) => saveSharedSettlement(membership.groupId, { month, voidId });
  function newExpense() {
    newId.current = crypto.randomUUID();
    setError('');
    setDraft({
      description: '',
      amount: '',
      category: 'Moradia',
      date: month + '-01',
      participants: [...active],
      payer: membership.personId,
      split: 'proportional',
      percentages: {},
      status: 'pending',
      fixed: false,
      fixedAmountType: 'fixed',
      workspace: scope,
    });
  }
  function edit(item) {
    setError('');
    setDraft({ ...item, amount: amountText(item.amount), percentages: { ...item.percentages } });
  }
  async function saveExpense(event) {
    event.preventDefault();
    try {
      const item = { ...expenseInput(draft, scope), id: draft.id || newId.current };
      if (!item.date.startsWith(month))
        throw new Error('A data deve pertencer ao mês selecionado.');
      await setData((current) => ({
        ...current,
        expenses: [...current.expenses.filter((expense) => expense.id !== item.id), item],
      }));
      setDraft(null);
    } catch (err) {
      setError(err.message);
    }
  }
  function copyFixed() {
    const items = recurringCandidates(data.expenses, scope, month).map((item) => ({
      ...item,
      unavailableReason:
        item.participants.some((id) => !active.includes(id)) || !active.includes(item.payer)
          ? 'Inclui um participante removido.'
          : '',
    }));
    if (!items.length) {
      setNotice('Nenhuma conta recorrente nova encontrada no mês anterior.');
      return;
    }
    setRecurring(items);
  }
  const common = {
    data,
    scope,
    month,
    stats: overview?.stats,
    mode: 'group',
    receiverId: membership.personId,
    receiverUid: user?.uid,
    onSharedReceive,
    onSharedUndo,
  };
  return (
    <>
      {selectedTab !== 'groups' && (
        <div className="notice">
          <span>
            <strong>{snapshot.name}</strong> · Você pode criar e editar lançamentos financeiros. Os
            dados cadastrais, as exclusões e a remoção de membros são gerenciados pelo
            administrador.
          </span>
        </div>
      )}
      {!onNavigate && selectedTab !== 'groups' && (
        <nav className="group-subnav" aria-label="Seções do grupo compartilhado">
          {[
            ['overview', 'Visão do grupo'],
            ['expenses', 'Despesas'],
            ['budget', 'Orçamento'],
            ['savings', 'Metas e reservas'],
            ['settlements', 'Repasses e comprovantes'],
            ['comparison', 'Comparar meses'],
          ].map(([id, title]) => (
            <button
              key={id}
              className={'button ' + (id === selectedTab ? 'primary' : 'secondary')}
              onClick={() => go(id)}
            >
              {title}
            </button>
          ))}
        </nav>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && !draft && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">Salvando alterações do grupo…</p>}
      <div inert={busy ? true : undefined}>
        {selectedTab === 'groups' && (
          <SharedGroupInvitationPanel
            snapshot={snapshot}
            onInvite={async (invitation) => {
              await mutate({ action: 'invite', ...invitation });
              setNotice(
                'Convite criado. A pessoa deve entrar com Google e aceitar em Pessoas e grupos.',
              );
            }}
          />
        )}
        {selectedTab !== 'groups' &&
          (overview ? (
            <>
              {selectedTab === 'overview' && <MonthlyOverview {...overview} {...common} go={go} />}
              {selectedTab === 'budget' && (
                <BudgetPanel key={scope + month} {...common} setData={setData} notify={setNotice} />
              )}
              {selectedTab === 'savings' && (
                <SavingsPanel {...common} setData={setData} notify={setNotice} canDelete={false} />
              )}
              {selectedTab === 'settlements' && (
                <SettlementsPanel
                  {...common}
                  setData={setData}
                  notify={setNotice}
                  storageNamespace={user?.uid}
                />
              )}
            </>
          ) : (
            <p className="notice">
              O administrador precisa atualizar os dados compartilhados para disponibilizar o
              resumo.
            </p>
          ))}
        {selectedTab === 'comparison' && (
          <MonthlyComparisonPanel
            key={scope + month}
            {...common}
            workspace={(_, period) =>
              sharedMonthOverview(
                snapshot,
                period,
                ledgers.find((item) => item.month === period),
              )?.stats || { total: 0, paid: 0, pending: 0, categories: {} }
            }
          />
        )}
        {(selectedTab === 'overview' || selectedTab === 'expenses') && (
          <ExpenseList
            {...common}
            group={data.groups[0]}
            memberIds={members}
            expenses={expenses}
            visible={expenses.filter((item) => filter === 'all' || item.status === filter)}
            filter={filter}
            setFilter={setFilter}
            incomes={{}}
            edit={edit}
            newExpense={newExpense}
            copyFixed={copyFixed}
            canDelete={false}
          />
        )}
      </div>
      {draft && (
        <ExpenseDialog
          {...{ dialog, draft, setDraft, data, preview, previewError, error, saveExpense }}
          close={() => {
            if (!busy) setDraft(null);
          }}
          memberIds={draft.id ? members : active}
        />
      )}
      {recurring && (
        <RecurringExpensesDialog
          items={recurring}
          month={month}
          onClose={() => {
            if (!busy) setRecurring(null);
          }}
          onSave={async (entries) => {
            await mutate({ action: 'recurring', month, entries });
            setRecurring(null);
          }}
        />
      )}
    </>
  );
}
