import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

/** Revoke access first; historical expenses and account data are never deleted. */
export async function revokeGroupMemberAccess(database, adminUid, groupId, personId) {
  const groupRef = doc(database, 'sharedGroups', groupId);
  const inviteRef = doc(database, 'groupInvites', `${groupId}_${personId}`);
  await runTransaction(database, async (transaction) => {
    const groupDoc = await transaction.get(groupRef);
    if (!groupDoc.exists()) return;
    const group = groupDoc.data();
    if (group.adminUid !== adminUid)
      throw new Error('Somente o administrador pode remover participantes.');
    const invitation = await transaction.get(inviteRef);
    const invite = invitation.exists() ? invitation.data() : null;
    let membershipRef;
    if (invite?.status === 'accepted') {
      membershipRef = doc(database, 'groupMemberships', `${invite.acceptedUid}_${groupId}`);
      const membership = await transaction.get(membershipRef);
      if (
        membership.exists() &&
        (membership.data().personId !== personId || membership.data().inviteId !== inviteRef.id)
      )
        throw new Error('O vínculo mudou. Atualize a página antes de remover.');
    }
    const active =
      group.snapshot.activeMemberIds || group.snapshot.people.map((person) => person.id);
    if (active.includes(personId) && active.length <= 1)
      throw new Error('Mantenha pelo menos um participante ativo no grupo.');
    if (active.includes(personId))
      transaction.update(groupRef, {
        snapshot: { ...group.snapshot, activeMemberIds: active.filter((id) => id !== personId) },
        revision: group.revision + 1,
        updatedAt: serverTimestamp(),
      });
    if (invite?.status === 'pending') transaction.delete(inviteRef);
    if (invite?.status === 'accepted') {
      transaction.update(inviteRef, { status: 'revoked', updatedAt: serverTimestamp() });
      transaction.delete(membershipRef);
    }
  });
}
