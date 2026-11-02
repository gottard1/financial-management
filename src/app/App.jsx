import { useOwnedGroupSettlements } from '../hooks/useOwnedGroupSettlements.js';
import { mergeSharedSettlements } from '../domain/settlements/sharedSettlements.js';
import { saveSharedSettlement } from '../infrastructure/firebase/sharedSettlementRepository.js';
import { useFinanceData } from '../hooks/useFinanceData.js';
import { applyGoogleAccountName } from '../domain/groups/accountIdentity.js';
import { exportFinanceData } from '../infrastructure/storage/localFinanceRepository.js';
import { useSharedMemberships } from '../hooks/useSharedMemberships.js';
import { AppSidebar } from '../components/layout/AppSidebar.jsx';
import { WorkspaceNavigation } from '../components/layout/WorkspaceNavigation.jsx';
import { MonthlySummary } from '../features/overview/MonthlySummary.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { usePaymentInbox } from '../hooks/usePaymentInbox.js';
import { sendPaymentCommand } from '../infrastructure/firebase/paymentReportRepository.js';
import { createPaymentReport, resolvePaymentReport } from '../domain/settlements/paymentReports.js';
import {
  NotificationsPanel,
  PaymentRequests,
} from '../features/notifications/NotificationsPanel.jsx';
import { ReferenceMonth } from '../components/layout/ReferenceMonth.jsx';
import { MonthlyOverview } from '../features/overview/MonthlyOverview.jsx';
import { ExpenseList } from '../features/expenses/ExpenseList.jsx';
import { ExpenseDialog } from '../features/expenses/ExpenseDialog.jsx';
import { RecurringExpensesDialog } from '../features/expenses/RecurringExpensesDialog.jsx';
import {
  recurringCandidates,
  copyRecurringExpenses,
} from '../domain/expenses/recurringExpenses.js';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { parseMoney, splitExpense } from '../domain/expenses/expenseCalculations.js';
import { calculateWorkspace } from '../domain/budget/workspaceCalculations.js';
import { sumRestrictedBenefits } from '../domain/income/calculateCompensation.js';
import { ProfilePanel } from '../features/profile/ProfilePanel.jsx';
import { BudgetPanel } from '../features/budget/BudgetPanel.jsx';
import { SavingsPanel } from '../features/savings/SavingsPanel.jsx';
import { GroupsPanel } from '../features/groups/GroupsPanel.jsx';
import { ArchivedGroupHistory } from '../features/groups/ArchivedGroupHistory.jsx';
import { SettlementsPanel } from '../features/settlements/SettlementsPanel.jsx';
import { MonthlyComparisonPanel } from '../features/comparison/MonthlyComparisonPanel.jsx';
import { FinanceSyncStatus } from '../features/sync/FinanceSyncStatus.jsx';
import { activeGroupMembers } from '../domain/groups/groupMembers.js';
import { activePeople } from '../domain/groups/managedPeople.js';
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
    data: privateData,
    setData,
    error: storageError,
    blocked,
    exportJson,
    cloudEnabled,
    syncStatus,
    syncError,
    cloudRevision,
    getCloudRevision,
    retrySync,
    useCloudVersion,
    commitData,
  } = useFinanceData(storageNamespace);
  const {
    groups: ownedSharedGroups,
    error: settlementSyncError,
    ready: settlementsReady,
  } = useOwnedGroupSettlements(user, localMode);
  const inbox = usePaymentInbox(user, localMode, [
    ...ownedSharedGroups
      .filter((item) =>
        privateData.groups.some((group) => group.id === item.localId && !group.deleted),
      )
      .map((item) => item.id),
    ...sharedGroups.map((item) => item.id),
  ]);
  const data = useMemo(
    () => mergeSharedSettlements(privateData, ownedSharedGroups),
    [privateData, ownedSharedGroups],
  );
  const receiptsLoading = Boolean(
    user &&
    !localMode &&
    import.meta.env.VITE_GROUP_SHARING_ENABLED === 'true' &&
    !settlementsReady,
  );
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
  const ownedSharedGroup = ownedSharedGroups.find((item) => item.localId === group?.id);
  const archivedGroup = mode === 'group' && group?.deleted;
  const selectablePeople = activePeople(data);
  const person = selectablePeople.some((item) => item.id === personId)
    ? personId
    : selectablePeople[0].id;
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
  useEffect(() => {
    if (!user || localMode || blocked || (cloudEnabled && syncStatus !== 'saved')) return;
    if (applyGoogleAccountName(privateData, user) === privateData) return;
    try {
      setData((current) => applyGoogleAccountName(current, user));
    } catch (err) {
      setError(err.message);
    }
  }, [privateData, user, localMode, blocked, cloudEnabled, syncStatus]);
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
    const url = URL.createObjectURL(
      new Blob([blocked ? exportJson() : exportFinanceData(data)], { type: 'application/json' }),
    );
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
  const financialPage = !['people', 'groups', 'account', 'notifications'].includes(tab);
  const titles = {
    overview: 'Clareza para o seu mês.',
    expenses: 'Despesas',
    budget: 'Orçamento',
    savings: 'Metas e reservas',
    people: 'Perfil e renda',
    groups: 'Pessoas e grupos',
    settlements: 'Acertos',
    comparison: 'Análises',
    account: 'Conta e dados',
    notifications: 'Notificações',
    members: 'Participantes e convites',
    settings: 'Configurações do grupo',
  };
  const pageTitle = titles[tab] || 'Meu financeiro';
  const pageDescription =
    {
      overview: 'Suas contas em ordem. Seus planos em movimento.',
      expenses: 'Cada conta no seu lugar, com pagamentos separados.',
      people: 'Seus dados pessoais, renda e benefícios ficam privados.',
      notifications: 'O que precisa da sua atenção em todos os seus grupos.',
      groups: 'Crie grupos com uma ou mais pessoas e gerencie seus acessos.',
      account: 'Acesso, sincronização e cópia dos seus registros.',
    }[tab] || 'Organize seus recursos e acompanhe seus planos.';
  const localReports = (data.paymentReports || [])
    .filter((item) =>
      data.groups.some((group) => 'group:' + group.id === item.scope && !group.deleted),
    )
    .map((item) => ({
      ...item,
      fromName: data.people.find((person) => person.id === item.from)?.name,
      toName: data.people.find((person) => person.id === item.to)?.name,
      groupName: data.groups.find((group) => 'group:' + group.id === item.scope)?.name,
      canRespond:
        item.to === data.groups.find((group) => 'group:' + group.id === item.scope)?.adminPersonId,
    }));
  const allReports = [...localReports, ...inbox.reports];
  const currentReports = allReports.filter((item) =>
    selectedSharedGroup
      ? item.groupId === selectedSharedGroup.id && item.month === month
      : item.scope === scope && item.month === month,
  );
  const myReports = allReports.filter((item) => {
    if (user && !localMode) return item.fromUid === user.uid || item.toUid === user.uid;
    const actor = data.groups.find((group) => 'group:' + group.id === item.scope)?.adminPersonId;
    return item.from === actor || item.to === actor;
  });
  const notificationCount =
    myReports.filter(
      (item) =>
        item.status === 'pending' &&
        (user && !localMode
          ? item.toUid === user.uid
          : item.to ===
            data.groups.find((group) => 'group:' + group.id === item.scope)?.adminPersonId),
    ).length + inbox.invites.length;
  async function reportPayment(transfer) {
    const remoteId = selectedSharedGroup?.id || ownedSharedGroup?.id;
    if (user && !localMode && !remoteId)
      throw new Error(
        'Compartilhe o grupo e vincule as contas dos participantes antes de informar pagamentos.',
      );
    const date = new Date().toLocaleDateString('sv-SE');
    if (remoteId)
      await sendPaymentCommand(remoteId, { action: 'report-payment', month, transfer, date });
    else
      await commitData((current) => {
        const localGroup = current.groups.find(
          (item) => 'group:' + item.id === scope && !item.deleted,
        );
        if (!localGroup) throw new Error('Grupo indisponível.');
        const report = createPaymentReport(
          { id: crypto.randomUUID(), scope, month, transfer, date },
          localGroup.adminPersonId,
          calculateWorkspace(current, month, scope, current.months[month] || {}),
          localGroup.memberIds,
          current.paymentReports,
        );
        return { ...current, paymentReports: [...(current.paymentReports || []), report] };
      });
    setNotice('Pagamento informado. Quem recebe precisa confirmar para concluir o acerto.');
  }
  async function respondToReport(report, action) {
    if (report.groupId)
      await sendPaymentCommand(report.groupId, {
        action: action === 'confirm' ? 'confirm-payment' : 'reject-payment',
        reportId: report.id,
      });
    else
      await commitData((current) => {
        const original = (current.paymentReports || []).find((item) => item.id === report.id);
        const localGroup = current.groups.find(
          (item) => 'group:' + item.id === report.scope && !item.deleted,
        );
        if (!original || !localGroup) throw new Error('Solicitação indisponível.');
        const resolved = resolvePaymentReport(
          original,
          localGroup.adminPersonId,
          action,
          calculateWorkspace(
            current,
            report.month,
            report.scope,
            current.months[report.month] || {},
          ),
          localGroup.memberIds,
        );
        return {
          ...current,
          paymentReports: current.paymentReports.map((item) =>
            item.id === report.id ? resolved : item,
          ),
          settlements:
            action === 'confirm'
              ? [
                  ...current.settlements,
                  {
                    id: report.id,
                    scope: report.scope,
                    from: report.from,
                    to: report.to,
                    amount: report.amount,
                    date: report.date,
                    referenceMonth: report.month,
                    note: '',
                    status: 'confirmed',
                  },
                ]
              : current.settlements,
        };
      });
    setNotice(
      action === 'confirm'
        ? 'Recebimento confirmado. Acerto atualizado.'
        : 'Recebimento não confirmado. A dívida permanece em aberto.',
    );
  }
  if (syncStatus === 'loading')
    return (
      <main className="auth-loading" role="status">
        Carregando seus dados financeiros da nuvem…
      </main>
    );
  return (
    <div className="app-shell">
      <AppSidebar
        {...{ tab, mode }}
        onNavigate={go}
        groupId={selectedGroupId}
        groups={[...data.groups, ...sharedGroups]}
        onSelectSpace={(nextMode, id) => {
          setMode(nextMode);
          if (id) setGroupId(id);
          go(nextMode === 'group' ? 'settlements' : 'overview');
        }}
        userName={
          data.people.find((item) => item.accountUid === user?.uid)?.name ||
          user?.displayName ||
          data.people[0]?.name
        }
        photoURL={user?.photoURL}
        notificationCount={notificationCount}
      />
      <main className="main-content">
        <div className="app-topbar">
          <span>
            {financialPage
              ? mode === 'group'
                ? 'Meus grupos / ' + (selectedSharedGroup?.name || group?.name || 'Novo grupo')
                : 'Individual / Meu financeiro'
              : 'Minha conta / ' + pageTitle}
          </span>
          <div className="app-top-actions">
            {financialPage && <ReferenceMonth month={month} onChange={setMonth} />}
            <button
              type="button"
              className="notification-trigger"
              aria-label={'Notificações: ' + notificationCount + ' pendências'}
              onClick={() => go('notifications')}
            >
              <Icon name="bell" />
              <span className="notification-trigger-label">Notificações</span>
              {notificationCount > 0 && (
                <span className="notification-count">{notificationCount}</span>
              )}
            </button>
          </div>
        </div>
        <header className="app-page-header redesign-page-header">
          <div>
            <p className="eyebrow">
              {financialPage
                ? mode === 'group'
                  ? 'Espaço compartilhado'
                  : 'Espaço individual · privado'
                : 'Minha conta'}
            </p>
            <h1>
              {financialPage && mode === 'group'
                ? selectedSharedGroup?.name || group?.name || pageTitle
                : pageTitle}
            </h1>
            <p className="muted">
              {financialPage && mode === 'group'
                ? 'Contas organizadas. Acertos transparentes.'
                : pageDescription}
            </p>
          </div>
          {financialPage && mode === 'individual' && <span className="pill">Só você</span>}
        </header>
        {financialPage && (
          <WorkspaceNavigation
            mode={mode}
            tab={tab}
            onNavigate={go}
            administrator={mode === 'group' && !selectedSharedGroup}
          />
        )}
        {(tab === 'account' || ['conflict', 'offline'].includes(syncStatus) || syncError) && (
          <div className="app-session-bar">
            <div className="account-bar">
              <span>{localMode ? 'Modo local de desenvolvimento' : user?.email}</span>
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
                } catch (err) {
                  setError(err.message);
                }
              }}
            />
          </div>
        )}
        <div className="app-page-content" inert={blocked ? true : undefined}>
          {financialPage && mode === 'individual' && localMode && selectablePeople.length > 1 && (
            <label className="field local-person-picker">
              Pessoa no modo local
              <select value={person} onChange={(event) => setPerson(event.target.value)}>
                {selectablePeople.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
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
          {(sharingError || settlementSyncError || inbox.error) && (
            <p role="alert" className="notice error">
              {sharingError || settlementSyncError || inbox.error}
            </p>
          )}
          {blocked && (
            <div className="notice error">
              Edição bloqueada para preservar seus dados. Exporte o backup e resolva o aviso de
              sincronização antes de continuar.
            </div>
          )}
          <div hidden={tab !== 'groups' && !(tab === 'members' && !selectedSharedGroup)}>
            {import.meta.env.VITE_GROUP_SHARING_ENABLED === 'true' ? (
              <React.Suspense fallback={<p role="status">Carregando compartilhamento…</p>}>
                <GroupSharingPanel
                  selectedGroupId={tab === 'members' ? group?.id : undefined}
                  data={privateData}
                  commitData={commitData}
                  notify={setNotice}
                  syncBlocked={blocked || !cloudEnabled || syncStatus !== 'saved'}
                  financeRevision={cloudRevision}
                  getFinanceRevision={getCloudRevision}
                />
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
          {tab === 'account' ? (
            <section className="panel">
              <h2>Backup e comprovantes</h2>
              <p>
                Exporte seus registros financeiros em JSON. Arquivos de comprovantes permanecem
                neste navegador e não são incluídos no backup.
              </p>
              <div className="form-actions">
                <button type="button" className="button secondary" onClick={exportData}>
                  Exportar backup
                </button>
              </div>
              <p className="hint">
                A restauração de backups pela interface ainda não está disponível.
              </p>
            </section>
          ) : tab === 'notifications' ? (
            <NotificationsPanel
              reports={myReports}
              invites={inbox.invites}
              onRespond={respondToReport}
              userUid={localMode ? undefined : user?.uid}
              actorId={person}
              notify={setNotice}
            />
          ) : tab === 'settings' && !selectedSharedGroup && mode === 'group' ? (
            <GroupsPanel
              data={data}
              {...{ setData, commitData }}
              selectedGroupId={group?.id}
              notify={setNotice}
              onExport={exportData}
              onViewGroup={(id) => {
                setGroupId(id);
                setMode('group');
                go('overview');
              }}
            />
          ) : tab === 'members' && !selectedSharedGroup ? (
            <section className="panel">
              <h2>Participantes do grupo</h2>
              <ul className="member-directory">
                {(group?.memberIds || []).map((id) => (
                  <li key={id}>
                    <span className="avatar">
                      {data.people.find((item) => item.id === id)?.name.slice(0, 1)}
                    </span>
                    <div>
                      <strong>{data.people.find((item) => item.id === id)?.name}</strong>
                      <small>
                        {id === group?.adminPersonId
                          ? 'Administrador'
                          : group?.removedMemberIds?.includes(id)
                            ? 'Removido · histórico preservado'
                            : 'Participante'}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="form-actions">
                <button type="button" className="button secondary" onClick={() => go('settings')}>
                  Gerenciar participantes
                </button>
              </div>
            </section>
          ) : tab === 'people' ? (
            <ProfilePanel
              {...{ data: privateData, setData, month, user }}
              onMonthChange={setMonth}
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
                tab={tab}
                onNavigate={go}
                paymentReports={currentReports}
                onReport={reportPayment}
                onRespond={respondToReport}
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
                <>
                  <MonthlySummary stats={stats} mode={mode} receiverId={group?.adminPersonId} />
                  <PaymentRequests
                    reports={currentReports.filter((item) => item.status === 'pending')}
                    onRespond={respondToReport}
                    actorId={group?.adminPersonId}
                    userUid={localMode ? undefined : user?.uid}
                    compact
                  />
                </>
              )}
              {tab === 'settlements' &&
                stats &&
                mode === 'group' &&
                (receiptsLoading ? (
                  <p role="status">Carregando recebimentos compartilhados…</p>
                ) : (
                  <SettlementsPanel
                    key={scope + month}
                    {...{ data, setData, scope, month, stats, storageNamespace }}
                    notify={setNotice}
                    receiverId={group?.adminPersonId}
                    receiverUid={user?.uid}
                    onReport={reportPayment}
                    pendingReports={currentReports.filter((item) => item.status === 'pending')}
                    onSharedReceive={
                      ownedSharedGroup
                        ? (record) =>
                            saveSharedSettlement(ownedSharedGroup.id, {
                              month,
                              transfer: { from: record.from, to: record.to, amount: record.amount },
                              id: record.id,
                              date: record.date,
                            })
                        : undefined
                    }
                    onSharedUndo={
                      ownedSharedGroup
                        ? (voidId) => saveSharedSettlement(ownedSharedGroup.id, { month, voidId })
                        : undefined
                    }
                  />
                ))}
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
                <MonthlyOverview
                  {...{ stats, mode, benefits, plan, data, go, scope, month }}
                  commitData={receiptsLoading ? undefined : commitData}
                  onReport={reportPayment}
                  pendingReports={currentReports.filter((item) => item.status === 'pending')}
                  receiverId={group?.adminPersonId}
                  receiverUid={user?.uid}
                  onSharedReceive={
                    ownedSharedGroup
                      ? (transfer, id) =>
                          saveSharedSettlement(ownedSharedGroup.id, {
                            month,
                            transfer,
                            id,
                            date: new Date().toLocaleDateString('sv-SE'),
                          })
                      : undefined
                  }
                  onSharedUndo={
                    ownedSharedGroup
                      ? (voidId) => saveSharedSettlement(ownedSharedGroup.id, { month, voidId })
                      : undefined
                  }
                />
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
