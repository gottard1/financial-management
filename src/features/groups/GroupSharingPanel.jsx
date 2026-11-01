import { prepareEmailInvitation } from '../../domain/groups/emailInvitation.js';
import { lookupInviteAccount } from '../../infrastructure/firebase/inviteAccountLookup.js';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import {
  normalizeInviteEmail,
  projectSharedGroup,
  invitableGroupMembers,
} from '../../domain/groups/groupSharing.js';
import { stableJson } from '../../domain/budget/financeCloudCodec.js';
import {
  acceptGroupInvite,
  cancelGroupInvite,
  publishGroup,
  saveGroupInvite,
  sharedGroupId,
  watchSharedGroup,
  watchSharing,
} from '../../infrastructure/firebase/groupSharingRepository.js';

import { watchSettlementMonths } from '../../infrastructure/firebase/sharedSettlementRepository.js';
import { SharedGroupWorkspace } from './SharedGroupWorkspace.jsx';

const sharingEnabled = import.meta.env.VITE_GROUP_SHARING_ENABLED === 'true';

export function SharedGroupView({ membership, referenceMonth, tab, onNavigate }) {
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [ledgers, setLedgers] = useState([]);
  const [error, setError] = useState('');
  const [localMonth, setMonth] = useState(() => new Date().toLocaleDateString('sv-SE').slice(0, 7));
  const month = referenceMonth || localMonth;
  useEffect(() => {
    setError('');
    setGroup(null);
    setLedgers([]);
    const stopGroup = watchSharedGroup(membership.groupId, setGroup, () =>
      setError('Não foi possível carregar o grupo compartilhado.'),
    );
    const stopReceipts = watchSettlementMonths(membership.groupId, setLedgers, () =>
      setError('Não foi possível carregar os recebimentos. Confira as regras do Firestore.'),
    );
    return () => {
      stopGroup();
      stopReceipts();
    };
  }, [membership.groupId]);
  if (error)
    return (
      <p className="notice error" role="alert">
        {error}
      </p>
    );
  if (!group) return <p role="status">Carregando grupo…</p>;
  return (
    <>
      {!referenceMonth && tab !== 'groups' && (
        <label className="field">
          Mês
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
      )}
      <SharedGroupWorkspace
        {...{ group, membership, month, ledgers, user, tab, onNavigate }}
        onSaved={(result) =>
          setGroup((current) =>
            !current || current.revision <= result.revision ? { ...current, ...result } : current,
          )
        }
      />
    </>
  );
}
export function GroupSharingPanel({
  data,
  commitData,
  notify,
  syncBlocked = false,
  financeRevision,
  getFinanceRevision,
}) {
  const { user, localMode } = useAuth();
  const [owned, setOwned] = useState([]);
  const [sent, setSent] = useState([]);
  const [received, setReceived] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [groupId, setGroupId] = useState(() => data.groups.find((item) => !item.deleted)?.id || '');
  const [personId, setPersonId] = useState('');
  const [email, setEmail] = useState('');
  const [lookup, setLookup] = useState(null);
  const [inviteName, setInviteName] = useState('');
  const [editingInvite, setEditingInvite] = useState(null);
  const sharingOperation = useRef(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState('manage');
  const ownedRef = useRef(owned);
  ownedRef.current = owned;
  const inviteForm = useRef();
  const group = data.groups.find((item) => item.id === groupId);
  const invitees = invitableGroupMembers(group);
  const selectedInvitee = invitees.includes(personId) ? personId : '';
  const pendingReceived = received.filter((item) => item.status === 'pending');
  const pendingSent = sent.filter((item) => item.status === 'pending');
  const fail = () =>
    setError(
      'Não foi possível acessar o compartilhamento. Confira a conexão e a ativação do Firestore e das regras de acesso.',
    );
  useEffect(() => {
    if (!sharingEnabled || !user || localMode) return undefined;
    const stops = [
      watchSharing(
        'sharedGroups',
        'adminUid',
        user.uid,
        (groups) => setOwned(groups.filter((group) => !group.deleted)),
        fail,
      ),
      watchSharing('groupInvites', 'adminUid', user.uid, setSent, fail),
      watchSharing('groupMemberships', 'uid', user.uid, setMemberships, fail),
    ];
    if (user.emailVerified && user.email)
      stops.push(
        watchSharing('groupInvites', 'email', user.email.toLowerCase(), setReceived, fail),
      );
    return () => stops.forEach((stop) => stop());
  }, [user?.uid, localMode, user?.emailVerified]);

  // Reconcile confirmed private data even when the owned groups arrive after the initial load.
  useEffect(() => {
    if (!sharingEnabled || !user || localMode || syncBlocked || !financeRevision) return undefined;
    const timer = setTimeout(async () => {
      if (sharingOperation.current) return;
      try {
        for (const shared of ownedRef.current) {
          if (
            !(shared.financeRevision > financeRevision) &&
            data.groups.some((item) => !item.deleted && item.id === shared.snapshot.id) &&
            stableJson(projectSharedGroup(data, shared.snapshot.id)) !== stableJson(shared.snapshot)
          )
            await publishGroup(data, shared.snapshot.id, shared.revision, financeRevision);
        }
      } catch (err) {
        setError(err.message);
        notify?.(
          'Não foi possível atualizar o grupo compartilhado. Abra Pessoas e grupos para tentar novamente.',
        );
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [data, owned, user?.uid, localMode, syncBlocked, busy, financeRevision]);

  async function run(operation) {
    if (sharingOperation.current) return;
    sharingOperation.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (err) {
      setError(
        err.code
          ? 'Não foi possível concluir. Confira sua conexão e as regras do Firestore.'
          : err.message,
      );
    } finally {
      sharingOperation.current = false;
      setBusy(false);
    }
  }
  async function findAccount() {
    await run(async () => {
      if (!group?.adminPersonId || group.deleted)
        throw new Error('Selecione um grupo ativo e identifique quem é você nele.');
      const normalized = normalizeInviteEmail(email);
      if (normalized === user.email.toLowerCase())
        throw new Error('Sua conta já administra este grupo. Informe outro e-mail.');
      const id = sharedGroupId(user.uid, group.id);
      const existingInvite = sent.find(
        (item) => item.groupId === id && item.email === normalized && item.status !== 'revoked',
      );
      if (existingInvite?.status === 'accepted')
        throw new Error('Esta conta já participa do grupo.');
      const current = ownedRef.current.find((item) => item.id === id);
      await publishGroup(data, group.id, current?.revision ?? null, financeRevision);
      const result = await lookupInviteAccount(id, normalized);
      setLookup({ ...result, email: normalized, groupId: group.id });
      setInviteName(result.name || '');
      setPersonId(
        editingInvite?.personId ||
          existingInvite?.personId ||
          invitees.find(
            (id) => data.people.find((person) => person.id === id)?.inviteEmail === normalized,
          ) ||
          '',
      );
    });
  }
  async function invite(event) {
    event.preventDefault();
    await run(async () => {
      const normalized = normalizeInviteEmail(email);
      if (!group || lookup?.email !== normalized || lookup?.groupId !== group.id)
        throw new Error('Consulte este e-mail antes de enviar o convite.');
      const id = sharedGroupId(user.uid, group.id);
      if (
        editingInvite &&
        !sent.some((item) => item.id === editingInvite.id && item.status === 'pending')
      )
        throw new Error(
          'Este convite não está mais pendente. Atualize a página antes de continuar.',
        );
      const previousInvite = sent.find(
        (item) => item.groupId === id && item.email === normalized && item.status !== 'revoked',
      );
      if (previousInvite?.status === 'accepted')
        throw new Error('Esta conta já participa do grupo.');
      if (personId && previousInvite && previousInvite.personId !== personId)
        throw new Error(
          'Este e-mail já tem convite para outro participante deste grupo. Cancele o convite anterior antes de alterar o vínculo.',
        );
      const newPersonId = crypto.randomUUID();
      let prepared;
      const next = await commitData((current) => {
        prepared = prepareEmailInvitation(current, {
          groupId: group.id,
          email: normalized,
          name: inviteName,
          personId: personId || previousInvite?.personId,
          newPersonId,
          previousEmail: editingInvite?.email,
        });
        return prepared.data;
      });
      const current = ownedRef.current.find((item) => item.id === id);
      await publishGroup(next, group.id, current?.revision ?? null, getFinanceRevision?.());
      await saveGroupInvite(id, prepared.personId, normalized, prepared.personName, group.name);
      setEmail('');
      setLookup(null);
      setInviteName('');
      setPersonId('');
      setEditingInvite(null);
      notify?.(
        'Convite criado. O nome e o histórico do participante serão mantidos quando a pessoa aceitar com Google.',
      );
    });
  }
  if (!user || localMode)
    return (
      <section className="panel">
        <h2>Convites e acesso ao grupo</h2>
        <p>
          Entre com uma conta para convidar participantes. O cadastro apenas pelo nome continua
          disponível.
        </p>
      </section>
    );
  if (!sharingEnabled)
    return (
      <section className="panel">
        <h2>Convites e acesso ao grupo</h2>
        <p>
          O compartilhamento aguarda ativação neste ambiente. Você já pode cadastrar participantes
          pelo nome.
        </p>
      </section>
    );
  return (
    <section className="sharing-panel" aria-labelledby="sharing-title">
      <header className="panel sharing-header">
        <p className="eyebrow">PARTICIPAÇÃO E ACESSO</p>
        <h2 id="sharing-title">Convites e acesso ao grupo</h2>
        <p className="muted">
          Informe o e-mail da pessoa. Você pode convidar quem já tem conta ou cadastrar um nome
          provisório. O acesso é liberado após entrar com Google e aceitar o convite no aplicativo.
        </p>
        <nav className="sharing-navigation" aria-label="Seções de convites e acesso">
          <button
            type="button"
            className={section === 'manage' ? 'selected' : ''}
            aria-pressed={section === 'manage'}
            onClick={() => setSection('manage')}
          >
            <span>Convidar e gerenciar</span>
            <span className="pill">{pendingSent.length}</span>
          </button>
          <button
            type="button"
            className={section === 'received' ? 'selected' : ''}
            aria-pressed={section === 'received'}
            onClick={() => setSection('received')}
          >
            <span>Convites recebidos</span>
            <span className="pill">{pendingReceived.length}</span>
          </button>
          <button
            type="button"
            className={section === 'groups' ? 'selected' : ''}
            aria-pressed={section === 'groups'}
            onClick={() => setSection('groups')}
          >
            <span>Grupos compartilhados</span>
            <span className="pill">{memberships.length}</span>
          </button>
        </nav>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <section
        className="panel"
        hidden={section !== 'manage'}
        aria-labelledby="invite-create-title"
      >
        <div className="sharing-section-heading">
          <div>
            <p className="eyebrow">ADMINISTRADOR</p>
            <h3 id="invite-create-title">Convidar um participante</h3>
          </div>
        </div>
        <p className="muted">
          Comece pelo e-mail. O nome no grupo pode ser diferente do nome do perfil da pessoa.
        </p>
        {!data.groups.length && (
          <p className="notice">
            Cadastre as pessoas e crie um grupo abaixo para começar a convidar.
          </p>
        )}
        <form
          ref={inviteForm}
          onSubmit={(event) => {
            if (!lookup) {
              event.preventDefault();
              findAccount();
            } else invite(event);
          }}
          className="sharing-invite-form"
        >
          <label className="field">
            Grupo que você administra
            <select
              required
              disabled={busy || !data.groups.some((item) => !item.deleted)}
              value={groupId}
              onChange={(event) => {
                setGroupId(event.target.value);
                setPersonId('');
                setEmail('');
                setLookup(null);
                setInviteName('');
                setEditingInvite(null);
              }}
            >
              <option value="">Selecione um grupo</option>
              {data.groups
                .filter((item) => !item.deleted)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          {group && (
            <p className="hint">
              {group.adminPersonId ? (
                <>
                  Sua conta administra este grupo como{' '}
                  <strong>
                    {data.people.find((person) => person.id === group.adminPersonId)?.name}
                  </strong>
                  . Esse participante já tem acesso e não precisa de convite. Se o nome estiver
                  incorreto, edite o grupo abaixo e corrija “Quem é você neste grupo?”.
                </>
              ) : (
                <>
                  Edite o grupo abaixo e escolha seu nome em “Quem é você neste grupo?” antes de
                  convidar.
                </>
              )}
            </p>
          )}
          <label className="field">
            E-mail da pessoa
            <input
              required
              type="email"
              maxLength={254}
              value={email}
              disabled={busy}
              onChange={(event) => {
                setEmail(event.target.value);
                setLookup(null);
                setInviteName('');
                setPersonId('');
              }}
            />
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !group?.adminPersonId || !email}
            onClick={findAccount}
          >
            {busy ? 'Aguarde…' : 'Consultar e-mail'}
          </button>
          {lookup && (
            <>
              <p className="notice">
                {lookup.found
                  ? 'Conta encontrada. Confira o nome que será usado neste grupo.'
                  : 'Esta pessoa ainda não tem uma conta Google cadastrada no site. Informe como ela será chamada neste grupo.'}
              </p>
              <label className="field">
                Nome no grupo
                <input
                  required={!selectedInvitee}
                  maxLength={60}
                  value={
                    selectedInvitee
                      ? data.people.find((person) => person.id === selectedInvitee)?.name ||
                        inviteName
                      : inviteName
                  }
                  disabled={busy || Boolean(selectedInvitee)}
                  onChange={(event) => setInviteName(event.target.value)}
                />
                <small>
                  Este nome será mantido no grupo após o aceite. O perfil pessoal continua
                  independente.
                </small>
              </label>
              {invitees.length > 0 && (
                <label className="field">
                  Já existe um cadastro desta pessoa no grupo? (opcional)
                  <select
                    value={selectedInvitee}
                    disabled={busy || Boolean(editingInvite)}
                    onChange={(event) => setPersonId(event.target.value)}
                  >
                    <option value="">Criar participante com o nome acima</option>
                    {invitees.map((id) => (
                      <option key={id} value={id}>
                        {data.people.find((person) => person.id === id)?.name}
                      </option>
                    ))}
                  </select>
                  <small>
                    Escolha um cadastro existente para preservar todas as despesas e o nome dele.
                  </small>
                </label>
              )}
              <div className="form-actions">
                {editingInvite && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setEditingInvite(null);
                      setLookup(null);
                      setEmail('');
                      setPersonId('');
                    }}
                  >
                    Cancelar edição
                  </button>
                )}
                <button
                  className="button primary"
                  disabled={busy || syncBlocked || !group?.adminPersonId}
                >
                  {busy ? 'Salvando…' : 'Enviar convite'}
                </button>
              </div>
            </>
          )}
        </form>
      </section>
      <section className="panel" hidden={section !== 'manage'} aria-labelledby="invite-sent-title">
        <div className="sharing-section-heading">
          <div>
            <p className="eyebrow">ACOMPANHAMENTO</p>
            <h3 id="invite-sent-title">Convites enviados</h3>
          </div>
          <span className="pill">{sent.length}</span>
        </div>
        <p className="muted">
          {pendingSent.length} pendente(s) ·{' '}
          {sent.filter((item) => item.status === 'accepted').length} conta(s) vinculada(s) ·{' '}
          {sent.filter((item) => item.status === 'revoked').length} acesso(s) removido(s)
        </p>
        {sent.length ? (
          <ul className="sharing-record-list">
            {sent.map((item) => (
              <li key={item.id} className="sharing-record">
                <div className="sharing-record-info">
                  <strong>{item.personName}</strong>
                  <span>{item.groupName}</span>
                  <small>{item.email}</small>
                </div>
                <span className={'pill ' + (item.status === 'accepted' ? 'paid' : 'pending')}>
                  {item.status === 'accepted'
                    ? 'Conta vinculada'
                    : item.status === 'revoked'
                      ? 'Acesso removido'
                      : 'Pendente'}
                </span>
                {item.status === 'pending' && (
                  <div className="actions sharing-record-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        const localId = data.groups.find(
                          (candidate) => sharedGroupId(user.uid, candidate.id) === item.groupId,
                        )?.id;
                        setGroupId(localId || '');
                        setEditingInvite(item);
                        setPersonId(item.personId);
                        setEmail(item.email);
                        setLookup(null);
                        setInviteName(item.personName);
                        inviteForm.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    >
                      Editar e-mail
                    </button>{' '}
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => run(() => cancelGroupInvite(item.id))}
                    >
                      Cancelar convite
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <strong>Nenhum convite enviado</strong>
            <p>Use o formulário acima para dar acesso a um participante.</p>
          </div>
        )}
        {owned.length > 0 && (
          <div className="sharing-sync">
            <p className="hint">
              Alterações são compartilhadas enquanto o aplicativo está aberto. Use este botão para
              tentar novamente se ocorrer uma falha.
            </p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  for (const item of owned) {
                    if (
                      data.groups.some(
                        (candidate) => !candidate.deleted && candidate.id === item.snapshot.id,
                      )
                    )
                      await publishGroup(data, item.snapshot.id, item.revision);
                  }
                  notify?.('Dados compartilhados atualizados.');
                })
              }
            >
              Atualizar dados compartilhados
            </button>
          </div>
        )}
      </section>
      <section
        className="panel"
        hidden={section !== 'received'}
        aria-labelledby="invite-received-title"
      >
        <div className="sharing-section-heading">
          <div>
            <p className="eyebrow">SEU ACESSO</p>
            <h3 id="invite-received-title">Convites recebidos</h3>
          </div>
          <span className="pill">{pendingReceived.length}</span>
        </div>
        <p className="muted">
          Convites para {user.email}. Aceitar mantém o histórico da pessoa que já está no grupo.
        </p>
        <ul className="sharing-record-list">
          {pendingReceived.map((item) => (
            <li key={item.id} className="sharing-record">
              <div className="sharing-record-info">
                <strong>{item.groupName}</strong>
                <span>Participante: {item.personName}</span>
              </div>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await acceptGroupInvite(item.id);
                    setSection('groups');
                    notify?.('Convite aceito. Seu grupo compartilhado já está disponível.');
                  })
                }
              >
                Aceitar convite
              </button>
            </li>
          ))}
        </ul>
        {!pendingReceived.length && (
          <div className="empty">
            <strong>Nenhum convite pendente</strong>
            <p>Quando alguém convidar seu e-mail, o convite aparecerá aqui.</p>
          </div>
        )}
      </section>
      <section
        className="panel sharing-memberships"
        hidden={section !== 'groups'}
        aria-labelledby="shared-groups-title"
      >
        <div className="sharing-section-heading">
          <div>
            <p className="eyebrow">CONSULTA COMPARTILHADA</p>
            <h3 id="shared-groups-title">Grupos compartilhados com você</h3>
          </div>
          <span className="pill">{memberships.length}</span>
        </div>
        <p className="muted">
          Consulte os participantes e convide novos membros. Os dados cadastrais são gerenciados
          pelo administrador; as despesas e os saldos ficam no espaço Grupo.
        </p>
        {memberships.map((membership) => (
          <SharedGroupView key={membership.id} membership={membership} tab="groups" />
        ))}
        {!memberships.length && (
          <div className="empty">
            <strong>Você ainda não aceitou um convite</strong>
            <p>Os grupos aos quais você ganhou acesso aparecerão nesta seção.</p>
          </div>
        )}
      </section>
    </section>
  );
}
