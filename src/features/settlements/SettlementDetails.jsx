import React from 'react';
import { money } from '../../domain/expenses/expenseCalculations.js';

export function SettlementReviewNotice({ issues = [], nameOf }) {
  if (!issues.length) return null;
  return (
    <div className="notice warning" role="alert">
      <strong>Acerto aguardando revisão</strong>
      <p>
        Há repasses anteriores que não podem ser conciliados com segurança pela regra de duplas, ou
        os dados compartilhados precisam ser atualizados. O histórico foi preservado. Novas
        sugestões e confirmações desta competência ficam suspensas para evitar cobranças indevidas.
      </p>
      {issues
        .filter((issue) => issue.first)
        .map((issue) => (
          <p key={`${issue.first}:${issue.second}`}>
            Confira os pagamentos entre {nameOf(issue.first)} e {nameOf(issue.second)} no histórico.
          </p>
        ))}
      {issues.some((issue) => issue.reason === 'split-changed') && (
        <p>
          O rateio antigo de duas pessoas era diferente de 50/50. Confira os valores já quitados
          antes de conciliar.
        </p>
      )}
    </div>
  );
}

export function SettlementDetails({ transfer, pairs = [], nameOf }) {
  const pair = pairs.find(
    (item) =>
      [item.first, item.second].includes(transfer.from) &&
      [item.first, item.second].includes(transfer.to),
  );
  if (!pair) return null;
  const total = (from) =>
    pair.expenses.filter((item) => item.from === from).reduce((sum, item) => sum + item.amount, 0);
  return (
    <details className="settlement-details">
      <summary>
        Ver detalhamento de {nameOf(transfer.from)} e {nameOf(transfer.to)}
      </summary>
      <ol className="settlement-expenses">
        {pair.expenses.map((item, index) => (
          <li key={`${item.expenseId}:${index}`}>
            <strong>{item.description}</strong>
            <p>
              Quem pagou: {nameOf(item.to)}. Parte devida por {nameOf(item.from)}:{' '}
              {money(item.amount)}.
            </p>
          </li>
        ))}
      </ol>
      <p>
        {nameOf(transfer.from)} deve pelas despesas: {money(total(transfer.from))}.
      </p>
      <p>
        {nameOf(transfer.to)} deve no sentido contrário: {money(total(transfer.to))}.
      </p>
      <p>Compensado entre as duas pessoas: {money(pair.compensated)} em cada sentido.</p>
      {pair.payments.map((payment) => (
        <p key={payment.id}>
          Repasse confirmado: {nameOf(payment.from)} → {nameOf(payment.to)}, {money(payment.amount)}{' '}
          em {payment.date.split('-').reverse().join('/')}.
        </p>
      ))}
      <p>
        <strong>
          Falta devolver: {money(transfer.amount)} de {nameOf(transfer.from)} para{' '}
          {nameOf(transfer.to)}.
        </strong>
      </p>
    </details>
  );
}
