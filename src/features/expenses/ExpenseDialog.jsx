import React from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';
import { categoryOptions } from '../../domain/expenses/expenseCategories.js';
import { invoiceDates, installmentAmount } from '../../domain/finance/extendedFinance.js';

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
  let invoicePreview = null;
  try {
    if (draft.cardId && draft.purchaseDate && (draft.recalculateInvoice || !draft.cardTerms))
      invoicePreview = invoiceDates(
        draft.purchaseDate,
        (data.cards || []).find((c) => c.id === draft.cardId),
      );
  } catch {}
  const completePreview =
    preview && draft.participants.every((id) => Number.isSafeInteger(preview[id]));
  const nameOf = (id) => data.people.find((person) => person.id === id)?.name || 'Pessoa';
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  function setRecurring(enabled) {
    setDraft((current) => {
      const { installments, recurrence, purchaseTotal, amountMode, generateFuture, ...rest } =
        current;
      return enabled ? { ...current, fixed: true } : { ...rest, fixed: false };
    });
  }
  function setDuration(value) {
    setDraft((current) => {
      const { installments, recurrence, purchaseTotal, amountMode, generateFuture, ...rest } =
        current;
      return value === 'limited'
        ? { ...rest, installments: { total: 6, current: 1 } }
        : value === 'recurrence'
          ? { ...rest, recurrence: { total: 12, current: 1 } }
          : rest;
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
              {draft.installments && draft.amountMode !== 'total'
                ? 'Valor desta parcela (R$)'
                : 'Valor total (R$)'}
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
                {categoryOptions(data, draft.workspace, [draft.category]).map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Vencimento
              <input
                type="date"
                required
                readOnly={Boolean(draft.cardId)}
                value={invoicePreview?.date || draft.date}
                onChange={(e) => update('date', e.target.value)}
              />
            </label>
            <label className="field">
              Cartão / fatura (opcional)
              <select
                value={draft.cardId || ''}
                onChange={(e) =>
                  setDraft((c) => ({
                    ...c,
                    cardId: e.target.value,
                    recalculateInvoice: true,
                    purchaseDate: c.purchaseDate || c.date,
                  }))
                }
              >
                <option value="">Sem cartão · mês pelo vencimento</option>
                {(data.cards || [])
                  .filter((c) => c.scope === draft.workspace)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <small>Cadastre cartões na área Faturas e eventos.</small>
            </label>
            <label className="field">
              Data da compra (opcional sem cartão)
              <input
                type="date"
                required={Boolean(draft.cardId)}
                value={draft.purchaseDate || ''}
                onChange={(e) =>
                  setDraft((c) => ({
                    ...c,
                    purchaseDate: e.target.value,
                    recalculateInvoice: true,
                  }))
                }
              />
              {draft.cardId && (
                <small>
                  Competência da fatura:{' '}
                  {invoicePreview?.invoiceMonth || draft.invoiceMonth || 'calculada ao salvar'}.
                  Após o fechamento, passa à seguinte.
                </small>
              )}
            </label>
            <label className="field">
              Essencial?
              <select
                value={draft.essential === undefined ? '' : String(draft.essential)}
                onChange={(e) =>
                  setDraft((c) => {
                    const n = { ...c };
                    if (e.target.value === '') delete n.essential;
                    else n.essential = e.target.value === 'true';
                    return n;
                  })
                }
              >
                <option value="">Não classificado</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </label>
            <label className="field">
              Evento (opcional)
              <select
                value={draft.eventId || ''}
                onChange={(e) => update('eventId', e.target.value)}
              >
                <option value="">Sem evento</option>
                {(data.events || [])
                  .filter((v) => v.scope === draft.workspace)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Com quem (classificação opcional)
              <input
                maxLength={120}
                value={draft.companion || ''}
                onChange={(e) => update('companion', e.target.value)}
                placeholder="Ex.: Família, amigos"
              />
              <small>Não altera participantes, pagador ou rateio.</small>
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
                  value={
                    draft.installments ? 'limited' : draft.recurrence ? 'recurrence' : 'unlimited'
                  }
                  onChange={(event) => setDuration(event.target.value)}
                >
                  <option value="unlimited">Sem prazo definido · conta mensal</option>
                  <option value="limited">Número de parcelas · compra ou financiamento</option>
                  <option value="recurrence">
                    Quantidade de meses · valor integral a cada mês
                  </option>
                </select>
              </label>
              {draft.installments && (
                <>
                  <label className="field">
                    Como informar o valor?
                    <select
                      value={draft.amountMode || 'installment'}
                      onChange={(e) =>
                        setDraft((c) => {
                          const next = { ...c, amountMode: e.target.value };
                          if (c.purchaseTotal !== undefined) {
                            next.amount = (
                              e.target.value === 'total'
                                ? c.purchaseTotal / 100
                                : installmentAmount(
                                    c.purchaseTotal,
                                    Number(c.installments.total),
                                    Number(c.installments.current),
                                  ) / 100
                            ).toFixed(2);
                            if (e.target.value === 'installment') delete next.purchaseTotal;
                          }
                          return next;
                        })
                      }
                    >
                      <option value="installment">Valor de uma parcela · opção atual</option>
                      <option value="total">
                        Valor total da compra · dividir com ajuste de centavos
                      </option>
                    </select>
                  </label>
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
                    O modo de uma parcela mantém o valor informado em cada mês. No modo total, os
                    centavos restantes são distribuídos nas primeiras parcelas para conservar o
                    valor da compra.
                  </p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.generateFuture)}
                      onChange={(e) => update('generateFuture', e.target.checked)}
                    />
                    Gerar parcelas futuras como pendentes (até 600)
                  </label>
                </>
              )}
              {draft.recurrence && (
                <div className="form-grid">
                  <label className="field">
                    Quantidade de meses
                    <input
                      type="number"
                      min="1"
                      required
                      value={draft.recurrence.total}
                      onChange={(e) =>
                        update('recurrence', { ...draft.recurrence, total: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Mês atual da recorrência
                    <input
                      type="number"
                      min="1"
                      max={draft.recurrence.total}
                      required
                      value={draft.recurrence.current}
                      onChange={(e) =>
                        update('recurrence', { ...draft.recurrence, current: e.target.value })
                      }
                    />
                  </label>
                  <p className="hint">
                    O valor integral se repete, inclusive na virada do ano. Valores variáveis
                    continuam exigindo revisão.
                  </p>
                </div>
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
          {completePreview ? (
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
            <p>
              {previewError ||
                (draft.amount
                  ? 'Atualizando a divisão…'
                  : 'Preencha o valor para conferir antes de salvar.')}
            </p>
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
