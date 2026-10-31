export function inviteApiPlugin() {
  return {
    name: 'local-invitation-api',
    configureServer(server) {
      server.middlewares.use('/api/group-invite-lookup', async (req, res) => {
        res.status = (status) => {
          res.statusCode = status;
          return res;
        };
        res.json = (body) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
          return res;
        };
        try {
          let body = '';
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 4096)
              return res.status(413).json({ error: 'Dados de consulta muito grandes.' });
          }
          req.body = body ? JSON.parse(body) : {};
          const { default: handler } = await import('../api/group-invite-lookup.js');
          await handler(req, res);
        } catch {
          res.status(400).json({ error: 'Não foi possível processar a consulta de convite.' });
        }
      });
    },
  };
}
