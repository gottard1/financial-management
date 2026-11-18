import { MoneyInput } from '../../components/ui/FormattedInput.jsx';
import React, { useRef, useState } from 'react';
import { money, parseMoney } from '../../domain/expenses/expenseCalculations.js';
import { recordQuickSettlement } from '../../domain/settlements/quickSettlement.js';
import { SettlementDetails, SettlementReviewNotice } from './SettlementDetails.jsx';

export function QuickSettlements({
  transfers,
  settlementPairs = [],
  settlementIssues = [],
  nameOf,
  scope,
  month,
  commitData,
  receiverId,
  onSharedReceive,
  onSharedUndo,
  onReport,
  pendingReports = [],
  readOnly = false,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState(null);
  const [partial, setPartial] = useState('');
  const [amount, setAmount] = useState('');
  const [returning, setReturning] = useState('');
  const [returnAmount, setReturnAmount] = useState('');
  const [reported, setReported] = useState(null);
  const lock = useRef(false);
  const canReport = (transfer) =>
    !readOnly &&
    typeof onReport === 'function' &&
    transfer.from === receiverId &&
    !pendingReports.some((item) => item.from === transfer.from && item.to === transfer.to);
  async function run(operation) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (err) {
      setError(err.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function receive(transfer) {
    run(async () => {
      const id = crypto.randomUUID();
      const date = new Date().toLocaleDateString('sv-SE');
      if (onSharedReceive) await onSharedReceive(transfer, id);
      else
        await commitData((data) =>
          recordQuickSettlement(data, { scope, month, transfer, id, date }),
        );
      setLast({ id, ...transfer });
      setPartial('');
      setAmount('');
    });
  }
  function report(transfer) {
    run(async () => {
      const value = parseMoney(returnAmount);
      if (value <= 0 || value > transfer.amount)
        throw new Error(`Informe um valor maior que zero e de até ${money(transfer.amount)}.`);
      if (!canReport(transfer))
        throw new Error('Este repasse não está disponível para informar uma devolução.');
      await onReport({ from: transfer.from, to: transfer.to, amount: value });
      setReported({ from: transfer.from, to: transfer.to, amount: value });
      setReturning('');
      setReturnAmount('');
    });
  }
  const wasReported = (transfer) =>
    reported?.from === transfer.from && reported?.to === transfer.to;
  const reportedNotice = reported && (
    <p className="notice settlement-feedback" role="status">
      Devolução de {money(reported.amount)} para {nameOf(reported.to)} informada. O saldo só baixa
      depois que {nameOf(reported.to)} confirmar o recebimento.
    </p>
  );
  return (
    <div className="quick-settlements">
      <SettlementReviewNotice issues={settlementIssues} nameOf={nameOf} />
      {!transfers.some(wasReported) && reportedNotice}
      {error && !returning && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {transfers.length > 0 && (
        <ul className="group-transfers">
          {transfers.map((transfer) => (
            <li key={`${transfer.from}:${transfer.to}`}>
              <div>
                <strong>{nameOf(transfer.from)}</strong>
                <span>devolve para {nameOf(transfer.to)}</span>
              </div>
              <strong className="amount">{money(transfer.amount)}</strong>
              {pendingReports.some(
                (item) => item.from === transfer.from && item.to === transfer.to,
              ) && <span className="pill pending">Aguardando confirmação nas solicitações</span>}
              {canReport(transfer) && (
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  aria-expanded={returning === `${transfer.from}:${transfer.to}`}
                  onClick={() => {
                    setReturning(`${transfer.from}:${transfer.to}`);
                    setReturnAmount((transfer.amount / 100).toFixed(2).replace('.', ','));
                    setError('');
                    setReported(null);
                  }}
                >
                  {busy ? 'Salvando…' : 'Devolver'}
                </button>
              )}
              {canReport(transfer) && returning === `${transfer.from}:${transfer.to}` && (
                <form
                  className="settlement-return-form"
                  aria-label={`Registrar devolução de ${nameOf(transfer.from)} para ${nameOf(transfer.to)}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    report(transfer);
                  }}
                >
                  <p>
                    {nameOf(transfer.from)} devolve para {nameOf(transfer.to)}. Falta devolver{' '}
                    {money(transfer.amount)}.
                  </p>
                  <label className="field">
                    Valor devolvido (R$)
                    <MoneyInput
                      autoFocus
                      required
                      inputMode="decimal"
                      value={returnAmount}
                      disabled={busy}
                      onChange={(event) => setReturnAmount(event.target.value)}
                    />
                  </label>
                  <p className="hint">
                    Informe somente depois de enviar o dinheiro. {nameOf(transfer.to)} precisa
                    confirmar o recebimento para baixar o saldo. Você pode informar uma parte.
                  </p>
                  {error && (
                    <p className="notice error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="form-actions">
                    <button className="button primary" disabled={busy}>
                      {busy ? 'Enviando…' : 'Informar devolução'}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        setReturning('');
                        setError('');
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
              {!readOnly &&
                transfer.to === receiverId &&
                !pendingReports.some(
                  (item) => item.from === transfer.from && item.to === transfer.to,
                ) && (
                  <div className="quick-receipt-actions">
                    <button
                      type="button"
                      className="button primary"
                      disabled={busy}
                      onClick={() => receive(transfer)}
                      aria-label={`Confirmar recebimento de ${money(transfer.amount)} de ${nameOf(transfer.from)} para ${nameOf(transfer.to)}`}
                    >
                      {busy ? 'Salvando…' : '✓ Já recebi'}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        setPartial(`${transfer.from}:${transfer.to}`);
                        setAmount('');
                      }}
                    >
                      Recebi uma parte
                    </button>
                    {partial === `${transfer.from}:${transfer.to}` && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          try {
                            receive({ ...transfer, amount: parseMoney(amount) });
                          } catch (err) {
                            setError(err.message);
                          }
                        }}
                      >
                        <label className="field">
                          Valor recebido (R$)
                          <MoneyInput
                            required
                            inputMode="decimal"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            placeholder="0,00"
                          />
                        </label>
                        <button className="button primary" disabled={busy}>
                          Confirmar valor recebido
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => setPartial('')}
                        >
                          Cancelar
                        </button>
                      </form>
                    )}
                  </div>
                )}
              {wasReported(transfer) && reportedNotice}
              <SettlementDetails transfer={transfer} pairs={settlementPairs} nameOf={nameOf} />
            </li>
          ))}
        </ul>
      )}
      {!readOnly && transfers.length > 0 && (
        <p className="hint">
          Marque somente após o dinheiro chegar. O valor inteiro deste acerto será registrado com a
          data de hoje. Se recebeu menos, escolha “Recebi uma parte”.
        </p>
      )}
      {last && (
        <div className="notice notice-with-action" role="status">
          <p>
            Recebimento de {money(last.amount)} de {nameOf(last.from)} para {nameOf(last.to)}{' '}
            confirmado.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (onSharedUndo) await onSharedUndo(last.id);
                else
                  await commitData((data) => ({
                    ...data,
                    settlements: data.settlements.map((item) =>
                      item.id === last.id ? { ...item, status: 'void' } : item,
                    ),
                  }));
                setLast(null);
              })
            }
          >
            Desfazer recebimento
          </button>
        </div>
      )}
    </div>
  );
}
