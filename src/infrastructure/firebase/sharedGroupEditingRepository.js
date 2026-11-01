import { auth } from './client.js';

export async function editSharedGroup(groupId, revision, command) {
  if (!auth?.currentUser) throw new Error('Entre com Google para editar o grupo.');
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/group-finance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...command, groupId, revision }),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('A edição compartilhada ainda não está disponível neste servidor.');
  }
  if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o grupo.');
  return result;
}
