import { calculateWorkspace } from './workspaceCalculations.js';

export function shiftMonth(month, offset) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Informe um mês válido.');
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + offset;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const sum = (values) => {
  const result = Number(values.reduce((total, value) => total + BigInt(value), 0n));
  if (!Number.isSafeInteger(result))
    throw new Error('O total do período ultrapassa o limite permitido.');
  return result;
};

export function compareMonths(data, scope, start, end, workspace = calculateWorkspace) {
  shiftMonth(start, 0);
  shiftMonth(end, 0);
  const count =
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5)) -
    Number(start.slice(5)) +
    1;
  if (count < 1 || count > 24)
    throw new Error('Selecione um período entre 1 e 24 meses, em ordem cronológica.');
  const rows = Array.from({ length: count }, (_, index) => {
    const month = shiftMonth(start, index);
    try {
      return {
        month,
        ...workspace(data, month, scope, data.months[month] || {}),
        error: '',
      };
    } catch (error) {
      return { month, error: error.message };
    }
  });
  const valid = rows.filter((row) => !row.error);
  const total = sum(valid.map((row) => row.total));
  const categories = [...new Set(valid.flatMap((row) => Object.keys(row.categories)))]
    .map((name) => ({
      name,
      total: sum(valid.map((row) => row.categories[name] || 0)),
      values: rows.map((row) => (row.error ? null : row.categories[name] || 0)),
    }))
    .sort((a, b) => b.total - a.total);
  const latest = rows.at(-1),
    previous = rows.at(-2);
  const delta =
    latest && previous && !latest.error && !previous.error ? latest.total - previous.total : null;
  return {
    rows,
    categories,
    total,
    average: valid.length ? Math.round(total / valid.length) : 0,
    paid: sum(valid.map((row) => row.paid)),
    pending: sum(valid.map((row) => row.pending)),
    delta,
    deltaPercent: delta !== null && previous.total > 0 ? (delta / previous.total) * 100 : null,
  };
}
