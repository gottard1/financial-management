import { useFinanceData } from '../hooks/useFinanceData.js';
import { useSharedMemberships } from '../hooks/useSharedMemberships.js';
import { AppSidebar } from '../components/layout/AppSidebar.jsx';
import { WorkspaceSelector } from '../components/layout/WorkspaceSelector.jsx';
import { MonthlySummary } from '../features/overview/MonthlySummary.jsx';
import { OverviewPanel } from '../features/overview/OverviewPanel.jsx';
import { ExpenseList } from '../features/expenses/ExpenseList.jsx';
import { ExpenseDialog } from '../features/expenses/ExpenseDialog.jsx';
import { RecurringExpensesDialog } from '../features/expenses/RecurringExpensesDialog.jsx';
import {
  recurringCandidates,
  copyRecurringExpenses,
} from '../domain/expenses/recurringExpenses.js';
import React, { useState, useRef, useEffect } from 'react';
import { parseMoney, splitExpense } from '../domain/expenses/expenseCalculations.js';
import { calculateWorkspace } from '../domain/budget/workspaceCalculations.js';
import { sumRestrictedBenefits } from '../domain/income/calculateCompensation.js';
import { IncomePanel } from '../features/income/IncomePanel.jsx';
import { BudgetPanel } from '../features/budget/BudgetPanel.jsx';
import { SavingsPanel } from '../features/savings/SavingsPanel.jsx';
import { GroupsPanel } from '../features/groups/GroupsPanel.jsx';
import { ArchivedGroupHistory } from '../features/groups/ArchivedGroupHistory.jsx';
import { SettlementsPanel } from '../features/settlements/SettlementsPanel.jsx';
import { MonthlyComparisonPanel } from '../features/comparison/MonthlyComparisonPanel.jsx';
import { FinanceSyncStatus } from '../features/sync/FinanceSyncStatus.jsx';
import { activeGroupMembers } from '../domain/groups/groupMembers.js';
import { AuthScreen } from '../features/auth/AuthScreen.jsx';
import { useAuth } from '../features/auth/AuthProvider.jsx';
const monthNow = () => new Date().toLocaleDateString('sv-SE').slice(0, 7);
const GroupSharingPanel = React.lazy(() =>
  import('../features/groups/GroupSharingPanel.jsx').then((module) => ({
    default: module.GroupSharingPanel,
  })),
);
const SharedGroupView = React.lazy(() =>
  import('../features/groups/GroupSharingPanel.jsx').then((module) => ({
    default: module.SharedGroupView,
  })),
);
export function App() {
  const { user, loading, localMode } = useAuth();
  if (loading)
    return (
      <main className="auth-loading" role="status">
        Carregando seu acesso…
      </main>
    );
  if (!user && !localMode) return <AuthScreen />;
  const storageNamespace = user?.uid || 'local';
  return <FinanceApp key={storageNamespace} storageNamespace={storageNamespace} />;
}

