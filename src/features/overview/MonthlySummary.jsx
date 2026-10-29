import React from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';
export function MonthlySummary({ stats, mode, benefits }) {
  return (
    <>
      <section className="summary-grid" aria-label="Resumo mensal">
        {[
          [
            'Renda em dinheiro',
            stats.income,
            mode === 'group' ? 'Rendas e adicionais líquidos' : 'Renda e adicionais líquidos',
          ],
          [
            'Gastos previstos',
            stats.total,
            mode === 'group' ? 'Contas do grupo selecionado' : 'Pessoais + suas cotas nos grupos',
          ],
          ['Guardado no mês', stats.savingsThisMonth, 'Aportes registrados neste espaço'],
          ['Disponível previsto', stats.available, 'Renda − gastos − aportes'],
        ].map(([title, amount, hint]) => (
          <article className="card summary-card" key={title}>
            <p className="muted">{title}</p>
            <strong className={'amount ' + (amount < 0 ? 'metric-negative' : '')}>
              {money(amount)}
            </strong>
            <small>{hint}</small>
          </article>
        ))}
      </section>
      {benefits?.total > 0 && (
        <aside className="benefits-note" aria-label="Benefícios de alimentação do mês">
          <div>
            <strong>VA / VR do mês · {money(benefits.total)}</strong>
            <p>
              VA: {money(benefits.foodAllowance)} · VR: {money(benefits.mealAllowance)}
            </p>
          </div>
          <small>
            Benefícios informados para alimentação. Não entram na renda em dinheiro nem no rateio.
          </small>
        </aside>
      )}
    </>
  );
}
