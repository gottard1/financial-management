import React, { useState } from 'react';
import {
  consolidatedExpenses,
  consolidatedTotals,
} from '../../domain/expenses/consolidatedExpenses.js';
import { money } from '../../domain/expenses/expenseCalculations.js';
import { paymentSource, paymentSources } from '../../domain/benefits/benefitPayments.js';

export function ConsolidatedExpensesPanel({
  data,
  personId,
  month,
  remoteGroups,
  accountUid,
  onOpen,
  sharingError,
  sharingLoading,
}) {
  const [origin, setOrigin] = useState('all'),
    [status, setStatus] = useState('all'),
    [category, setCategory] = useState('all'),
    [essential, setEssential] = useState(false),
    [source, setSource] = useState('all');
  const rows = consolidatedExpenses(data, personId, month, remoteGroups, accountUid);
  const visible = rows.filter(
    (r) =>
      (origin === 'all' || r.originKey === origin) &&
      (status === 'all' || r.status === status) &&
      (category === 'all' || r.category === category) &&
      (!essential || r.essential) &&
      (source === 'all' || paymentSource(r.expense) === source),
  );
  const totals = consolidatedTotals(visible);
  const amount = (row) => (row.error ? 'Cota indisponível' : money(row.ownAmount));
  return (
    <div className="content-stack consolidated-expenses">
      <section className="panel finance-panel">
        <h2>Minhas despesas pessoais e em grupo</h2>
        <p className="muted">
          Uma lista para os seus gastos no mês. Nas despesas compartilhadas, o resumo soma somente
          sua parte. O valor total da conta aparece separadamente.
        </p>
        <div className="summary-grid summary-grid--three">
          {[
            ['Pessoais', totals.personal],
            ['Minha parte nos grupos', totals.shared],
            ['Total da minha responsabilidade', totals.total],
          ].map(([label, value]) => (
            <article className="card summary-card" key={label}>
              <p>{label}</p>
              <strong className="amount">{money(value)}</strong>
            </article>
          ))}
        </div>
        {totals.benefits > 0 && (
          <p className="notice">
            Da sua responsabilidade: {money(totals.cash)} em dinheiro e {money(totals.benefits)}{' '}
            cobertos pelo seu VA/VR. O consumo total acima inclui ambos.
          </p>
        )}
        {sharingLoading && (
          <p className="notice" role="status">
            Carregando despesas dos grupos compartilhados. Os totais ainda são parciais.
          </p>
        )}
        {(totals.incomplete || sharingError) && (
          <p className="notice error" role="alert">
            Total parcial.{' '}
            {sharingError ||
              'Uma ou mais cotas precisam ser atualizadas no grupo antes de entrar no total.'}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Todas as despesas de {month.split('-').reverse().join('/')}</h2>
        <div className="expense-filters">
          <label className="field">
            Fonte do pagamento
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="all">Todas as fontes</option>
              {Object.entries(paymentSources).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Origem
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="all">Pessoais e todos os grupos</option>
              <option value="personal">Somente pessoais</option>
              {[
                ...new Map(
                  rows.filter((r) => r.kind === 'group').map((r) => [r.originKey, r.origin]),
                ).entries(),
              ].map(([key, name]) => (
                <option value={key} key={key}>
                  {name}
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
              {[...new Set(rows.map((r) => r.category))].sort().map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="checkbox-label expense-essential-filter">
            <input
              type="checkbox"
              checked={essential}
              onChange={(e) => setEssential(e.target.checked)}
            />
            Somente essenciais
          </label>
        </div>
        {visible.length === 0 ? (
          <p className="empty">Nenhuma despesa neste mês e filtros.</p>
        ) : (
          <>
            <div className="table-wrap expense-desktop-table">
              <table>
                <thead>
                  <tr>
                    <th>Despesa / origem</th>
                    <th>Vencimento</th>
                    <th>Minha parte</th>
                    <th>Total da conta</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <strong>{row.description}</strong>
                        <br />
                        <small>
                          {row.origin} · {row.category}
                          {' · '}
                          {paymentSources[paymentSource(row.expense)]}
                        </small>
                        {row.error && <p className="metric-negative">{row.error}</p>}
                      </td>
                      <td>{row.date.split('-').reverse().join('/')}</td>
                      <td>{amount(row)}</td>
                      <td>{money(row.totalAmount)}</td>
                      <td>
                        <span className={'pill ' + row.status}>
                          {row.status === 'paid' ? 'Paga' : 'Pendente'}
                        </span>
                      </td>
                      <td>
                        <button className="button secondary" onClick={() => onOpen(row)}>
                          Abrir origem
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="expense-mobile-list">
              {visible.map((row) => (
                <li className="expense-mobile-card" key={row.key}>
                  <h3>{row.description}</h3>
                  <p>
                    {row.origin} · {row.category}
                    {' · '}
                    {paymentSources[paymentSource(row.expense)]}
                  </p>
                  <p>Vence em {row.date.split('-').reverse().join('/')}</p>
                  <p>
                    Minha parte: <strong>{amount(row)}</strong>
                    <br />
                    Total da conta: {money(row.totalAmount)}
                  </p>
                  <span className={'pill ' + row.status}>
                    {row.status === 'paid' ? 'Paga' : 'Pendente'}
                  </span>
                  {row.error && <p role="alert">{row.error}</p>}
                  <div className="actions">
                    <button className="button secondary" onClick={() => onOpen(row)}>
                      Abrir origem
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="hint consolidated-payment-note">
          Pagamentos feitos por você nas contas exibidas: {money(totals.paidByMe)}. Esse valor pode
          incluir partes de outras pessoas e não é somado novamente à sua responsabilidade.
        </p>
      </section>
    </div>
  );
}
