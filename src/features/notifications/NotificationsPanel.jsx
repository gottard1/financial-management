import React, { useRef, useState } from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';
import { acceptGroupInvite } from '../../infrastructure/firebase/groupSharingRepository.js';
import { Icon } from '../../components/ui/Icon.jsx';

export function PaymentRequests({ reports, onRespond, actorId, userUid, compact = false }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const mine = (report) =>
    report.canRespond ?? (userUid ? report.toUid === userUid : report.to === actorId);
  async function respond(report, action) {
    if (lock.current) return;
    lock.current = true;
    setBusy(report.id);
    setError('');
    try {
      await onRespond(report, action);
    } catch (err) {
      setError(err.message);
    } finally {
      lock.current = false;
      setBusy('');
    }
  }
  if (compact && !reports.length) return null;
  return (
    <section className="payment-requests" aria-label="Solicitações de recebimento">
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!reports.length && (
        <section className="panel empty">
          <Icon name="bell" />
          <h2>Tudo em dia</h2>
          <p>Nenhuma atualização de pagamento para você.</p>
        </section>
      )}
      {[...reports]
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .map((report) => (
          <article className={'panel payment-notification ' + report.status} key={report.id}>
            <div className="panel-heading">
              <span className={'pill ' + (report.status === 'pending' ? 'pending' : '')}>
                {report.status === 'pending'
                  ? mine(report)
                    ? 'Confirme o recebimento'
                    : 'Aguardando confirmação'
                  : report.status === 'confirmed'
                    ? 'Recebimento confirmado'
                    : report.status === 'reversed'
                      ? 'Recebimento desfeito'
                      : 'Recebimento não confirmado'}
              </span>
              <small className="muted">
                {report.groupName} · {report.month?.split('-').reverse().join('/')}
              </small>
            </div>
            <h2>
              {report.fromName || report.from} → {report.toName || report.to} ·{' '}
              {money(report.amount)}
            </h2>
            <p>
              {report.status === 'pending'
                ? `${report.fromName || 'Quem paga'} informou o pagamento. O acerto só é concluído após a confirmação de ${report.toName || 'quem recebe'}.`
                : report.status === 'rejected'
                  ? 'A pessoa informou que não recebeu. O valor continua em aberto.'
                  : report.status === 'reversed'
                    ? 'O recebimento foi desfeito e a dívida foi recalculada.'
                    : 'O recebimento foi confirmado e o saldo do acerto foi atualizado.'}
            </p>
            {report.status === 'pending' && mine(report) && (
              <div className="form-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={Boolean(busy)}
                  onClick={() => respond(report, 'confirm')}
                >
                  {busy === report.id ? 'Salvando…' : `Recebi ${money(report.amount)}`}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={Boolean(busy)}
                  onClick={() => respond(report, 'reject')}
                >
                  Não recebi
                </button>
              </div>
            )}
          </article>
        ))}
    </section>
  );
}

export function NotificationsPanel({
  reports,
  invites,
  onRespond,
  userUid,
  actorId,
  notify,
  onOpenGroup,
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  return (
    <>
      <PaymentRequests {...{ reports, onRespond, userUid, actorId }} compact={invites.length > 0} />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {invites.map((invite) => (
        <article className="panel payment-notification" key={invite.id}>
          <span className="pill">Convite de grupo</span>
          <h2>{invite.groupName}</h2>
          <p>Você recebeu um convite para participar como {invite.personName}.</p>
          <div className="form-actions">
            <button
              type="button"
              className="button primary"
              disabled={Boolean(busy)}
              onClick={async () => {
                setBusy(invite.id);
                setError('');
                try {
                  await acceptGroupInvite(invite.id);
                  notify('Convite aceito. Seu grupo ficará disponível na navegação.');
                  onOpenGroup?.(invite.groupId);
                } catch (err) {
                  setError(err.message);
                } finally {
                  setBusy('');
                }
              }}
            >
              Aceitar convite
            </button>
          </div>
        </article>
      ))}
      <p className="hint">
        Abrir uma notificação não confirma recebimentos. Sua caixa de entrada reúne atualizações dos
        seus grupos.
      </p>
    </>
  );
}
