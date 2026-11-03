import React, { useState } from 'react';
import { MoneyInput } from '../../components/ui/FormattedInput.jsx';
import { money, parseMoney } from '../../domain/expenses/expenseCalculations.js';
import { consolidatedExpenses } from '../../domain/expenses/consolidatedExpenses.js';
import { defaultIncomeConfig } from '../../domain/budget/workspaceCalculations.js';
import { sumRestrictedBenefits } from '../../domain/income/calculateCompensation.js';
import {
  benefitUsage,
  paymentSource,
  paymentSources,
} from '../../domain/benefits/benefitPayments.js';

export function BenefitsPanel({
  data,
  setData,
  personId,
  month,
  remoteGroups,
  accountUid,
  sharingError,
  sharingLoading,
  onOpen,
  onNew,
  notify,
}) {
  const config = data.incomeConfigs[month]?.[personId] || {};
  const [source, setSource] = useState('all'),
    [status, setStatus] = useState('all'),
    [category, setCategory] = useState('all'),
    [error, setError] = useState('');
  const rows = consolidatedExpenses(data, personId, month, remoteGroups, accountUid);
  const usage = benefitUsage(rows, config);
  const expenses = usage
    .flatMap((item) => item.expenses)
    .sort((a, b) => a.date.localeCompare(b.date));
  const visible = expenses.filter(
    (r) =>
      (source === 'all' || paymentSource(r.expense) === source) &&
      (status === 'all' || r.status === status) &&
      (category === 'all' || r.category === category),
  );
  const categories = [
    ...new Set(visible.filter((r) => r.status === 'paid').map((r) => r.category)),
  ].sort();
  const categoryTotals = categories.map((name) => [
    name,
    visible
      .filter((r) => r.status === 'paid' && r.category === name)
      .reduce((n, r) => n + BigInt(r.totalAmount), 0n),
  ]);
  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const foodAllowance = parseMoney(form.get('foodAllowance')),
        mealAllowance = parseMoney(form.get('mealAllowance'));
      sumRestrictedBenefits([{ foodAllowance, mealAllowance }]);
      await setData((current) => ({
        ...current,
        incomeConfigs: {
          ...current.incomeConfigs,
          [month]: {
            ...current.incomeConfigs[month],
            [personId]: {
              ...(current.incomeConfigs[month]?.[personId] ||
                defaultIncomeConfig(current.months[month]?.[personId] || 0)),
              foodAllowance,
              mealAllowance,
            },
          },
        },
      }));
      setError('');
      notify('VA/VR do mês atualizado. Sua renda em dinheiro foi preservada.');
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="content-stack benefits-panel">
      <section className="panel finance-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">BENEFÍCIOS DE ALIMENTAÇÃO</p>
            <h2>Meu VA / VR · {month.split('-').reverse().join('/')}</h2>
          </div>
          <button className="button primary" onClick={onNew}>
            + Despesa com vale
          </button>
        </div>
        <p className="muted">
          Acompanhe onde você usa seus vales, separado do dinheiro. Nos grupos, aparece o valor
          total pago com o seu vale; as cotas e os acertos continuam no grupo.
        </p>
        {(sharingLoading || sharingError) && (
          <p
            className={'notice' + (sharingError ? ' error' : '')}
            role={sharingError ? 'alert' : 'status'}
          >
            Totais parciais dos grupos. {sharingError || 'Carregando despesas compartilhadas…'}
          </p>
        )}
        <div className="summary-grid benefits-summary">
          {usage.map((item) => (
            <article className="card summary-card" key={item.source}>
              <h3>{paymentSources[item.source]}</h3>
              <dl className="benefit-values">
                {[
                  ['Valor informado no mês', item.credit],
                  ['Gasto · contas pagas', item.spent],
                  ['Restante no mês', item.remaining],
                  ['Compromissos pendentes', item.pending],
                  ['Restante após pendências', item.forecast],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd className={value < 0 ? 'metric-negative' : ''}>{money(value)}</dd>
                  </div>
                ))}
              </dl>
              {item.forecast < 0 && (
                <p className="notice error">
                  Os gastos e compromissos superam o valor informado. Revise o benefício ou os
                  lançamentos.
                </p>
              )}
            </article>
          ))}
        </div>
        <p className="hint">
          Controle por mês do lançamento. Pendências só consomem o vale quando pagas. Não transfere
          sobras de meses anteriores automaticamente nem representa o saldo da operadora.
        </p>
        <form onSubmit={save}>
          <fieldset className="form-section">
            <legend>VA / VR informado neste mês</legend>
            <div className="form-grid">
              {usage.map((item) => (
                <label className="field" key={item.source}>
                  {paymentSources[item.source]} (R$)
                  <MoneyInput
                    required
                    name={item.source}
                    defaultValue={`${BigInt(item.credit) / 100n},${String(BigInt(item.credit) % 100n).padStart(2, '0')}`}
                  />
                </label>
              ))}
            </div>
            <p className="hint">
              São os mesmos valores do perfil de renda deste mês; não há crédito em duplicidade.
              Alterações não afetam outros meses ou o salário.
            </p>
            <button className="button secondary">Salvar valores do vale</button>
          </fieldset>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
      <section className="panel">
        <h2>Em que gastei o vale?</h2>
        <div className="expense-filters">
          <label className="field">
            Vale
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="all">VA e VR</option>
              {usage.map((item) => (
                <option key={item.source} value={item.source}>
                  {paymentSources[item.source]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Situação
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Pagas e pendentes</option>
              <option value="paid">Pagas</option>
              <option value="pending">Pendentes</option>
            </select>
          </label>
          <label className="field">
            Categoria
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">Todas</option>
              {[...new Set(expenses.map((r) => r.category))].sort().map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>
        <h3>Gastos pagos por categoria neste filtro</h3>
        {!categoryTotals.length ? (
          <p className="muted">Ainda não há pagamentos com VA/VR neste filtro.</p>
        ) : (
          <ul className="benefit-category-list">
            {categoryTotals.map(([name, amount]) => (
              <li key={name}>
                <span>{name}</span>
                <strong>{money(Number(amount))}</strong>
              </li>
            ))}
          </ul>
        )}
        {!visible.length ? (
          <p className="empty">Nenhuma despesa com seu vale neste mês e filtros.</p>
        ) : (
          <ul className="benefit-expense-list">
            {visible.map((row) => (
              <li className="card" key={row.key}>
                <div className="benefit-expense-header">
                  <div>
                    <h3>{row.description}</h3>
                    <p className="muted">
                      {row.date.split('-').reverse().join('/')} · {row.origin} · {row.category}
                    </p>
                  </div>
                  <strong className="amount">{money(row.totalAmount)}</strong>
                </div>
                <p>
                  {paymentSources[paymentSource(row.expense)]} ·{' '}
                  <span className={'pill ' + row.status}>
                    {row.status === 'paid'
                      ? 'Paga · descontada do vale'
                      : 'Pendente · ainda não descontada'}
                  </span>
                </p>
                <button className="button secondary" onClick={() => onOpen(row)}>
                  Abrir origem
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
