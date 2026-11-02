import { activeGroupMembers, removeGroupMember } from './groupMembers.js';
import { profilePerson } from './profile.js';

export const activePeople = (data) => data.people.filter((person) => !person.removed);

export function personRemovalGroups(data, personId, uid) {
  const person = data.people.find((item) => item.id === personId && !item.removed);
  if (!person) throw new Error('Esta pessoa já foi removida ou não está disponível.');
  const groups = data.groups.filter(
    (group) => !group.deleted && group.memberIds.includes(personId),
  );
  if (
    person.id === profilePerson(data, uid)?.id ||
    groups.some((group) => group.adminPersonId === personId)
  )
    throw new Error('O cadastro do administrador não pode ser removido.');
  if (activePeople(data).length <= 1) throw new Error('Mantenha pelo menos uma pessoa cadastrada.');
  const soleGroup = groups.find(
    (group) =>
      activeGroupMembers(group).includes(personId) && activeGroupMembers(group).length === 1,
  );
  if (soleGroup)
    throw new Error(
      `Adicione outro participante ou exclua o grupo “${soleGroup.name}” antes de remover esta pessoa.`,
    );
  return groups;
}

/** Keep IDs, income and financial records intact so historical balances never change. */
export function removeManagedPerson(data, personId, uid) {
  const groups = personRemovalGroups(data, personId, uid);
  return {
    ...data,
    people: data.people.map((person) =>
      person.id === personId ? { ...person, removed: true } : person,
    ),
    groups: data.groups.map((group) =>
      groups.some((item) => item.id === group.id)
        ? {
            ...group,
            removedMemberIds: [...new Set([...(group.removedMemberIds || []), personId])],
          }
        : group,
    ),
  };
}

export function restoreManagedPerson(data, personId) {
  if (!data.people.some((person) => person.id === personId && person.removed))
    throw new Error('Este cadastro não está removido.');
  return {
    ...data,
    people: data.people.map((person) =>
      person.id === personId ? { ...person, removed: false } : person,
    ),
  };
}

/** Revoke all access before hiding a person; completed steps survive a failed retry. */
export async function removeManagedPersonWithAccess({
  data,
  personId,
  uid,
  revokeAccess,
  commitData,
}) {
  const linkedGroups = personRemovalGroups(data, personId, uid);
  if (revokeAccess) {
    for (const linkedGroup of linkedGroups) {
      await revokeAccess(linkedGroup.id, personId);
      await commitData((current) =>
        activeGroupMembers(current.groups.find((group) => group.id === linkedGroup.id)).includes(
          personId,
        )
          ? removeGroupMember(current, linkedGroup.id, personId)
          : current,
      );
    }
  }
  return commitData((current) => {
    const currentGroups = personRemovalGroups(current, personId, uid);
    if (currentGroups.some((group) => !linkedGroups.some((item) => item.id === group.id)))
      throw new Error('Os vínculos desta pessoa mudaram. Revise os grupos e tente novamente.');
    return removeManagedPerson(current, personId, uid);
  });
}
