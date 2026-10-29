import React, { useEffect, useRef, useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../auth/AuthProvider.jsx';
import { money } from '../../domain/expenses/expenseCalculations.js';
import { normalizeInviteEmail, projectSharedGroup } from '../../domain/groups/groupSharing.js';
import {
  acceptGroupInvite,
  cancelGroupInvite,
  publishGroup,
  saveGroupInvite,
  sharedGroupId,
  watchSharedGroup,
  watchSharing,
} from '../../infrastructure/firebase/groupSharingRepository.js';

const sharingEnabled = import.meta.env.VITE_GROUP_SHARING_ENABLED === 'true';

function SharedGroupView({ membership }) {
  const [group, setGroup] = useState(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('sv-SE').slice(0, 7));
  useEffect(() => {
    setGroup(null);
    return watchSharedGroup(membership.groupId, setGroup, () =>
      setError('Não foi possível carregar o grupo compartilhado.'),
    );
  }, [membership.groupId]);
  if (error)
    return (
      <p className="notice error" role="alert">
        {error}
      </p>
    );
  if (!group) return <p role="status">Carregando grupo…</p>;
  const snapshot = group.snapshot;
  const expenses = snapshot.expenses.filter((item) => item.date.startsWith(month));
  const settlements = (snapshot.settlements || []).filter((item) => item.referenceMonth === month);
  const balance =
    expenses
      .filter((item) => item.status === 'paid')
      .reduce(
        (sum, item) =>
          sum +
          (item.payer === membership.personId ? item.amount : 0) -
          (item.shares[membership.personId] || 0),
        0,
      ) +
    settlements
      .filter((item) => item.status === 'confirmed')
      .reduce(
        (sum, item) =>
          sum +
          (item.from === membership.personId ? item.amount : 0) -
          (item.to === membership.personId ? item.amount : 0),
        0,
      );
  const name = (id) => snapshot.people.find((person) => person.id === id)?.name || 'Participante';
  return (
    <article className="panel">
      <h3>{snapshot.name}</h3>
      <p>
        Você está vinculado a <strong>{name(membership.personId)}</strong>. O administrador gerencia
        os lançamentos.
      </p>
      <label className="field">
        Mês <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
      </label>
      <p>
        Sua parte nas contas:{' '}
        <strong>
          {money(expenses.reduce((sum, item) => sum + (item.shares[membership.personId] || 0), 0))}
        </strong>
      </p>
      <p>
        Saldo após repasses: <strong>{money(Math.abs(balance))}</strong>{' '}
        {balance > 0 ? 'a receber' : balance < 0 ? 'a pagar' : '· tudo acertado'}
      </p>
      {expenses.length ? (
        <ul>
          {expenses.map((item) => (
            <li key={item.id}>
              <strong>{item.description}</strong> · {money(item.amount)} ·{' '}
              {item.date.split('-').reverse().join('/')}
              <br />
              Sua parte: {money(item.shares[membership.personId] || 0)} ·{' '}
              {item.status === 'paid' ? 'Pago' : 'Pendente'} · Pagador: {name(item.payer)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">Nenhuma despesa neste mês.</p>
      )}
      <h4>Histórico de repasses</h4>
      {settlements.length ? (
        <ul>
          {settlements.map((item) => (
            <li key={item.id}>
              {name(item.from)} → {name(item.to)} · {money(item.amount)} ·{' '}
              {item.date.split('-').reverse().join('/')} ·{' '}
              {item.status === 'void' ? 'Cancelado' : 'Confirmado'}
            </li>
          ))}
        </ul>
      ) : (
        <p>Nenhum repasse nesta competência.</p>
      )}
    </article>
  );
}

export function GroupSharingPanel({ data, notify }) {
  const { user, localMode } = useAuth();
  const [owned, setOwned] = useState([]);
  const [sent, setSent] = useState([]);
  const [received, setReceived] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [groupId, setGroupId] = useState('');
  const [personId, setPersonId] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(Boolean(user?.emailVerified));
  const ownedRef = useRef(owned);
  ownedRef.current = owned;
  const previousData = useRef(data);
  const group = data.groups.find((item) => item.id === groupId);
  const fail = () =>
    setError(
      'Não foi possível acessar o compartilhamento. Confira a conexão e a ativação do Firestore e das regras de acesso.',
    );
  useEffect(() => {
    if (!sharingEnabled || !user || localMode) return undefined;
    const stops = [
      watchSharing('sharedGroups', 'adminUid', user.uid, setOwned, fail),
      watchSharing('groupInvites', 'adminUid', user.uid, setSent, fail),
      watchSharing('groupMemberships', 'uid', user.uid, setMemberships, fail),
    ];
    if (verified && user.email)
      stops.push(
        watchSharing('groupInvites', 'email', user.email.toLowerCase(), setReceived, fail),
      );
    return () => stops.forEach((stop) => stop());
  }, [user?.uid, localMode, verified]);

  // Only local edits made while this panel is mounted publish automatically. Never upload on load.
  useEffect(() => {
    if (previousData.current === data) return undefined;
    previousData.current = data;
    if (!sharingEnabled || !user || localMode) return undefined;
    const timer = setTimeout(async () => {
      try {
        for (const shared of ownedRef.current) {
          if (
            data.groups.some((item) => item.id === shared.snapshot.id) &&
            JSON.stringify(projectSharedGroup(data, shared.snapshot.id)) !==
              JSON.stringify(shared.snapshot)
          )
            await publishGroup(data, shared.snapshot.id, shared.revision);
        }
      } catch (err) {
        setError(err.message);
        notify?.(
          'Não foi possível atualizar o grupo compartilhado. Abra Pessoas e grupos para tentar novamente.',
        );
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [data, user?.uid, localMode]);

  async function run(operation) {
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
      setBusy(false);
    }
  }
  async function invite(event) {
    event.preventDefault();
    await run(async () => {
      if (!group?.memberIds.includes(personId))
        throw new Error('Selecione um participante do grupo.');
      normalizeInviteEmail(email);
      const id = sharedGroupId(user.uid, group.id);
      const current = owned.find((item) => item.id === id);
      await publishGroup(data, group.id, current?.revision ?? null);
      await saveGroupInvite(
        id,
        personId,
        email,
        data.people.find((person) => person.id === personId).name,
        group.name,
      );
      setEmail('');
      notify?.('Convite disponível no aplicativo para o e-mail informado.');
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
    <section className="panel">
      <h2>Convites e acesso ao grupo</h2>
      <p>
        Adicione o e-mail de uma pessoa já cadastrada. Quando ela entrar com esse e-mail confirmado
        e aceitar, terá acesso ao histórico do participante, sem duplicar o cadastro.
      </p>
      <p className="hint">
        Os convites aparecem dentro do aplicativo. Compartilhe o endereço do site com a pessoa.
        Rendas pessoais, despesas individuais e comprovantes não são enviados.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!verified && (
        <div className="notice">
          <p>Confirme seu e-mail para consultar e aceitar convites recebidos.</p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await sendEmailVerification(user);
                notify?.('Mensagem de confirmação enviada ao seu e-mail.');
              })
            }
          >
            Enviar confirmação
          </button>{' '}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await user.reload();
                await user.getIdToken(true);
                setVerified(user.emailVerified);
                if (!user.emailVerified)
                  throw new Error('O e-mail ainda não foi confirmado. Abra o link recebido.');
              })
            }
          >
            Já confirmei meu e-mail
          </button>
        </div>
      )}
      <form onSubmit={invite}>
        <label className="field">
          Grupo que você administra
          <select
            required
            value={groupId}
            onChange={(event) => {
              setGroupId(event.target.value);
              setPersonId('');
              setEmail('');
            }}
          >
            <option value="">Selecione um grupo</option>
            {data.groups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Participante existente
          <select
            required
            value={personId}
            onChange={(event) => {
              setPersonId(event.target.value);
              setEmail('');
            }}
          >
            <option value="">Selecione uma pessoa</option>
            {(group?.memberIds || []).map((id) => (
              <option key={id} value={id}>
                {data.people.find((person) => person.id === id)?.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          E-mail para vincular{' '}
          <input
            required
            type="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button className="button primary" disabled={busy || !group}>
          Salvar convite
        </button>
      </form>
      <h3>Convites que você administra</h3>
      {sent.length ? (
        <ul>
          {sent.map((item) => (
            <li key={item.id}>
              {item.personName} · {item.groupName} · {item.email} ·{' '}
              {item.status === 'accepted' ? 'Conta vinculada' : 'Pendente'}{' '}
              {item.status === 'pending' && (
                <>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      const localId = data.groups.find(
                        (candidate) => sharedGroupId(user.uid, candidate.id) === item.groupId,
                      )?.id;
                      setGroupId(localId || '');
                      setPersonId(item.personId);
                      setEmail(item.email);
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
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>Nenhum convite criado.</p>
      )}
      {owned.length > 0 && (
        <>
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
                  if (data.groups.some((candidate) => candidate.id === item.snapshot.id))
                    await publishGroup(data, item.snapshot.id, item.revision);
                }
                notify?.('Dados compartilhados atualizados.');
              })
            }
          >
            Atualizar dados compartilhados
          </button>
        </>
      )}
      <h3>Convites recebidos</h3>
      {received
        .filter((item) => item.status === 'pending')
        .map((item) => (
          <p key={item.id}>
            {item.groupName} · Participante: {item.personName}{' '}
            <button
              className="button primary"
              disabled={busy}
              onClick={() => run(() => acceptGroupInvite(item.id))}
            >
              Aceitar convite
            </button>
          </p>
        ))}
      {verified && !received.some((item) => item.status === 'pending') && (
        <p>Nenhum convite pendente para seu e-mail.</p>
      )}
      <h3>Grupos compartilhados com você</h3>
      {memberships.map((membership) => (
        <SharedGroupView key={membership.id} membership={membership} />
      ))}
      {!memberships.length && <p>Seus grupos aparecerão aqui depois de aceitar um convite.</p>}
    </section>
  );
}
