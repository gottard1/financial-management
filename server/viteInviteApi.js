export function inviteApiPlugin() {
  return {
    name: 'local-invitation-api',
    configureServer(server) {
      for (const route of ['group-invite-lookup', 'group-finance'])
        server.middlewares.use(`/api/${route}`, async (req, res) => {
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
              if (Buffer.byteLength(body) > (route === 'group-finance' ? 100000 : 4096))
                return res.status(413).json({ error: 'Dados de consulta muito grandes.' });
            }
            req.body = body ? JSON.parse(body) : {};
            const { default: handler } = await import(`../api/${route}.js`);
            await handler(req, res);
          } catch {
            res.status(400).json({ error: 'Não foi possível processar a consulta de convite.' });
          }
        });
    },
  };
}
