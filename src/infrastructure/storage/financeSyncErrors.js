/** Report useful SDK codes without exposing tokens, payloads or arbitrary server messages. */
export function financeSyncErrorMessage(error) {
  if (!error) return '';
  const code = typeof error.code === 'string' ? error.code.replace(/^firestore\//, '') : '';
  if (!code || code === 'finance/conflict')
    return (
      error.message || 'Não foi possível confirmar a sincronização. Sua cópia local foi preservada.'
    );
  if (code === 'permission-denied')
    return 'O Firestore recusou o acesso (permission-denied). Sua cópia local foi preservada. Confira se as regras firestore.rules desta versão foram publicadas no mesmo projeto Firebase usado pelo aplicativo e se você está na conta correta. Depois, use Tentar sincronizar.';
  if (['unavailable', 'deadline-exceeded', 'auth/network-request-failed'].includes(code))
    return `Não foi possível alcançar o serviço de sincronização (${code}). Sua cópia local foi preservada. Confira a conexão e tente sincronizar novamente.`;
  if (['unauthenticated', 'auth/user-token-expired', 'auth/invalid-user-token'].includes(code))
    return `A sessão não foi aceita pelo Firebase (${code}). Exporte sua cópia local e entre novamente na mesma conta para retomar a sincronização.`;
  if (code === 'resource-exhausted')
    return 'O Firestore informou um limite de recursos (resource-exhausted). Sua cópia local foi preservada. Confira a disponibilidade e as cotas do projeto Firebase.';
  const safeCode = /^[a-z][a-z0-9/-]{0,79}$/.test(code) ? ` (${code})` : '';
  return `Não foi possível confirmar a sincronização${safeCode}. Sua cópia local foi preservada. Tente sincronizar novamente; se persistir, informe esta mensagem para investigar a causa.`;
}
