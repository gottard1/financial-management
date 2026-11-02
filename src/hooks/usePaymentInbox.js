import { useEffect, useState } from 'react';
import { watchPaymentReports } from '../infrastructure/firebase/paymentReportRepository.js';
import { watchSharing } from '../infrastructure/firebase/groupSharingRepository.js';

export function usePaymentInbox(user, localMode, groupIds) {
  const [byGroup, setByGroup] = useState({});
  const [invites, setInvites] = useState([]);
  const [error, setError] = useState('');
  const key = JSON.stringify([...new Set(groupIds)].sort());
  useEffect(() => {
    setByGroup({});
    setError('');
    if (!user || localMode || import.meta.env.VITE_GROUP_SHARING_ENABLED !== 'true') return;
    let active = true;
    const stops = JSON.parse(key).map((id) =>
      watchPaymentReports(
        id,
        (records) => {
          if (active) setByGroup((current) => ({ ...current, [id]: records }));
        },
        () => {
          if (active) {
            setByGroup((current) => ({ ...current, [id]: [] }));
            setError(
              'Não foi possível carregar as solicitações de recebimento. Confira a conexão e as regras publicadas.',
            );
          }
        },
      ),
    );
    return () => {
      active = false;
      stops.forEach((stop) => stop());
    };
  }, [user?.uid, localMode, key]);
  useEffect(() => {
    setInvites([]);
    if (!user?.email || localMode || import.meta.env.VITE_GROUP_SHARING_ENABLED !== 'true') return;
    return watchSharing('groupInvites', 'email', user.email.toLowerCase(), setInvites, () =>
      setError('Não foi possível carregar seus convites.'),
    );
  }, [user?.uid, user?.email, localMode]);
  return {
    reports: Object.values(byGroup).flat(),
    invites: invites.filter((item) => item.status === 'pending'),
    error,
  };
}
