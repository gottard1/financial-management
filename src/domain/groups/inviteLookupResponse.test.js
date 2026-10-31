import test from 'node:test';
import assert from 'node:assert/strict';
import { readInviteLookupResponse } from './inviteLookupResponse.js';

test('lookup distinguishes a crashing server from a missing route or unknown account', async () => {
  await assert.rejects(
    () =>
      readInviteLookupResponse(
        new Response('FUNCTION_INVOCATION_FAILED', {
          status: 500,
          headers: { 'x-vercel-error': 'FUNCTION_INVOCATION_FAILED' },
        }),
      ),
    /falhou no servidor/,
  );
  await assert.rejects(
    () => readInviteLookupResponse(new Response('<html>Not found</html>', { status: 404 })),
    /não foi encontrado/,
  );
  await assert.rejects(
    () =>
      readInviteLookupResponse(
        Response.json({ error: 'Servidor não configurado.' }, { status: 503 }),
      ),
    /Servidor não configurado/,
  );
  await assert.rejects(
    () => readInviteLookupResponse(Response.json({ found: 'invalid' })),
    /dados inválidos/,
  );
  assert.deepEqual(await readInviteLookupResponse(Response.json({ found: false, name: null })), {
    found: false,
    name: null,
  });
  assert.deepEqual(await readInviteLookupResponse(Response.json({ found: true, name: 'Bia' })), {
    found: true,
    name: 'Bia',
  });
});
