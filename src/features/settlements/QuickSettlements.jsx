import React, { useRef, useState } from 'react';
import { money, parseMoney } from '../../domain/expenses/expenseCalculations.js';
import { recordQuickSettlement } from '../../domain/settlements/quickSettlement.js';

export function QuickSettlements({
  transfers,
  nameOf,
  scope,
  month,
  commitData,
  receiverId,
  onSharedReceive,
  onSharedUndo,
  readOnly = false,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState(null);
  const [partial, setPartial] = useState('');
  const [amount, setAmount] = useState('');
  const lock = useRef(false);
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
  return (
    <div className="quick-settlements">
      {transfers.length > 0 && (
        <ul className="group-transfers">
          {transfers.map((transfer) => (
            <li key={`${transfer.from}:${transfer.to}`}>
              <div>
                <strong>{nameOf(transfer.from)}</strong>
                <span>repassa para {nameOf(transfer.to)}</span>
              </div>
              <strong className="amount">{money(transfer.amount)}</strong>
              {!readOnly && transfer.to === receiverId && (
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
                        <input
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
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
