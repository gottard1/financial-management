import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

export async function purgeSharedGroupHistory(database, adminUid, groupId) {
  if (!groupId.startsWith(`${adminUid}_`))
    throw new Error('Somente o administrador pode apagar o histórico.');
  const ref = doc(database, 'sharedGroups', groupId);
  await runTransaction(database, async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists() || current.data().adminUid !== adminUid || !current.data().deleted)
      throw new Error('Exclua o grupo antes de apagar seu histórico compartilhado.');
    transaction.update(ref, {
      snapshot: {
        id: current.data().snapshot.id,
        name: 'Grupo apagado',
        activeMemberIds: [],
        people: [],
        expenses: [],
        settlements: [],
      },
      revision: current.data().revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  const [invites, memberships] = await Promise.all([
    getDocs(
      query(
        collection(database, 'groupInvites'),
        where('groupId', '==', groupId),
        where('adminUid', '==', adminUid),
      ),
    ),
    getDocs(query(collection(database, 'groupMemberships'), where('groupId', '==', groupId))),
  ]);
  const references = [...memberships.docs, ...invites.docs].map((item) => item.ref);
  for (let offset = 0; offset < references.length; offset += 400) {
    const batch = writeBatch(database);
    references.slice(offset, offset + 400).forEach((item) => batch.delete(item));
    await batch.commit();
  }
}

/** The tombstone blocks access immediately, even if later cleanup needs retrying. */
export async function deleteSharedGroup(database, adminUid, groupId) {
  if (!groupId.startsWith(`${adminUid}_`))
    throw new Error('Somente o administrador pode excluir o grupo.');
  const ref = doc(database, 'sharedGroups', groupId);
  let exists = false;
  await runTransaction(database, async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists()) {
      transaction.set(ref, {
        adminUid,
        deleted: true,
        revision: 1,
        updatedAt: serverTimestamp(),
        snapshot: {
          id: groupId.slice(adminUid.length + 1),
          name: 'Grupo excluído',
          activeMemberIds: [],
          people: [],
          expenses: [],
          settlements: [],
        },
      });
      exists = true;
      return;
    }
    const group = current.data();
    if (group.adminUid !== adminUid)
      throw new Error('Somente o administrador pode excluir o grupo.');
    exists = true;
    if (!group.deleted)
      transaction.update(ref, {
        deleted: true,
        snapshot: { ...group.snapshot, activeMemberIds: [] },
        revision: group.revision + 1,
        updatedAt: serverTimestamp(),
      });
  });
  if (!exists) return { cleanupPending: false };
  try {
    const [invites, members] = await Promise.all([
      getDocs(
        query(
          collection(database, 'groupInvites'),
          where('groupId', '==', groupId),
          where('adminUid', '==', adminUid),
        ),
      ),
      getDocs(query(collection(database, 'groupMemberships'), where('groupId', '==', groupId))),
    ]);
    const operations = [
      ...invites.docs
        .filter((item) => item.data().status !== 'revoked')
        .map((item) => ({ type: 'invite', ref: item.ref })),
      ...members.docs.map((item) => ({ type: 'member', ref: item.ref })),
    ];
    for (let offset = 0; offset < operations.length; offset += 400) {
      const batch = writeBatch(database);
      for (const operation of operations.slice(offset, offset + 400)) {
        if (operation.type === 'invite')
          batch.update(operation.ref, { status: 'revoked', updatedAt: serverTimestamp() });
        else batch.delete(operation.ref);
      }
      await batch.commit();
    }
    return { cleanupPending: false };
  } catch {
    return { cleanupPending: true };
  }
}
