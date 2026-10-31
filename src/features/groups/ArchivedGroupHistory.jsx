import React from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';
import { MonthlyComparisonPanel } from '../comparison/MonthlyComparisonPanel.jsx';

export function ArchivedGroupHistory({ data, group, month, stats, error, tab }) {
  const name = (id) => data.people.find((person) => person.id === id)?.name || 'Participante';
  const scope = `group:${group.id}`;
  const expenses = data.expenses.filter(
    (item) => item.workspace === scope && item.date.startsWith(month),
  );
  const transfers = data.settlements.filter(
    (item) => item.scope === scope && item.referenceMonth === month,
  );
  const plan = data.plans[`${scope}|${month}`];
  const goals = data.goals.filter((item) => item.scope === scope);
  const contributions = data.contributions.filter(
    (item) => item.scope === scope && item.date.startsWith(month),
  );
  return (
    <section className="panel">
      <p className="eyebrow">SOMENTE CONSULTA</p>
      <h2>{group.name} · grupo excluído</h2>
      <p className="muted">
        Os acessos foram bloqueados. O histórico financeiro permanece preservado; não é possível
        adicionar despesas ou alterar este grupo.
      </p>
      {tab === 'comparison' ? (
        <MonthlyComparisonPanel {...{ data, scope, month }} mode="group" />
      ) : (
        <>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {plan && (
            <>
              <h3>Orçamento preservado</h3>
              <p>
                Limite de gastos: {money(plan.spendingLimit || 0)} · Meta de guardar:{' '}
                {money(plan.savingTarget || 0)}
              </p>
            </>
          )}
          {goals.length > 0 && (
            <>
              <h3>Metas do grupo</h3>
              <ul>
                {goals.map((item) => (
                  <li key={item.id}>
                    {item.title} · {money(item.target)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {contributions.length > 0 && (
            <>
              <h3>Aportes nesta competência</h3>
              <ul>
                {contributions.map((item) => (
                  <li key={item.id}>
                    {item.date.split('-').reverse().join('/')} · {money(item.amount)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {stats && (
            <div className="notice">
              <p>
                Despesas do mês: <strong>{money(stats.total)}</strong> · Pagas: {money(stats.paid)}{' '}
                · Pendentes: {money(stats.pending)}
              </p>
            </div>
          )}
          <h3>Despesas de {month.split('-').reverse().join('/')}</h3>
          {expenses.length ? (
            <ul className="sharing-record-list">
              {expenses.map((item) => (
                <li className="sharing-record" key={item.id}>
                  <div className="sharing-record-info">
                    <strong>{item.description}</strong>
                    <span>
                      {item.date.split('-').reverse().join('/')} ·{' '}
                      {item.status === 'paid' ? 'Paga' : 'Pendente'} · Pagador: {name(item.payer)}
                    </span>
                  </div>
                  <strong>{money(item.amount)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Nenhuma despesa neste mês.</p>
          )}
          <h3>Histórico de repasses</h3>
          {transfers.length ? (
            <ul className="sharing-record-list">
              {transfers.map((item) => (
                <li className="sharing-record" key={item.id}>
                  <span>
                    {name(item.from)} → {name(item.to)} ·{' '}
                    {item.status === 'confirmed' ? 'Confirmado' : 'Estornado'}
                  </span>
                  <strong>{money(item.amount)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Nenhum repasse nesta competência.</p>
          )}
          {stats && (
            <>
              <h3>Saldos preservados</h3>
              <ul>
                {group.memberIds.map((id) => (
                  <li key={id}>
                    {name(id)}: {money(Math.abs(stats.balances[id] || 0))}{' '}
                    {(stats.balances[id] || 0) > 0
                      ? 'a receber'
                      : (stats.balances[id] || 0) < 0
                        ? 'a devolver'
                        : '· acertado'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