function FinanceApp({ storageNamespace }) {
  const { user, localMode, signOut } = useAuth();
  const { groups: sharedGroups, error: sharingError } = useSharedMemberships(user, localMode);
  const {
    data,
    setData,
    error: storageError,
    blocked,
    exportJson,
    cloudEnabled,
    syncStatus,
    syncError,
    retrySync,
    useCloudVersion,
    commitData,
  } = useFinanceData(storageNamespace);
  const [month, setMonth] = useState(monthNow),
    [tab, setTab] = useState('overview'),
    [mode, setMode] = useState('individual'),
    [personId, setPerson] = useState(() => data.people[0].id),
    [groupId, setGroupId] = useState(() => data.groups.find((group) => !group.deleted)?.id || ''),
    [draft, setDraft] = useState(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [filter, setFilter] = useState('all');
  const dialog = useRef();
  const sharedGroup = mode === 'group' && sharedGroups.find((item) => item.id === groupId);
  const [recurringDraft, setRecurringDraft] = useState(null);
  const group =
    data.groups.find((item) => item.id === groupId) || data.groups.find((item) => !item.deleted);
  const archivedGroup = mode === 'group' && group?.deleted;
  const person = data.people.some((item) => item.id === personId) ? personId : data.people[0].id;
  const selectedGroupId = sharedGroup?.id || group?.id || sharedGroups[0]?.id || '';
  const selectedSharedGroup =
    mode === 'group' && sharedGroups.find((item) => item.id === selectedGroupId);
  const scope = mode === 'group' ? (group ? 'group:' + group.id : '') : 'person:' + person;
  const memberIds = mode === 'group' ? group?.memberIds || [] : [person];
  const activeMemberIds = mode === 'group' ? activeGroupMembers(group) : [person];
  const incomes = data.months[month] || {};
  const profiles = data.incomeConfigs[month] || {};
  const expenses = data.expenses.filter((e) => e.date.startsWith(month) && e.workspace === scope);
  const plan = data.plans[scope + '|' + month] || {};
  let stats,
    benefits,
    statsError = '';
  try {
    if (scope) {
      stats = calculateWorkspace(data, month, scope, incomes);
      benefits = sumRestrictedBenefits(memberIds.map((id) => profiles[id]));
    }
  } catch (err) {
    statsError = err.message;
  }
  useEffect(() => {
    if (draft) dialog.current?.showModal();
  }, [draft === null]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);
  useEffect(() => {
    if (personId !== person) setPerson(person);
  }, [personId, person]);
  function close() {
    setDraft(null);
    setError('');
  }
  function newExpense() {
    if (archivedGroup) {
      setError('Este grupo foi excluído e está disponível apenas para consulta.');
      return;
    }
    setError('');
    if (!scope) {
      setTab('groups');
      return;
    }
    setDraft({
      description: '',
      amount: '',
      category: 'Moradia',
      date: month + '-01',
      split: mode === 'group' ? 'proportional' : 'equal',
      participants: [...activeMemberIds],
      percentages: {},
      status: 'pending',
      payer: activeMemberIds.includes(person) ? person : activeMemberIds[0],
      fixed: false,
      fixedAmountType: 'fixed',
      workspace: scope,
    });
  }
  function saveExpense(e) {
    e.preventDefault();
    try {
      if (archivedGroup) throw new Error('Não é possível alterar despesas de um grupo excluído.');
      const item = {
        ...draft,
        ...(draft.installments
          ? {
              installments: {
                total: Number(draft.installments.total),
                current: Number(draft.installments.current),
              },
            }
          : {}),
        description: draft.description.trim(),
        amount: parseMoney(draft.amount),
        percentages: Object.fromEntries(
          Object.entries(draft.percentages || {}).map(([id, value]) => [id, Number(value)]),
        ),
      };
      if (!item.description || item.amount <= 0)
        throw Error('Informe uma descrição e um valor maior que zero.');
      if (!item.date.startsWith(month)) throw Error('A data deve pertencer ao mês selecionado.');
      splitExpense(item, incomes, memberIds);
      if (
        !draft.id &&
        (item.participants.some((id) => !activeMemberIds.includes(id)) ||
          !activeMemberIds.includes(item.payer))
      )
        throw new Error('Novas despesas devem usar apenas participantes ativos do grupo.');
      item.id = item.id || crypto.randomUUID();
      setData((d) => ({ ...d, expenses: [...d.expenses.filter((x) => x.id !== item.id), item] }));
      close();
      setNotice('Despesa salva. Os totais foram atualizados.');
    } catch (err) {
      setError(err.message);
    }
  }
  function edit(e) {
    setError('');
    setDraft({
      ...e,
      participants: [...e.participants],
      percentages: { ...e.percentages },
      amount: (e.amount / 100).toFixed(2).replace('.', ','),
    });
  }
  function exportData() {
    const url = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `financas-${month}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyFixed() {
    if (archivedGroup) {
      setError('Não é possível copiar contas para um grupo excluído.');
      return;
    }
    const items = recurringCandidates(data.expenses, scope, month).map((item) => ({
      ...item,
      unavailableReason:
        item.participants.some((id) => !activeMemberIds.includes(id)) ||
        !activeMemberIds.includes(item.payer)
          ? 'Inclui um participante removido. Cadastre uma nova despesa recorrente com os participantes atuais.'
          : '',
    }));
    if (!items.length) {
      setNotice('Nenhuma conta recorrente nova encontrada no mês anterior neste espaço.');
      return;
    }
    setRecurringDraft({ items, month, scope });
  }
  function saveRecurring(entries) {
    let count = 0;
    setData((current) => {
      const copies = copyRecurringExpenses(
        current.expenses,
        recurringDraft.scope,
        recurringDraft.month,
        entries,
        undefined,
        recurringDraft.scope.startsWith('group:')
          ? activeGroupMembers(
              current.groups.find((item) => `group:${item.id}` === recurringDraft.scope),
            )
          : undefined,
      );
      if (
        current.groups.some(
          (group) => group.deleted && `group:${group.id}` === recurringDraft.scope,
        )
      )
        throw new Error('Não é possível adicionar parcelas a um grupo excluído.');
      count = copies.length;
      return { ...current, expenses: [...current.expenses, ...copies] };
    });
    setRecurringDraft(null);
    setNotice(`${count} conta(s) recorrente(s) adicionada(s) como pendente(s).`);
  }
  let preview = null,
    previewError = '';
  try {
    if (draft && draft.amount)
      preview = splitExpense(
        {
          ...draft,
          amount: parseMoney(draft.amount),
          percentages: Object.fromEntries(
            Object.entries(draft.percentages || {}).map(([id, value]) => [id, Number(value)]),
          ),
        },
        incomes,
        memberIds,
      );
  } catch (err) {
    previewError = err.message;
  }
  const visible = expenses.filter((e) => filter === 'all' || e.status === filter);
  const go = (id) => {
    setTab(id);
    setError('');
  };
  if (syncStatus === 'loading')
    return (
      <main className="auth-loading" role="status">
        Carregando seus dados financeiros da nuvem…
      </main>
    );
  return (
    <div className="app-shell">
      <AppSidebar tab={tab} onNavigate={go} onExport={exportData} cloudEnabled={cloudEnabled} />
      <main className="main-content">
        <header className="app-page-header">
          <div>
            <p className="eyebrow">FINANÇAS PESSOAIS E EM GRUPO</p>
            <h1>
              {
                {
                  overview: 'Seu dinheiro, com direção.',
                  expenses: 'Cada gasto no seu lugar.',
                  budget: 'Um plano para cada real.',
                  savings: 'Dê forma aos seus planos.',
                  people: 'Entenda quanto fica com você.',
                  groups: 'Pessoas, grupos e planos.',
                  settlements: 'Repasses, sem perder o histórico.',
                  comparison: 'Cada mês conta uma história.',
                }[tab]
              }
            </h1>
            <p className="muted">Organize o presente. Abra espaço para o que importa.</p>
          </div>
          <label className="field reference-month">
            Mês de referência
            <input
              type="month"
              required
              min="2000-01"
              max="2099-12"
              value={month}
              onChange={(e) => {
                if (e.target.value) {
                  setMonth(e.target.value);
                  setError('');
                }
              }}
            />
          </label>
        </header>
        <div className="account-bar">
          <span>
            {localMode ? 'Modo local de desenvolvimento' : user?.email || 'Sessão autenticada'} ·
            {cloudEnabled
              ? 'Conta com sincronização financeira privada.'
              : 'Dados financeiros neste navegador.'}
          </span>
          <button
            className="button secondary"
            onClick={() => signOut().catch((err) => setError(err.message))}
          >
            {localMode ? 'Voltar ao login' : 'Sair'}
          </button>
        </div>
        <FinanceSyncStatus
          status={syncStatus}
          error={syncError}
          retry={retrySync}
          exportLocal={exportData}
          useCloud={() => {
            try {
              exportData();
              useCloudVersion();
              setError('');
            } catch (err) {
              setError(err.message);
            }
          }}
        />
        <div inert={blocked ? true : undefined}>
          <WorkspaceSelector
            {...{ mode, setMode, person, setPerson, setGroupId, tab }}
            groupId={selectedGroupId}
            people={data.people}
            groups={[...data.groups, ...sharedGroups]}
            onClearError={() => setError('')}
          />
          {mode === 'group' &&
            group &&
            !selectedSharedGroup &&
            tab !== 'people' &&
            tab !== 'groups' && (
              <nav className="group-subnav" aria-label="Seções do grupo">
                <button
                  className={'button ' + (tab === 'overview' ? 'primary' : 'secondary')}
                  onClick={() => go('overview')}
                >
                  Visão do grupo
                </button>
                <button
                  className={'button ' + (tab === 'settlements' ? 'primary' : 'secondary')}
                  onClick={() => go('settlements')}
                >
                  Repasses e comprovantes
                </button>
              </nav>
            )}
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button aria-label="Fechar aviso" onClick={() => setNotice('')}>
                ×
              </button>
            </div>
          )}
          {(error || storageError) && !draft && (
            <p role="alert" className="notice error">
              {error || storageError}
            </p>
          )}
          {sharingError && (
            <p role="alert" className="notice error">
              {sharingError}
            </p>
          )}
          {blocked && (
            <div className="notice error">
              Edição bloqueada para preservar seus dados. Exporte o backup e resolva o aviso de
              sincronização antes de continuar.
            </div>
          )}
          <div hidden={tab !== 'groups'}>
            {import.meta.env.VITE_GROUP_SHARING_ENABLED === 'true' ? (
              <React.Suspense fallback={<p role="status">Carregando compartilhamento…</p>}>
                <GroupSharingPanel data={data} notify={setNotice} syncBlocked={blocked} />
              </React.Suspense>
            ) : (
              <section className="panel">
                <h2>Convites e acesso ao grupo</h2>
                <p>
                  O compartilhamento aguarda ativação neste ambiente. Você já pode cadastrar
                  participantes pelo nome.
                </p>
              </section>
            )}
          </div>
          {tab === 'people' ? (
            <IncomePanel
              key={month + '|' + person}
              {...{ data, setData, month, person }}
              notify={setNotice}
            />
          ) : tab === 'groups' ? (
            <GroupsPanel
              {...{ data, setData, commitData }}
              notify={setNotice}
              onExport={exportData}
              onViewGroup={(id) => {
                setGroupId(id);
                setMode('group');
                setTab('overview');
              }}
            />
          ) : selectedSharedGroup ? (
            <React.Suspense fallback={<p role="status">Carregando grupo…</p>}>
              <SharedGroupView
                key={selectedSharedGroup.id}
                membership={selectedSharedGroup.membership}
                referenceMonth={month}
              />
            </React.Suspense>
          ) : mode === 'group' && !group ? (
            <section className="panel empty">
              <h2>Crie seu primeiro grupo</h2>
              <p>
                Reúna pessoas para organizar despesas de uma casa, viagem ou outro plano
                compartilhado.
              </p>
              <button className="button primary" onClick={() => go('groups')}>
                Criar grupo
              </button>
            </section>
          ) : archivedGroup ? (
            <ArchivedGroupHistory {...{ data, group, month, stats, tab }} error={statsError} />
          ) : (
            <>
              {statsError && (
                <div className="notice error" role="alert">
                  <p>{statsError} Edite as rendas ou a forma de divisão das despesas.</p>
                </div>
              )}
              {stats && tab === 'overview' && <MonthlySummary {...{ stats, mode, benefits }} />}
              {tab === 'comparison' && (
                <MonthlyComparisonPanel
                  key={scope + '|' + month}
                  {...{ data, scope, month, mode }}
                />
              )}
              {tab === 'budget' && stats && (
                <BudgetPanel
                  key={scope + month}
                  {...{ data, setData, scope, month, stats }}
                  notify={setNotice}
                />
              )}
              {tab === 'savings' && stats && (
                <SavingsPanel
                  key={scope + month}
                  {...{ data, setData, scope, month, stats }}
                  notify={setNotice}
                />
              )}
              {tab === 'settlements' && stats && mode === 'group' && (
                <SettlementsPanel
                  key={scope + month}
                  {...{ data, setData, scope, month, stats, storageNamespace }}
                  notify={setNotice}
                />
              )}
              {tab === 'settlements' && mode !== 'group' && (
                <section className="panel empty">
                  <h2>Selecione um grupo</h2>
                  <p>Os repasses registram devoluções entre integrantes de um grupo.</p>
                  <button className="button primary" onClick={() => setMode('group')}>
                    Escolher grupo
                  </button>
                </section>
              )}
              {tab === 'overview' && stats && (
                <OverviewPanel {...{ stats, mode, plan, data, go, scope }} />
              )}
              {(tab === 'expenses' || tab === 'overview') && (
                <ExpenseList
                  {...{
                    mode,
                    data,
                    person,
                    group,
                    memberIds,
                    expenses,
                    copyFixed,
                    newExpense,
                    filter,
                    setFilter,
                    visible,
                    incomes,
                    edit,
                    setData,
                  }}
                />
              )}
            </>
          )}
          <footer className="muted">
            Contas & Planos · Individual ou em grupo.{' '}
            <span>
              {cloudEnabled ? 'Sincronização por conta' : 'Versão local'} · valores em reais ·{' '}
              <button className="text-button" onClick={exportData}>
                Exportar backup
              </button>
            </span>
          </footer>
        </div>
      </main>
      {recurringDraft && !blocked && !archivedGroup && (
        <RecurringExpensesDialog
          items={recurringDraft.items}
          month={recurringDraft.month}
          onClose={() => setRecurringDraft(null)}
          onSave={saveRecurring}
        />
      )}
      {draft && !blocked && !archivedGroup && (
        <ExpenseDialog
          {...{
            dialog,
            close,
            saveExpense,
            draft,
            setDraft,
            data,
            preview,
            previewError,
            error,
          }}
          memberIds={draft.id ? memberIds : activeMemberIds}
        />
      )}
    </div>
  );
}
