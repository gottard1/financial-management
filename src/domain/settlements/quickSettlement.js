import { calculateWorkspace } from '../budget/workspaceCalculations.js';
import { validateNewSettlement } from './settlementCalculations.js';

export function recordQuickSettlement(data, { scope, month, transfer, id, date }) {
  const group = data.groups.find((item) => `group:${item.id}` === scope);
  if (!group || group.deleted)
    throw new Error('Selecione um grupo ativo para confirmar o recebimento.');
  if ((data.settlements || []).some((item) => item.id === id))
    throw new Error('Este recebimento já foi registrado.');
  const stats = calculateWorkspace(data, month, scope, data.months[month] || {});
  const record = {
    id,
    scope,
    from: transfer.from,
    to: transfer.to,
    amount: transfer.amount,
    date,
    referenceMonth: month,
    note: '',
    status: 'confirmed',
  };
  validateNewSettlement(record, stats, group.memberIds);
  return { ...data, settlements: [...(data.settlements || []), record] };
}
