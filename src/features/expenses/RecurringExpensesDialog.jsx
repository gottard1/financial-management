import React, { useEffect, useRef, useState } from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';

export function RecurringExpensesDialog({ items, month, onClose, onSave }) {
  const dialog = useRef();
  const [error, setError] = useState('');
  const [entries, setEntries] = useState(() =>
    Object.fromEntries(
      items.map((item) => [
        item.id,
        {
          selected: true,
          amount:
            item.fixedAmountType === 'variable'
              ? ''
              : (item.amount / 100).toFixed(2).replace('.', ','),
        },
      ]),
    ),
  );
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const update = (id, patch) =>
    setEntries((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  function save(event) {
    event.preventDefault();
    try {
      onSave(entries);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="dialog expense-dialog"
      onCancel={onClose}
      aria-labelledby="recurring-title"
    >
      <form onSubmit={save} className="expense-form">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">CONTAS RECORRENTES</p>
            <h2 id="recurring-title">Revise as contas de {month.split('-').reverse().join('/')}</h2>
          </div>
          <button
            type="button"
            className="button secondary"
            aria-label="Fechar revisão de contas recorrentes"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="muted">
          Escolha as contas que deseja trazer do mês anterior e informe os valores deste mês. Os
          lançamentos anteriores permanecem como estão.
        </p>
        <div className="recurring-review-list">
          {items.map((item) => (
            <div className="recurring-review-item" key={item.id}>
              <div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={entries[item.id].selected}
                    onChange={(event) => update(item.id, { selected: event.target.checked })}
                  />
                  <strong>{item.description}</strong>
                </label>
                <p className="hint">
                  {item.fixedAmountType === 'variable' ? 'Valor variável' : 'Valor fixo'} · Mês
                  anterior: {money(item.amount)}
                </p>
              </div>
              <label className="field">
                Valor neste mês (R$)
                <input
                  required={entries[item.id].selected}
                  disabled={!entries[item.id].selected}
                  inputMode="decimal"
                  value={entries[item.id].amount}
                  placeholder="Informe o valor atual"
                  onChange={(event) => update(item.id, { amount: event.target.value })}
                />
              </label>
            </div>
          ))}
        </div>
        <p className="hint">
          Todas as contas serão criadas como pendentes. Você pode ajustar o vencimento e a divisão
          ao editar cada lançamento.
        </p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions expense-dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary">Adicionar contas ao mês</button>
        </div>
      </form>
    </dialog>
  );
}
