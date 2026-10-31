import React from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';
import { CATEGORIES } from '../../shared/constants/categories.js';

function equalPercentages(ids) {
  const base = ids.length ? Math.floor(10000 / ids.length) : 0;
  const extra = ids.length ? 10000 % ids.length : 0;
  return Object.fromEntries(ids.map((id, index) => [id, (base + (index < extra ? 1 : 0)) / 100]));
}

export function ExpenseDialog({
  dialog,
  close,
  saveExpense,
  draft,
  setDraft,
  data,
  memberIds,
  preview,
  previewError,
  error,
}) {
  const shared = draft.workspace.startsWith('group:');
  const nameOf = (id) => data.people.find((person) => person.id === id)?.name || 'Pessoa';
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  function setRecurring(enabled) {
    setDraft((current) => {
      const { installments, ...rest } = current;
      return enabled ? { ...current, fixed: true } : { ...rest, fixed: false };
    });
  }
  function setDuration(value) {
    setDraft((current) => {
      const { installments, ...rest } = current;
      return value === 'limited' ? { ...current, installments: { total: 6, current: 1 } } : rest;
    });
  }
  function changeSplit(value) {
    setDraft((current) => ({
      ...current,
      split: value,
      percentages:
        value === 'custom' && current.split !== 'custom'
          ? equalPercentages(current.participants)
          : current.percentages,
    }));
  }
  function toggle(id) {
    setDraft((current) => {
      const participants = current.participants.includes(id)
        ? current.participants.filter((item) => item !== id)
        : memberIds.filter((item) => item === id || current.participants.includes(item));
      return { ...current, participants, percentages: equalPercentages(participants) };
    });
  }
  const percentTotal =
    draft.participants.reduce(
      (total, id) => total + Math.round(Number(draft.percentages?.[id] || 0) * 100),
      0,
    ) / 100;
  return (
    <dialog
      ref={dialog}
      className="dialog expense-dialog"
      onCancel={close}
      aria-labelledby="expense-dialog-title"
    >
      <form onSubmit={saveExpense} className="expense-form">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{shared ? 'DESPESA DO GRUPO' : 'DESPESA PESSOAL'}</p>
            <h2 id="expense-dialog-title">{draft.id ? 'Editar despesa' : 'Uma nova despesa'}</h2>
          </div>
          <button
            type="button"
            className="button secondary"
            aria-label="Fechar cadastro de despesa"
            onClick={close}
          >
            ×
          </button>
        </div>
        <fieldset className="form-section expense-form-section">
          <legend>Informações da conta</legend>
          <div className="form-grid">
            <label className="field">
              Descrição
              <input
                autoFocus
                required
                maxLength={100}
                value={draft.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="Ex.: Mercado da casa"
              />
            </label>
            <label className="field">
              {draft.installments ? 'Valor desta parcela (R$)' : 'Valor total (R$)'}
              <input
                required
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => update('amount', e.target.value)}
                placeholder="0,00"
              />
            </label>
            <label className="field">
              Categoria
              <select value={draft.category} onChange={(e) => update('category', e.target.value)}>
                {CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Vencimento
              <input
                type="date"
                required
                value={draft.date}
                onChange={(e) => update('date', e.target.value)}
              />
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={draft.fixed}
              onChange={(e) => setRecurring(e.target.checked)}
            />
            Conta recorrente · se repete todos os meses
          </label>
          {draft.fixed && (
            <div className="recurring-options">
              <label className="field">
                Por quanto tempo esta conta se repete?
                <select
                  value={draft.installments ? 'limited' : 'unlimited'}
                  onChange={(event) => setDuration(event.target.value)}
                >
                  <option value="unlimited">Sem prazo definido · conta mensal</option>
                  <option value="limited">Número de parcelas · compra ou financiamento</option>
                </select>
              </label>
              {draft.installments && (
                <>
                  <div className="form-grid">
                    <label className="field">
                      Quantidade de parcelas
                      <input
                        required
                        type="number"
                        min="1"
                        max={Number.MAX_SAFE_INTEGER}
                        placeholder="Ex.: 6, 48, 420"
                        step="1"
                        value={draft.installments.total}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            installments: { ...current.installments, total: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      Parcela deste mês
                      <input
                        required
                        type="number"
                        min="1"
                        max={draft.installments.total || Number.MAX_SAFE_INTEGER}
                        step="1"
                        value={draft.installments.current}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            installments: { ...current.installments, current: event.target.value },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <p className="hint">
                    Informe acima o valor de uma parcela, não o total da compra. Ex.: um
                    financiamento de 420 parcelas de R$ 978 registra R$ 978 por mês. Ao trazer o mês
                    seguinte, a numeração avança e encerra na última parcela. Os meses futuros não
                    são lançados automaticamente.
                  </p>
                </>
              )}
              <label className="field">
                Como o valor se repete?
                <select
                  value={draft.fixedAmountType || 'fixed'}
                  onChange={(event) => update('fixedAmountType', event.target.value)}
                >
                  <option value="fixed">Valor fixo · aluguel, assinatura</option>
                  <option value="variable">Valor variável · luz, água, cartão</option>
                </select>
              </label>
              <p className="hint">
                {draft.fixedAmountType === 'variable'
                  ? 'Ao copiar para outro mês, você informa o novo valor antes de salvar.'
                  : 'Ao copiar para outro mês, o valor vem preenchido e pode ser ajustado.'}{' '}
                Alterar um mês não muda os anteriores.
              </p>
            </div>
          )}
        </fieldset>
        {shared && (
          <fieldset className="form-section expense-form-section">
            <legend>Quem participa desta despesa?</legend>
            <p className="muted section-intro">
              Selecione quem divide esta conta. O pagador pode ser outra pessoa do grupo.
            </p>
            <div className="participant-list">
              {memberIds.map((id) => (
                <label className="checkbox-label" key={id}>
                  <input
                    type="checkbox"
                    checked={draft.participants.includes(id)}
                    onChange={() => toggle(id)}
                  />
                  {nameOf(id)}
                </label>
              ))}
            </div>
            <div className="form-grid">
              <label className="field">
                Forma de divisão
                <select value={draft.split} onChange={(e) => changeSplit(e.target.value)}>
                  <option value="proportional">Proporcional à renda líquida</option>
                  <option value="equal">Partes iguais</option>
                  <option value="custom">Percentuais personalizados</option>
                </select>
              </label>
            </div>
            {draft.split === 'custom' && (
              <>
                <p className="muted">
                  Os percentuais devem somar 100%. Alterar os participantes redistribui os
                  percentuais igualmente.
                </p>
                <div className="form-grid">
                  {draft.participants.map((id) => (
                    <label className="field" key={id}>
                      Parte de {nameOf(id)} (%)
                      <input
                        required
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={draft.percentages?.[id] ?? ''}
                        onChange={(e) =>
                          setDraft((current) => ({
                            ...current,
                            percentages: { ...current.percentages, [id]: e.target.value },
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <p
                  className={percentTotal === 100 ? 'metric-positive' : 'metric-negative'}
                  aria-live="polite"
                >
                  Total: {percentTotal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de
                  100%
                </p>
              </>
            )}
          </fieldset>
        )}
        <fieldset className="form-section expense-form-section">
          <legend>Pagamento</legend>
          <div className="form-grid">
            <label className="field">
              Situação
              <select value={draft.status} onChange={(e) => update('status', e.target.value)}>
                <option value="pending">Pendente</option>
                <option value="paid">Já foi paga</option>
              </select>
            </label>
            {draft.status === 'paid' &&
              (shared ? (
                <label className="field">
                  Quem pagou o valor total?
                  <select value={draft.payer} onChange={(e) => update('payer', e.target.value)}>
                    {memberIds.map((id) => (
                      <option key={id} value={id}>
                        {nameOf(id)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="notice">Pagamento registrado por {nameOf(draft.payer)}.</p>
              ))}
          </div>
        </fieldset>
        <div className="notice expense-preview" aria-live="polite">
          {preview ? (
            <div>
              <strong>{shared ? 'Assim fica a divisão' : 'Este gasto é pessoal'}</strong>
              {draft.participants.map((id) => (
                <p key={id}>
                  {nameOf(id)}: <strong>{money(preview[id])}</strong>
                </p>
              ))}
              <small>
                {shared
                  ? 'As partes somam exatamente o valor da conta, incluindo o ajuste dos centavos.'
                  : 'Não entra nos acertos dos grupos.'}
              </small>
            </div>
          ) : (
            <p>{previewError || 'Preencha o valor para conferir antes de salvar.'}</p>
          )}
        </div>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <div className="form-actions expense-dialog-actions">
          <button type="button" className="button secondary" onClick={close}>
            Cancelar
          </button>
          <button className="button primary">Salvar despesa</button>
        </div>
      </form>
    </dialog>
  );
}
