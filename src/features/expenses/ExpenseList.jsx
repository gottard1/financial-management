import React from 'react';
import { recurrenceLabel } from '../../domain/expenses/recurringExpenses.js';
import { money, splitExpense } from '../../domain/expenses/expenseCalculations.js';

const splitLabels = {
  proportional: 'Proporcional à renda',
  equal: 'Partes iguais',
  custom: 'Percentual personalizado',
};

function ExpenseShares({ item, people }) {
  return (
    <>
      {item.shares ? (
        item.expense.participants.map((id) => (
          <div key={id}>
            <small>
              {people.find((person) => person.id === id)?.name}:{' '}
              <strong>{money(item.shares[id])}</strong>
            </small>
          </div>
        ))
      ) : (
        <small>Defina as rendas para conferir a divisão.</small>
      )}
      <small className="muted">{splitLabels[item.expense.split]}</small>
    </>
  );
}

function ExpenseStatus({ status }) {
  return <span className={'pill ' + status}>{status === 'paid' ? 'Paga' : 'Pendente'}</span>;
}

function ExpenseActions({ expense, onEdit, onDelete, canDelete = true, mobile = false }) {
  return (
    <div className={'actions' + (mobile ? ' expense-mobile-actions' : '')}>
      <button
        type="button"
        className="button secondary"
        onClick={() => onEdit(expense)}
        aria-label={'Editar despesa ' + expense.description}
      >
        Editar
      </button>
      {canDelete && (
        <button
          type="button"
          className="button danger"
          onClick={() => onDelete(expense)}
          aria-label={'Excluir despesa ' + expense.description}
        >
          Excluir
        </button>
      )}
    </div>
  );
}

export function ExpenseList({
  mode,
  data,
  person,
  group,
  memberIds,
  expenses,
  copyFixed,
  newExpense,
  filter,
  setFilter,
  visible,
  incomes,
  edit,
  setData,
  readOnly = false,
  canDelete = true,
}) {
  const shared = mode === 'group';
  const items = visible.map((expense) => {
    let shares = null;
    try {
      shares = expense.shares || (readOnly ? null : splitExpense(expense, incomes, memberIds));
    } catch {}
    return {
      expense,
      shares,
      date: expense.date.split('-').reverse().join('/'),
      payer:
        expense.status === 'paid'
          ? data.people.find((item) => item.id === expense.payer)?.name
          : 'Ainda não paga',
    };
  });

  function deleteExpense(expense) {
    if (confirm('Excluir a despesa ' + expense.description + '?')) {
      setData((current) => ({
        ...current,
        expenses: current.expenses.filter((item) => item.id !== expense.id),
      }));
    }
  }

  return (
    <section className="panel expenses-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">{shared ? 'CONTAS DO GRUPO' : 'GASTOS SÓ SEUS'}</p>
          <h2>
            {shared
              ? 'Despesas de ' + group.name
              : 'Despesas pessoais de ' + data.people.find((item) => item.id === person)?.name}{' '}
            <span className="pill">{expenses.length}</span>
          </h2>
        </div>
        {!readOnly && (
          <div className="actions">
            <button type="button" className="button secondary" onClick={copyFixed}>
              Trazer recorrentes do mês anterior
            </button>
            <button type="button" className="button primary" onClick={newExpense}>
              + Nova despesa
            </button>
          </div>
        )}
      </div>
      {!shared && (
        <p className="muted">
          Cadastre aqui seus gastos sem dividir. As despesas compartilhadas são cadastradas no grupo
          correspondente; sua parte em todos os grupos também aparece no seu resumo mensal.
        </p>
      )}
      <label className="field expense-filter">
        Mostrar
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">Todas as despesas</option>
          <option value="paid">Pagas</option>
          <option value="pending">Pendentes</option>
        </select>
      </label>
      {items.length === 0 ? (
        <div className="empty">
          <h3>
            {expenses.length ? 'Nenhuma despesa neste filtro.' : 'Comece com a primeira conta.'}
          </h3>
          <p>
            {expenses.length
              ? 'Escolha outro filtro para ver as demais contas.'
              : shared
                ? 'Escolha como dividir e quem pagou.'
                : 'Seu gasto, seu controle. Sem divisão obrigatória.'}
          </p>
          {expenses.length ? (
            <button type="button" className="button secondary" onClick={() => setFilter('all')}>
              Ver todas as despesas
            </button>
          ) : !readOnly ? (
            <button type="button" className="button primary" onClick={newExpense}>
              Adicionar despesa
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="table-wrap expense-desktop-table">
            <table className="expense-table">
              <thead>
                <tr>
                  <th>Despesa / vencimento</th>
                  <th>Valor</th>
                  {shared && <th>Divisão entre participantes</th>}
                  <th>Quem pagou</th>
                  <th>Status</th>
                  {!readOnly && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.expense.id}>
                    <td>
                      <strong>{item.expense.description}</strong>
                      <br />
                      <small>
                        {item.date} · {item.expense.category}
                        {item.expense.fixed ? ` · ${recurrenceLabel(item.expense)}` : ''}
                      </small>
                    </td>
                    <td>{money(item.expense.amount)}</td>
                    {shared && (
                      <td>
                        <ExpenseShares item={item} people={data.people} />
                      </td>
                    )}
                    <td>{item.payer}</td>
                    <td>
                      <ExpenseStatus status={item.expense.status} />
                    </td>
                    {!readOnly && (
                      <td>
                        <ExpenseActions
                          expense={item.expense}
                          onEdit={edit}
                          onDelete={deleteExpense}
                          canDelete={canDelete}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="expense-mobile-list" aria-label="Despesas do mês">
            {items.map((item) => (
              <li className="expense-mobile-card" key={item.expense.id}>
                <div className="expense-mobile-header">
                  <h3>{item.expense.description}</h3>
                  <strong className="amount">{money(item.expense.amount)}</strong>
                </div>
                <div className="expense-mobile-meta">
                  <span>
                    Vence em {item.date} · {item.expense.category}
                    {item.expense.fixed ? ` · ${recurrenceLabel(item.expense)}` : ''}
                  </span>
                  <ExpenseStatus status={item.expense.status} />
                </div>
                {shared && (
                  <div className="expense-mobile-shares">
                    <ExpenseShares item={item} people={data.people} />
                  </div>
                )}
                <p className="muted">
                  {item.expense.status === 'paid' ? (
                    <>
                      Pago por <strong>{item.payer}</strong>
                    </>
                  ) : (
                    'Pagamento ainda não registrado.'
                  )}
                </p>
                {!readOnly && (
                  <ExpenseActions
                    expense={item.expense}
                    onEdit={edit}
                    onDelete={deleteExpense}
                    canDelete={canDelete}
                    mobile
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
