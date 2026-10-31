import { useEffect, useMemo, useState } from 'react';
import { watchSharing } from '../infrastructure/firebase/groupSharingRepository.js';
import { watchSettlementMonths } from '../infrastructure/firebase/sharedSettlementRepository.js';

export function useOwnedGroupSettlements(user, localMode) {
  const [groups, setGroups] = useState({});
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!user || localMode || import.meta.env.VITE_GROUP_SHARING_ENABLED !== 'true') return;
    const stops = new Map();
    const stop = watchSharing(
      'sharedGroups',
      'adminUid',
      user.uid,
      (records) => {
        setReady(true);
        const active = records;
        const ids = new Set(active.map((item) => item.id));
        for (const [id, unsubscribe] of stops)
          if (!ids.has(id)) {
            unsubscribe();
            stops.delete(id);
          }
        setGroups((current) =>
          Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))),
        );
        for (const record of active) {
          if (stops.has(record.id)) {
            setGroups((current) => ({
              ...current,
              [record.id]: { ...current[record.id], adminPersonId: record.snapshot.adminPersonId },
            }));
            continue;
          }
          setGroups((current) => ({
            ...current,
            [record.id]: {
              id: record.id,
              localId: record.snapshot.id,
              adminPersonId: record.snapshot.adminPersonId,
              ledgers: [],
            },
          }));
          stops.set(
            record.id,
            watchSettlementMonths(
              record.id,
              (ledgers) => {
                setGroups((current) => ({
                  ...current,
                  [record.id]: {
                    id: record.id,
                    localId: record.snapshot.id,
                    adminPersonId: current[record.id]?.adminPersonId,
                    ledgers,
                  },
                }));
                setError('');
              },
              () =>
                setError(
                  'Não foi possível sincronizar os recebimentos do grupo. Confira as regras do Firestore.',
                ),
            ),
          );
        }
      },
      () => setError('Não foi possível consultar os recebimentos compartilhados.'),
    );
    return () => {
      stop();
      stops.forEach((unsubscribe) => unsubscribe());
    };
  }, [user?.uid, localMode]);
  return { groups: useMemo(() => Object.values(groups), [groups]), error, ready };
}
