// Only common group information may leave the account that manages the group.
export function publicGroupStats(stats) {
  return Object.fromEntries(
    [
      'total',
      'paid',
      'pending',
      'cashExpenses',
      'benefitExpenses',
      'shares',
      'paidBy',
      'balances',
      'transfers',
      'categories',
      'savingsThisMonth',
      'savingsAll',
      'reserveBalance',
      'invested',
      'wealth',
      'investmentApplications',
      'redemptions',
    ].map((key) => [key, stats[key]]),
  );
}
