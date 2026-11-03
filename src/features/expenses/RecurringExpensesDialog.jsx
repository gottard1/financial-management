import { MoneyInput } from '../../components/ui/FormattedInput.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';
import {
  recurrenceLabel,
  requiresRecurringAmount,
  recurringReviewEntries,
} from '../../domain/expenses/recurringExpenses.js';

export function RecurringExpensesDialog({ items, month, onClose, onSave }) {
  const dialog = useRef();
  const [error, setError] = useState('');
  const [entries, setEntries] = useState(() => recurringReviewEntries(items));
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const update = (id, patch) =>
    setEntries((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  async function save(event) {
    event.preventDefault();
    try {
      await onSave(entries);
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
                    disabled={Boolean(item.unavailableReason)}
                    onChange={(event) => update(item.id, { selected: event.target.checked })}
                  />
                  <strong>{item.description}</strong>
                </label>
                <p className="hint">
                  {requiresRecurringAmount(item)
                    ? 'Valor variável · informe somente o valor deste mês, sem sugestão do mês anterior.'
                    : item.purchaseTotal !== undefined
                      ? 'Parcela calculada a partir do total da compra.'
                      : `Valor fixo · mês anterior: ${money(item.amount)}`}
                </p>
                {item.unavailableReason && <p className="hint">{item.unavailableReason}</p>}
                {item.installments && (
                  <p className="hint">
                    Próximo lançamento:{' '}
                    {recurrenceLabel({
                      ...item,
                      installments: {
                        ...item.installments,
                        current: item.installments.current + 1,
                      },
                    })}
                  </p>
                )}
              </div>
              <label className="field">
                Valor neste mês (R$)
                <MoneyInput
                  required={entries[item.id].selected}
                  disabled={!entries[item.id].selected}
                  inputMode="decimal"
                  readOnly={item.purchaseTotal !== undefined}
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
