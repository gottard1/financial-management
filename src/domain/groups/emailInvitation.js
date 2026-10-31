import { normalizeInviteEmail } from './groupSharing.js';
import { activeGroupMembers } from './groupMembers.js';

export function prepareEmailInvitation(
  data,
  { groupId, email, name, personId, newPersonId, previousEmail },
) {
  const group = data.groups.find((item) => item.id === groupId);
  if (!group || group.deleted) throw new Error('Selecione um grupo ativo.');
  if (!group.adminPersonId) throw new Error('Edite o grupo e escolha quem é você nele.');
  const normalized = normalizeInviteEmail(email);
  const existing = personId
    ? data.people.find((item) => item.id === personId)
    : data.people.find(
        (item) => item.inviteEmail === normalized && group.memberIds.includes(item.id),
      );
  if (personId && (!existing || !activeGroupMembers(group).includes(personId)))
    throw new Error('Selecione um participante ativo deste grupo.');
  if (existing?.id === group.adminPersonId)
    throw new Error('Informe o e-mail de outro participante.');
  if (
    existing?.inviteEmail &&
    existing.inviteEmail !== normalized &&
    existing.inviteEmail !== previousEmail
  )
    throw new Error('Este participante já está associado a outro e-mail.');
  const personName = existing?.name || name?.trim();
  if (!personName || personName.length > 60)
    throw new Error('Informe um nome de até 60 caracteres para o grupo.');
  const id = existing?.id || newPersonId;
  if (!id || (!existing && data.people.some((item) => item.id === id)))
    throw new Error('Não foi possível criar o participante. Tente novamente.');
  return {
    personId: id,
    personName,
    data: {
      ...data,
      people: existing
        ? data.people.map((item) => (item.id === id ? { ...item, inviteEmail: normalized } : item))
        : [...data.people, { id, name: personName, inviteEmail: normalized }],
      groups: data.groups.map((item) =>
        item.id === groupId
          ? {
              ...item,
              memberIds: [...new Set([...item.memberIds, id])],
              removedMemberIds: (item.removedMemberIds || []).filter((memberId) => memberId !== id),
            }
          : item,
      ),
    },
  };
}
