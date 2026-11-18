function safe(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('O saldo ultrapassa o limite permitido.');
  return number;
}

// Positive balance means first owes second. Never move a credit to another pair.
export function calculatePairs(pairs, records, memberIds) {
  const byKey = new Map();
  function pairFor(from, to) {
    const [first, second] = [from, to].sort();
    const key = JSON.stringify([first, second]);
    if (!byKey.has(key)) byKey.set(key, { first, second, expenses: [], payments: [] });
    return byKey.get(key);
  }
  for (const pair of pairs) {
    const target = pairFor(pair.first, pair.second);
    target.expenses.push(...pair.expenses);
    target.payments.push(...pair.payments);
  }
  for (const record of records) {
    if (record.status !== 'confirmed') continue;
    const { id, from, to, amount, date, settlementRule } = record;
    pairFor(from, to).payments.push({
      id,
      from,
      to,
      amount,
      date,
      ...(settlementRule ? { settlementRule } : {}),
    });
  }
  const transfers = [],
    settlementPairs = [],
    settlementIssues = [];
  for (const pair of byKey.values()) {
    const signed = (entry) => BigInt(entry.amount) * (entry.from === pair.first ? 1n : -1n);
    const forward = pair.expenses
      .filter((e) => e.from === pair.first)
      .reduce((sum, e) => sum + BigInt(e.amount), 0n);
    const backward = pair.expenses
      .filter((e) => e.from === pair.second)
      .reduce((sum, e) => sum + BigInt(e.amount), 0n);
    const original = forward - backward;
    const payments = pair.payments.reduce((sum, entry) => sum + signed(entry), 0n);
    const balance = original - payments;
    // Old global netting (or a later expense edit) may have paid another pair.
    // Keep the history and require review instead of reopening settled amounts.
    if (
      payments !== 0n &&
      (original === 0n ||
        (original > 0n
          ? payments < 0n || payments > original
          : payments > 0n || payments < original))
    )
      settlementIssues.push({ first: pair.first, second: pair.second, reason: 'payment-mismatch' });
    settlementPairs.push({
      ...pair,
      balance: safe(balance),
      compensated: safe(forward < backward ? forward : backward),
    });
    if (balance !== 0n)
      transfers.push({
        from: balance > 0n ? pair.first : pair.second,
        to: balance > 0n ? pair.second : pair.first,
        amount: safe(balance > 0n ? balance : -balance),
      });
  }
  transfers.sort(
    (a, b) =>
      memberIds.indexOf(a.from) - memberIds.indexOf(b.from) ||
      memberIds.indexOf(a.to) - memberIds.indexOf(b.to),
  );
  return { settlementPairs, settlementIssues, transfers: settlementIssues.length ? [] : transfers };
}
