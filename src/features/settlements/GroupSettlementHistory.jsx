import React, { useState } from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';

export function GroupSettlementHistory({ records, nameOf, canUndo, onUndo }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <section className="overview-section">
      <h3>Recebimentos do mês</h3>
      {!records.length ? (
        <p className="overview-note">Nenhum recebimento confirmado nesta competência.</p>
      ) : (
        <ul className="sharing-record-list">
          {[...records]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((record) => (
              <li className="sharing-record" key={record.id}>
                <div className="sharing-record-info">
                  <strong>
                    {nameOf(record.from)} → {nameOf(record.to)}
                  </strong>
                  <span>
                    {money(record.amount)} · {record.date.split('-').reverse().join('/')}
                  </span>
                  <small>
                    {record.status === 'void'
                      ? 'Estornado · não abate a dívida'
                      : 'Recebimento confirmado'}
                  </small>
                </div>
                {record.status === 'confirmed' && canUndo?.(record) && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError('');
                      try {
                        await onUndo(record.id);
                      } catch (err) {
                        setError(err.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Desfazer recebimento
                  </button>
                )}
              </li>
            ))}
        </ul>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
