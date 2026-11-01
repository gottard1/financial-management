import React, { useState } from 'react';
import { money, parseMoney } from '../../domain/expenses/expenseCalculations.js';
import { Progress } from '../../components/ui/Progress.jsx';
export { Progress } from '../../components/ui/Progress.jsx';
import { CATEGORIES } from '../../shared/constants/categories.js';
const value = (c) => (c / 100).toFixed(2).replace('.', ',');
export function BudgetPanel({ data, setData, scope, month, stats, notify }) {
  const plan = data.plans[scope + '|' + month] || {};
  const [error, setError] = useState('');
  async function save(e) {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget),
        categories = {};
      CATEGORIES.forEach((c) => (categories[c] = parseMoney(String(f.get(c) || '0'))));
      const spendingLimit = parseMoney(f.get('spendingLimit')),
        savingTarget = parseMoney(f.get('savingTarget'));
      await setData((d) => ({
        ...d,
        plans: { ...d.plans, [scope + '|' + month]: { spendingLimit, savingTarget, categories } },
      }));
      setError('');
      notify('Orçamento e meta mensal salvos.');
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <section className="panel budget-panel">
      <p className="eyebrow">O PLANO DO MÊS</p>
      <h2>Decida o destino do seu dinheiro</h2>
      <p className="muted">
        O orçamento compara contas pagas e pendentes com o limite. Dinheiro guardado é acompanhado
        separadamente.
      </p>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            Limite total de gastos (R$)
            <input
              name="spendingLimit"
              required
              inputMode="decimal"
              defaultValue={value(plan.spendingLimit || 0)}
            />
            <small>Zero significa sem limite definido.</small>
          </label>
          <label className="field">
            Meta de guardar neste mês (R$)
            <input
              name="savingTarget"
              required
              inputMode="decimal"
              defaultValue={value(plan.savingTarget || 0)}
            />
          </label>
        </div>
        <div className="two-col">
          <div className="income-breakdown">
            <h3>Limite de gastos</h3>
            <strong>{money(stats.total)}</strong>
            <Progress
              amount={stats.total}
              target={plan.spendingLimit || 0}
              label="Uso do orçamento"
            />
            {plan.spendingLimit > 0 && (
              <p
                className={stats.total > plan.spendingLimit ? 'metric-negative' : 'metric-positive'}
              >
                {stats.total > plan.spendingLimit ? 'Acima do limite em ' : 'Ainda cabem '}
                {money(Math.abs(plan.spendingLimit - stats.total))}
              </p>
            )}
          </div>
          <div className="income-breakdown">
            <h3>Reserva do mês</h3>
            <strong>{money(stats.savingsThisMonth)}</strong>
            <Progress
              amount={stats.savingsThisMonth}
              target={plan.savingTarget || 0}
              label="Meta mensal de economia"
            />
          </div>
        </div>
        <h3>Limites por categoria</h3>
        <p className="muted">
          Os limites das categorias são independentes do limite total; não são somados como
          despesas.
        </p>
        <div className="form-grid">
          {CATEGORIES.map((c) => (
            <label className="field" key={c}>
              {c}
              <input
                name={c}
                required
                inputMode="decimal"
                defaultValue={value(plan.categories?.[c] || 0)}
              />
              <small>
                Comprometido: {money(stats.categories[c] || 0)}
                {plan.categories?.[c] > 0
                  ? ` · ${stats.categories[c] > plan.categories[c] ? 'Acima do limite' : 'Dentro do limite'}`
                  : ''}
              </small>
            </label>
          ))}
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary">Salvar orçamento</button>
        </div>
      </form>
    </section>
  );
}
