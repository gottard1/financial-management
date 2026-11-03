export const paymentSources = {
  cash: 'Dinheiro / conta / cartão',
  foodAllowance: 'VA · Vale-alimentação',
  mealAllowance: 'VR · Vale-refeição',
};

export const paymentSource = (expense) =>
  expense.paymentSource === undefined ? 'cash' : expense.paymentSource;
export const usesBenefit = (expense) => paymentSource(expense) !== 'cash';

export function validatePaymentSource(expense) {
  if (!Object.hasOwn(paymentSources, paymentSource(expense)))
    throw new Error('Selecione uma fonte de pagamento válida.');
  if (usesBenefit(expense) && expense.cardId)
    throw new Error('VA/VR não compõe fatura de cartão de crédito. Selecione Sem cartão.');
}

/** Benefits belong to the payer. Other members retain their existing cash responsibility. */
export function cashExpenseShare(expense, personId, share) {
  return usesBenefit(expense) && expense.payer === personId ? 0 : share;
}

function sum(values) {
  const value = Number(values.reduce((acc, n) => acc + BigInt(n), 0n));
  if (!Number.isSafeInteger(value))
    throw new Error('Total de benefícios excede o limite permitido.');
  return value;
}

/** Monthly allowance control, not a bank balance. Never infers carryover or credit from expenses. */
export function benefitUsage(rows, config = {}) {
  return ['foodAllowance', 'mealAllowance'].map((source) => {
    const credit = config[source] ?? 0;
    if (!Number.isSafeInteger(credit) || credit < 0)
      throw new Error('Valor do benefício inválido.');
    const expenses = rows.filter((row) => row.payerIsMe && paymentSource(row.expense) === source);
    const spent = sum(expenses.filter((r) => r.status === 'paid').map((r) => r.totalAmount));
    const pending = sum(expenses.filter((r) => r.status === 'pending').map((r) => r.totalAmount));
    return {
      source,
      credit,
      spent,
      pending,
      remaining: sum([credit, -spent]),
      forecast: sum([credit, -spent, -pending]),
      expenses,
    };
  });
}
