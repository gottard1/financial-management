import { normalizeInviteEmail } from '../src/domain/groups/groupSharing.js';

export function createGroupInviteLookup({
  verifyToken,
  getGroup,
  lookupUser,
  lookupProfileName,
  consumeLookup,
}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Use POST para consultar um convite.' });
    }
    try {
      const bearer = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      if (!bearer)
        return res.status(401).json({ error: 'Entre com Google para consultar um convite.' });
      let token;
      try {
        token = await verifyToken(bearer);
      } catch (error) {
        if (error.status === 503) throw error;
        return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente com Google.' });
      }
      if (token.firebase?.sign_in_provider !== 'google.com' || token.email_verified !== true)
        return res.status(403).json({ error: 'Use uma conta Google com e-mail confirmado.' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      let email;
      try {
        email = normalizeInviteEmail(body?.email || '');
      } catch {
        return res.status(400).json({ error: 'Informe um e-mail válido.' });
      }
      const groupId = body?.groupId;
      if (typeof groupId !== 'string' || !groupId || groupId.length > 300 || groupId.includes('/'))
        return res.status(400).json({ error: 'Selecione um grupo válido.' });
      const group = await getGroup(groupId);
      if (!group || group.deleted || group.adminUid !== token.uid)
        return res
          .status(403)
          .json({ error: 'Somente o administrador de um grupo ativo pode consultar convidados.' });
      if (email === token.email?.toLowerCase())
        return res
          .status(400)
          .json({ error: 'Sua conta já administra este grupo. Informe o e-mail de outra pessoa.' });
      if (!(await consumeLookup(token.uid)))
        return res
          .status(429)
          .json({ error: 'Muitas consultas. Aguarde alguns minutos antes de tentar novamente.' });
      const account = await lookupUser(email);
      if (
        !account ||
        account.disabled ||
        !account.emailVerified ||
        !account.providerData?.some((provider) => provider.providerId === 'google.com')
      )
        return res.status(200).json({ found: false, name: null });
      const profileName = await lookupProfileName(account.uid);
      const name = (profileName || account.displayName || '').trim().slice(0, 60);
      return res.status(200).json({ found: true, name: name || null });
    } catch (error) {
      if (error instanceof SyntaxError)
        return res.status(400).json({ error: 'Dados de consulta inválidos.' });
      return res.status(error.status === 503 ? 503 : 500).json({
        error:
          error.status === 503
            ? error.message
            : 'Não foi possível consultar a conta. Tente novamente.',
      });
    }
  };
}
