// Only common group information may leave the account that manages the group.
export function publicGroupStats(stats) {
  return Object.fromEntries(
    [
      'total',
      'paid',
      'pending',
      'shares',
      'paidBy',
      'balances',
      'transfers',
      'categories',
      'savingsThisMonth',
      'savingsAll',
    ].map((key) => [key, stats[key]]),
  );
}
