import React from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';
export function MonthlySummary({ stats, mode, benefits }) {
  const cards =
    mode === 'group'
      ? [
          ['Contas do mês', stats.total, 'Total das despesas do grupo'],
          ['Contas pagas', stats.paid, 'Pagamentos das contas já registrados'],
          ['Contas pendentes', stats.pending, 'Contas que ainda precisam ser pagas'],
          ['Guardado no mês', stats.savingsThisMonth, 'Reservas do grupo'],
        ]
      : [
          ['Renda em dinheiro', stats.income, 'Renda e adicionais líquidos'],
          ['Gastos previstos', stats.total, 'Pessoais + suas cotas nos grupos'],
          ['Guardado no mês', stats.savingsThisMonth, 'Aportes registrados neste espaço'],
          ['Disponível previsto', stats.available, 'Renda − gastos − aportes'],
        ];
  return (
    <>
      <section className="summary-grid" aria-label="Resumo mensal">
        {cards.map(([title, amount, hint]) => (
          <article className="card summary-card" key={title}>
            <p className="muted">{title}</p>
            <strong className={'amount ' + (amount < 0 ? 'metric-negative' : '')}>
              {money(amount)}
            </strong>
            <small>{hint}</small>
          </article>
        ))}
      </section>
      {mode !== 'group' && benefits?.total > 0 && (
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
