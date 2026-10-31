import { auth } from './client.js';
import { readInviteLookupResponse } from '../../domain/groups/inviteLookupResponse.js';

export async function lookupInviteAccount(groupId, email) {
  if (!auth?.currentUser) throw new Error('Entre com Google para convidar uma pessoa.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/group-invite-lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupId, email }),
  });
  return readInviteLookupResponse(response);
}
