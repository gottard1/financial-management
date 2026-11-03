import React from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';
import { Icon } from '../../components/ui/Icon.jsx';

export function MonthlySummary({ stats, mode, benefits, receiverId, go }) {
  const group = mode === 'group';
  const balance = stats.balances?.[receiverId] || 0;
  const label = group
    ? receiverId
      ? balance > 0
        ? 'Você tem a receber no grupo'
        : balance < 0
          ? 'Você tem a repassar no grupo'
          : 'Seus acertos estão em equilíbrio'
      : 'Despesas do grupo no mês'
    : 'Disponível previsto';
  const amount = group ? (receiverId ? Math.abs(balance) : stats.total) : stats.available;
  const rows = group
    ? [
        ['Despesas do grupo', stats.total],
        ...(receiverId
          ? [
              ['Sua parte nas despesas', stats.shares?.[receiverId] || 0],
              ['Você pagou nas contas', stats.paidBy?.[receiverId] || 0],
            ]
          : [
              ['Contas pagas', stats.paid],
              ['Contas pendentes', stats.pending],
            ]),
      ]
    : [
        ['Renda em dinheiro', stats.income],
        ['Despesas previstas', stats.total],
        ...(stats.benefitExpenses
          ? [
              ['Parte coberta por VA/VR', stats.benefitExpenses],
              ['Despesas em dinheiro', stats.cashExpenses],
            ]
          : []),
        ['Saldo antes dos aportes', stats.balanceBeforeContributions ?? stats.income - stats.total],
        ['Guardado no mês', stats.savingsThisMonth],
        ...(stats.investmentApplications
          ? [['Aplicações do caixa', stats.investmentApplications]]
          : []),
        ...(stats.redemptions ? [['Resgates · não são renda nova', stats.redemptions]] : []),
      ];
  return (
    <>
      <section className="financial-hero" aria-label="Resumo financeiro do mês">
        <div className="financial-hero-main">
          <p>
            <Icon name="wallet" />
            {label}
          </p>
          <strong className={'hero-amount ' + (amount < 0 ? 'negative' : '')}>
            {money(amount)}
          </strong>
          <small>
            {group
              ? 'O saldo considera somente recebimentos confirmados.'
              : 'Após gastos em dinheiro, suas cotas nos grupos e aportes. VA/VR fica separado.'}
          </small>
        </div>
        <div className="financial-hero-details">
          {rows.map(([title, value]) => (
            <div key={title}>
              <span>{title}</span>
              <strong>{money(value)}</strong>
            </div>
          ))}
          {group && (
            <small>
              Pagas: {money(stats.paid)} · Pendentes: {money(stats.pending)}
            </small>
          )}
        </div>
      </section>
      {!group && (benefits?.total > 0 || stats.benefitExpenses > 0) && (
        <aside className="benefits-note">
          <div>
            <strong>VA / VR do mês · {money(benefits?.total || 0)}</strong>
            <p>
              VA: {money(benefits?.foodAllowance || 0)} · VR: {money(benefits?.mealAllowance || 0)}
            </p>
          </div>
          <small>Benefícios de alimentação, separados do dinheiro disponível.</small>
          {go && (
            <button className="button secondary" onClick={() => go('benefits')}>
              Ver uso do VA / VR
            </button>
          )}
        </aside>
      )}
    </>
  );
}
