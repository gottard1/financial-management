export const activeGroupMembers = (group) =>
  group?.deleted
    ? []
    : (group?.memberIds || []).filter((id) => !(group.removedMemberIds || []).includes(id));

export function deleteGroup(data, groupId) {
  const group = data.groups.find((item) => item.id === groupId);
  if (!group || group.deleted)
    throw new Error('Este grupo já foi excluído ou não está disponível.');
  return {
    ...data,
    groups: data.groups.map((item) => (item.id === groupId ? { ...item, deleted: true } : item)),
  };
}

export function groupHistoryCount(data, groupId) {
  const scope = `group:${groupId}`;
  return (
    data.expenses.filter((item) => item.workspace === scope).length +
    data.settlements.filter((item) => item.scope === scope).length +
    data.goals.filter((item) => item.scope === scope).length +
    data.contributions.filter((item) => item.scope === scope).length +
    Object.keys(data.plans).filter((key) => key.startsWith(`${scope}|`)).length
  );
}

/** Bounded steps stay below Firestore transaction limits and never orphan a goal contribution. */
export function purgeGroupHistoryBatch(data, groupId, limit = 300) {
  const group = data.groups.find((item) => item.id === groupId);
  if (!group) return data;
  if (!group.deleted)
    throw new Error('Exclua o grupo antes de apagar definitivamente seu histórico.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 300)
    throw new Error('Tamanho de limpeza inválido.');
  const scope = `group:${groupId}`;
  const receiptIds = [
    ...new Set([
      ...(group.purgeReceiptIds || []),
      ...data.settlements
        .filter((item) => item.scope === scope && item.receipt)
        .map((item) => item.receipt.id),
    ]),
  ];
  let remaining = limit;
  const next = { ...data };
  // Contributions must be removed before their goals.
  for (const key of ['contributions', 'expenses', 'settlements', 'goals']) {
    next[key] = data[key].filter((item) => {
      if (remaining > 0 && (key === 'expenses' ? item.workspace : item.scope) === scope) {
        remaining -= 1;
        return false;
      }
      return true;
    });
  }
  next.plans = Object.fromEntries(
    Object.entries(data.plans).filter(([key]) => {
      if (remaining > 0 && key.startsWith(`${scope}|`)) {
        remaining -= 1;
        return false;
      }
      return true;
    }),
  );
  const done = groupHistoryCount(next, groupId) === 0;
  next.groups = data.groups
    .filter((item) => !done || item.id !== groupId)
    .map((item) =>
      item.id === groupId ? { ...item, purging: true, purgeReceiptIds: receiptIds } : item,
    );
  return next;
}

export function removeGroupMember(data, groupId, personId) {
  const group = data.groups.find((item) => item.id === groupId);
  if (!group || !activeGroupMembers(group).includes(personId))
    throw new Error('Esta pessoa não participa mais do grupo.');
  if (activeGroupMembers(group).length <= 1)
    throw new Error('Mantenha pelo menos um participante ativo no grupo.');
  return {
    ...data,
    groups: data.groups.map((item) =>
      item.id === groupId
        ? {
            ...item,
            removedMemberIds: [...(item.removedMemberIds || []), personId],
          }
        : item,
    ),
  };
}
