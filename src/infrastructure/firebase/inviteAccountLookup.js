import { auth } from './client.js';

export async function lookupInviteAccount(groupId, email) {
  if (!auth?.currentUser) throw new Error('Entre com Google para convidar uma pessoa.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/group-invite-lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupId, email }),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      'A busca de contas não está disponível. Use o site publicado ou inicie o ambiente local com a API.',
    );
  }
  if (!response.ok) throw new Error(result.error || 'Não foi possível consultar a conta.');
  return result;
}
