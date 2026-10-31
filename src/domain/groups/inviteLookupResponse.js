export async function readInviteLookupResponse(response) {
  let result;
  try {
    result = await response.json();
  } catch {
    const startupFailure = response.headers.get('x-vercel-error') === 'FUNCTION_INVOCATION_FAILED';
    if (startupFailure || response.status >= 500)
      throw new Error(
        'A consulta de contas falhou no servidor. Isso não indica que o e-mail não está cadastrado. Tente novamente após a correção do serviço.',
      );
    if (response.status === 404)
      throw new Error(
        'O serviço de consulta de contas não foi encontrado nesta versão do site. Atualize a publicação do aplicativo.',
      );
    throw new Error(
      'O serviço de consulta retornou uma resposta inválida. Confira se a API de convites está disponível neste ambiente.',
    );
  }
  if (!response.ok) throw new Error(result?.error || 'Não foi possível consultar a conta.');
  if (
    typeof result?.found !== 'boolean' ||
    (result.name !== null && typeof result.name !== 'string')
  )
    throw new Error('O serviço retornou dados inválidos para a consulta. Tente novamente.');
  return result;
}
