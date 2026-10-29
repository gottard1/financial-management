import React, { useState } from 'react';
import { money, parseMoney } from '../../domain/expenses/expenseCalculations.js';
import { Progress } from '../../components/ui/Progress.jsx';
import { CATEGORIES } from '../../shared/constants/categories.js';
const value = (c) => (c / 100).toFixed(2).replace('.', ',');
export function SavingsPanel({ data, setData, scope, month, stats, notify }) {
  const [error, setError] = useState('');
  const goals = data.goals.filter((g) => g.scope === scope),
    contributions = data.contributions.filter((c) => c.scope === scope),
    monthly = contributions.filter((c) => c.date.startsWith(month));
  function goal(e) {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget),
        target = parseMoney(f.get('target')),
        title = String(f.get('title')).trim();
      if (!title || target <= 0) throw Error('Informe um nome e uma meta maior que zero.');
      setData((d) => ({
        ...d,
        goals: [
          ...d.goals,
          {
            id: crypto.randomUUID(),
            scope,
            title,
            target,
            targetDate: String(f.get('targetDate')),
          },
        ],
      }));
      e.currentTarget.reset();
      setError('');
      notify('Meta criada. Registre aportes para acompanhar seu progresso.');
    } catch (err) {
      setError(err.message);
    }
  }
  function contribute(e) {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget),
        amount = parseMoney(f.get('amount')),
        date = String(f.get('date')),
        goalId = String(f.get('goalId'));
      if (amount <= 0) throw Error('O aporte deve ser maior que zero.');
      if (!date.startsWith(month)) throw Error('Escolha uma data no mês selecionado.');
      setData((d) => ({
        ...d,
        contributions: [
          ...d.contributions,
          {
            id: crypto.randomUUID(),
            scope,
            amount,
            date,
            goalId,
            note: String(f.get('note')).trim(),
          },
        ],
      }));
      e.currentTarget.reset();
      setError('');
      notify('Dinheiro guardado registrado. O disponível do mês foi atualizado.');
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <>
      <div className="summary-grid">
        {[
          ['Guardado neste mês', stats.savingsThisMonth],
          ['Acumulado registrado', stats.savingsAll],
          ['Disponível previsto', stats.available],
        ].map(([label, amount]) => (
          <article className="card summary-card" key={label}>
            <p>{label}</p>
            <strong className="amount">{money(amount)}</strong>
            <small>
              {label === 'Acumulado registrado'
                ? 'Soma dos aportes deste espaço, de todos os meses'
                : 'Considera apenas este espaço'}
            </small>
          </article>
        ))}
      </div>
      <div className="notice">
        <p>
          Guardar dinheiro não é uma despesa: os aportes reduzem o disponível, mas ficam fora dos
          gastos. Registre aqui valores efetivamente reservados. O acumulado não inclui rendimentos
          nem retiradas.
        </p>
      </div>
      <div className="two-col">
        <section className="panel">
          <h2>Registrar dinheiro guardado</h2>
          <form onSubmit={contribute}>
            <div className="form-grid">
              <label className="field">
                Valor (R$)
                <input name="amount" inputMode="decimal" required placeholder="0,00" />
              </label>
              <label className="field">
                Data
                <input name="date" type="date" required defaultValue={month + '-01'} />
              </label>
              <label className="field">
                Destino
                <select name="goalId">
                  <option value="">Reserva livre</option>
                  {goals.map((g) => (
                    <option value={g.id} key={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Observação
                <input name="note" maxLength={120} placeholder="Ex.: reserva de emergência" />
              </label>
            </div>
            <div className="form-actions">
              <button className="button primary">Registrar aporte</button>
            </div>
          </form>
        </section>
        <section className="panel">
          <h2>Criar uma meta</h2>
          <form onSubmit={goal}>
            <div className="form-grid">
              <label className="field">
                Nome da meta
                <input name="title" required maxLength={80} placeholder="Ex.: Viagem de férias" />
              </label>
              <label className="field">
                Valor desejado (R$)
                <input name="target" required inputMode="decimal" placeholder="0,00" />
              </label>
              <label className="field">
                Prazo desejado (opcional)
                <input name="targetDate" type="date" />
              </label>
            </div>
            <div className="form-actions">
              <button className="button secondary">Criar meta</button>
            </div>
          </form>
        </section>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      <div className="goal-grid">
        {goals.map((g) => {
          const saved = contributions
            .filter((c) => c.goalId === g.id)
            .reduce((sum, c) => sum + c.amount, 0);
          return (
            <article className="goal-card panel" key={g.id}>
              <div className="section-heading">
                <h3>{g.title}</h3>
                <button
                  className="button danger"
                  aria-label={'Excluir meta ' + g.title}
                  onClick={() => {
                    if (contributions.some((c) => c.goalId === g.id)) {
                      setError('Exclua os aportes vinculados antes de excluir esta meta.');
                      return;
                    }
                    if (confirm('Excluir esta meta?'))
                      setData((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== g.id) }));
                  }}
                >
                  ×
                </button>
              </div>
              <strong className="amount">{money(saved)}</strong>
              <Progress amount={saved} target={g.target} label={'Meta ' + g.title} />
              <p>{saved >= g.target ? 'Meta alcançada!' : 'Faltam ' + money(g.target - saved)}</p>
              {g.targetDate && <small>Prazo: {g.targetDate.split('-').reverse().join('/')}</small>}
            </article>
          );
        })}
      </div>
      <section className="panel">
        <h2>Aportes do mês</h2>
        {monthly.length === 0 ? (
          <div className="empty">Nenhum aporte registrado neste mês.</div>
        ) : (
          <ul className="compact-list">
            {monthly.map((c) => (
              <li className="contribution-item" key={c.id}>
                <div>
                  <strong>{money(c.amount)}</strong>
                  <p>
                    {goals.find((g) => g.id === c.goalId)?.title || 'Reserva livre'} ·{' '}
                    {c.date.split('-').reverse().join('/')}
                  </p>
                  <small>{c.note}</small>
                </div>
                <button
                  className="button danger"
                  onClick={() => {
                    if (confirm('Excluir este aporte? O valor deixará de contar como guardado.'))
                      setData((d) => ({
                        ...d,
                        contributions: d.contributions.filter((x) => x.id !== c.id),
                      }));
                  }}
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
