import { useEffect, useState } from 'react';
import {
  watchSharedGroup,
  watchSharing,
} from '../infrastructure/firebase/groupSharingRepository.js';

export function useSharedMemberships(user, localMode) {
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user || localMode || import.meta.env.VITE_GROUP_SHARING_ENABLED !== 'true') return;
    let stops = [];
    const stop = watchSharing(
      'groupMemberships',
      'uid',
      user.uid,
      (memberships) => {
        stops.forEach((unsubscribe) => unsubscribe());
        setGroups([]);
        setError('');
        stops = memberships.map((membership) =>
          watchSharedGroup(
            membership.groupId,
            (group) => {
              setGroups((current) => [
                ...current.filter((item) => item.id !== membership.groupId),
                ...(group && !group.deleted
                  ? [{ id: membership.groupId, name: group.snapshot.name, membership }]
                  : []),
              ]);
            },
            () => {
              setGroups((current) => current.filter((item) => item.id !== membership.groupId));
              setError(
                'Não foi possível carregar um grupo compartilhado. Confira sua conexão e seu acesso.',
              );
            },
          ),
        );
      },
      () => setError('Não foi possível consultar os grupos compartilhados.'),
    );
    return () => {
      stop();
      stops.forEach((unsubscribe) => unsubscribe());
    };
  }, [user?.uid, localMode]);
  return { groups, error };
}
