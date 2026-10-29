import React, { useState } from 'react';
import { compareMonths, shiftMonth } from '../../domain/budget/monthlyComparison.js';
import { money } from '../../domain/expenses/expenseCalculations.js';

const monthLabel = (month) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
    new Date(`${month}-01T12:00:00Z`),
  );

export function MonthlyComparisonPanel({ data, scope, month, mode }) {
  const [start, setStart] = useState(() => shiftMonth(month, -5));
  const [end, setEnd] = useState(month);
  let comparison,
    error = '';
  try {
    comparison = compareMonths(data, scope, start, end);
  } catch (err) {
    error = err.message;
  }
  const max = comparison
    ? Math.max(1, ...comparison.rows.filter((row) => !row.error).map((row) => row.total))
    : 1;
  return (
    <section className="comparison-panel" aria-labelledby="comparison-title">
      <header className="panel">
        <p className="eyebrow">SEU HISTÓRICO EM PERSPECTIVA</p>
        <h2 id="comparison-title">Comparar meses</h2>
        <p className="muted">
          {mode === 'group'
            ? 'Compare as despesas do grupo selecionado.'
            : 'Compare suas despesas pessoais e sua parte nas contas dos grupos.'}{' '}
          Valores pagos e pendentes entram no mês de vencimento. Meses sem lançamentos aparecem com
          zero.
        </p>
        <div className="comparison-filters">
          <label className="field">
            De
            <input
              type="month"
              min="2000-01"
              max="2099-12"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label className="field">
            Até
            <input
              type="month"
              min="2000-01"
              max="2099-12"
              required
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <div className="actions">
            <button
              className="button secondary"
              onClick={() => {
                setStart(shiftMonth(month, -5));
                setEnd(month);
              }}
            >
              Últimos 6 meses
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setStart(shiftMonth(month, -11));
                setEnd(month);
              }}
            >
              Últimos 12 meses
            </button>
          </div>
        </div>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {comparison && (
        <>
          {comparison.rows.some((row) => row.error) && (
            <p className="notice error" role="alert">
              Há meses com rateios que precisam de revisão. Eles estão identificados nas tabelas e
              não entram nos totais do período.
            </p>
          )}
          <div className="comparison-metrics">
            <article className="panel">
              <span>Total do período</span>
              <strong>{money(comparison.total)}</strong>
              <small>
                Pago: {money(comparison.paid)} · Pendente: {money(comparison.pending)}
              </small>
            </article>
            <article className="panel">
              <span>Média mensal</span>
              <strong>{money(comparison.average)}</strong>
              <small>Considera os meses válidos, inclusive os sem lançamentos.</small>
            </article>
            <article className="panel">
              <span>Último mês × anterior</span>
              <strong>
                {comparison.delta === null
                  ? '—'
                  : `${comparison.delta > 0 ? '+' : comparison.delta < 0 ? '−' : ''}${money(Math.abs(comparison.delta))}`}
              </strong>
              <small>
                {comparison.deltaPercent === null
                  ? 'Sem base percentual para comparar.'
                  : `${Math.abs(comparison.deltaPercent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% ${comparison.delta > 0 ? 'a mais' : comparison.delta < 0 ? 'a menos' : 'de variação'}`}
              </small>
            </article>
          </div>
          <section className="panel">
            <h3>Evolução dos gastos</h3>
            <div
              className="comparison-chart"
              role="img"
              aria-label="Gastos por mês. Os valores detalhados estão na tabela abaixo."
            >
              {comparison.rows.map((row) => (
                <div className="comparison-chart-column" key={row.month}>
                  <small>{row.error ? 'Revisar' : money(row.total)}</small>
                  <div className="comparison-chart-track">
                    <div
                      className={'comparison-chart-bar' + (row.error ? ' invalid' : '')}
                      style={{ height: `${row.error ? 3 : Math.max(2, (row.total / max) * 100)}%` }}
                    />
                  </div>
                  <span>{monthLabel(row.month)}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h3>Resumo mensal</h3>
            <div className="comparison-table-wrap">
              <table className="comparison-table">
                <caption className="sr-only">Renda em dinheiro e despesas por mês</caption>
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col">Renda em dinheiro</th>
                    <th scope="col">Gastos</th>
                    <th scope="col">Pagos</th>
                    <th scope="col">Pendentes</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.month}>
                      <th scope="row">{monthLabel(row.month)}</th>
                      {row.error ? (
                        <td colSpan={4}>Revisar: {row.error}</td>
                      ) : (
                        <>
                          <td>{money(row.income)}</td>
                          <td>
                            <strong>{money(row.total)}</strong>
                          </td>
                          <td>{money(row.paid)}</td>
                          <td>{money(row.pending)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h3>Gastos por categoria</h3>
            {comparison.categories.length ? (
              <div className="comparison-table-wrap">
                <table className="comparison-table">
                  <caption className="sr-only">Comparação de categorias mês a mês</caption>
                  <thead>
                    <tr>
                      <th scope="col">Categoria</th>
                      {comparison.rows.map((row) => (
                        <th scope="col" key={row.month}>
                          {monthLabel(row.month)}
                        </th>
                      ))}
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.categories.map((category) => (
                      <tr key={category.name}>
                        <th scope="row">{category.name}</th>
                        {category.values.map((value, index) => (
                          <td key={comparison.rows[index].month}>
                            {value === null ? 'Revisar' : money(value)}
                          </td>
                        ))}
                        <td>
                          <strong>{money(category.total)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">Nenhuma despesa por categoria neste período.</div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
