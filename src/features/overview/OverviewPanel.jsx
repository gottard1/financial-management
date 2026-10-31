import React from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';
import { Progress } from '../../components/ui/Progress.jsx';
export function OverviewPanel({ stats, mode, plan, data, go, scope, readOnly = false }) {
  const groupMode = mode === 'group';
  const categories = Object.entries(stats.categories || {}).sort((a, b) => b[1] - a[1]);
  const group = data.groups.find((item) => 'group:' + item.id === scope);
  const members = (group?.memberIds || [])
    .map((id) => data.people.find((person) => person.id === id))
    .filter(Boolean);
  const nameOf = (id) =>
    data.people.find((person) => person.id === id)?.name || 'Pessoa cadastrada';
  const transfers = stats.transfers || [];
  return (
    <>
      <section className="two-col overview-grid">
        <article className="panel overview-panel">
          <header>
            <p className="eyebrow">COMO ESTÁ SEU MÊS</p>
            <h2>{groupMode ? 'Os compromissos do grupo' : 'Seu orçamento em detalhes'}</h2>
          </header>
          <div className="overview-metrics">
            <div className="overview-metric">
              <span>{groupMode ? 'Contas já pagas' : 'Sua parte já quitada'}</span>
              <strong>{money(stats.paid)}</strong>
            </div>
            <div className="overview-metric">
              <span>{groupMode ? 'Contas pendentes' : 'Sua parte pendente'}</span>
              <strong>{money(stats.pending)}</strong>
            </div>
          </div>
          {!groupMode && (
            <section className="overview-section">
              <h3>O que compõe seus gastos</h3>
              <ul className="overview-detail-list">
                <li>
                  <span>Despesas pessoais</span>
                  <strong>{money(stats.expensePersonalTotal)}</strong>
                </li>
                <li>
                  <span>Sua parte nos grupos</span>
                  <strong>{money(stats.sharedShareTotal)}</strong>
                </li>
              </ul>
            </section>
          )}
          <div className="overview-progress">
            <section className="overview-progress-block">
              <div className="overview-progress-header">
                <h3>Limite de gastos do mês</h3>
                <strong>{money(stats.total)}</strong>
              </div>
              <Progress
                amount={stats.total}
                target={plan.spendingLimit || 0}
                label="Limite mensal de gastos"
              />
            </section>
            <section className="overview-progress-block">
              <div className="overview-progress-header">
                <h3>Meta de guardar no mês</h3>
                <strong>{money(stats.savingsThisMonth)}</strong>
              </div>
              <Progress
                amount={stats.savingsThisMonth}
                target={plan.savingTarget || 0}
                label="Meta de economia"
              />
            </section>
          </div>
          <button
            type="button"
            className="button secondary"
            disabled={readOnly}
            onClick={() => go('budget')}
          >
            {readOnly
              ? 'Orçamento gerenciado pelo administrador'
              : groupMode
                ? 'Definir orçamento do grupo'
                : 'Definir meu orçamento'}
          </button>
        </article>
        {groupMode ? (
          <article className="panel overview-panel settlement">
            <header>
              <p className="eyebrow">ACERTO DO GRUPO</p>
              <h2>{transfers.length ? 'Como equilibrar as contas' : 'Tudo em equilíbrio'}</h2>
            </header>
            <p className="settlement-description">
              Sugestões calculadas sobre contas pagas, descontando os repasses já confirmados.
              Despesas pendentes ficam fora do acerto.
            </p>
            {transfers.length > 0 && (
              <ul className="group-transfers">
                {transfers.map((transfer, index) => (
                  <li key={transfer.from + '-' + transfer.to + '-' + index}>
                    <div>
                      <strong>{nameOf(transfer.from)}</strong>
                      <span>repassa para {nameOf(transfer.to)}</span>
                    </div>
                    <strong className="amount">{money(transfer.amount)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <section className="overview-section">
              <h3>Participantes · {members.length}</h3>
              <p className="overview-note group-participant-note">
                A parte de cada pessoa inclui contas pagas e pendentes. O acerto considera somente o
                que já foi pago.
              </p>
              <div className="group-participant-list">
                {members.map((person) => {
                  const balance = stats.balances?.[person.id] || 0;
                  return (
                    <article className="group-participant" key={person.id}>
                      <h4>{person.name}</h4>
                      <dl>
                        <div>
                          <dt>Parte nas contas do mês</dt>
                          <dd>{money(stats.shares?.[person.id] || 0)}</dd>
                        </div>
                        <div>
                          <dt>Já pagou</dt>
                          <dd>{money(stats.paidBy?.[person.id] || 0)}</dd>
                        </div>
                        <div>
                          <dt>
                            {balance > 0 ? 'A receber' : balance < 0 ? 'A repassar' : 'Acerto'}
                          </dt>
                          <dd
                            className={
                              balance > 0 ? 'metric-positive' : balance < 0 ? 'metric-negative' : ''
                            }
                          >
                            {balance === 0 ? 'Em equilíbrio' : money(Math.abs(balance))}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            </section>
            <p className="overview-note">
              Registre uma devolução quando o dinheiro for recebido para atualizar os saldos. O
              aplicativo não realiza pagamentos.
            </p>
            <button
              type="button"
              className="button primary"
              disabled={readOnly}
              onClick={() => go('settlements')}
            >
              {readOnly
                ? 'Repasses gerenciados pelo administrador'
                : 'Registrar ou consultar repasses'}
            </button>
          </article>
        ) : (
          <article className="panel overview-panel">
            <header>
              <p className="eyebrow">CADA CATEGORIA CONTA</p>
              <h2>Para onde vai seu dinheiro</h2>
            </header>
            {categories.length ? (
              <div className="overview-category-list">
                {categories.map(([category, amount]) => (
                  <div className="category-row" key={category}>
                    <div>
                      <span>{category}</span>
                      <strong>{money(amount)}</strong>
                    </div>
                    <div className="progress-track" aria-hidden="true">
                      <div
                        className="progress-value"
                        style={{
                          width:
                            (stats.total > 0 ? Math.min(100, (amount / stats.total) * 100) : 0) +
                            '%',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                Adicione seu primeiro gasto para conhecer sua distribuição.
              </div>
            )}
            <p className="overview-note">
              Inclui suas cotas nas despesas de todos os seus grupos, sem contar novamente o valor
              inteiro das contas compartilhadas.
            </p>
          </article>
        )}
      </section>
      <div className="notice">
        <p>
          {groupMode
            ? 'Este espaço mostra apenas contas e reservas do grupo selecionado. Gastos e reservas individuais ficam nos respectivos espaços e não entram neste resumo.'
            : 'O disponível é uma previsão por responsabilidade, após quitar contas e reservar os aportes. Não representa o saldo de uma conta bancária.'}
        </p>
      </div>
    </>
  );
}
