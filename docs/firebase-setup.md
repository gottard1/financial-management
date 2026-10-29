# Firebase Authentication e Vercel

## Estado desta integração

A tela de acesso usa o SDK oficial do Firebase Authentication: e-mail/senha, criação de conta, recuperação de senha e Google. O código está pronto; a conexão real depende das configurações Web do projeto Firebase e dos provedores habilitados.

Os dados financeiros ainda são locais. Login não implica sincronização Firestore e não concede acesso aos dados de outras pessoas. Cada UID usa uma área local separada; a opção de desenvolvimento conserva os dados locais anteriores sem importá-los automaticamente para uma conta.

## Configuração local

1. No Firebase Console, abra Configurações do projeto → Seus aplicativos.
2. Registre um aplicativo Web caso ainda não exista e copie seu objeto `firebaseConfig`.
3. Copie `.env.example` para `.env.local` e preencha:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
# Opcionais nesta etapa:
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
```

4. Em Authentication → Sign-in method, habilite E-mail/senha e, se desejar, Google. O provedor Google pede um e-mail de suporte.
5. Em Authentication → Settings → Authorized domains, autorize os domínios exatos usados pelo aplicativo. Para desenvolvimento, confira `localhost` e/ou `127.0.0.1`. Projetos novos não devem presumir que localhost já esteja autorizado.
6. Reinicie `npm run dev` após mudar variáveis de ambiente.
7. Teste o cadastro e login com sua própria conta pelo navegador.

Os campos Web de configuração são utilizados pelo SDK cliente; nunca adicione chave privada, conta de serviço ou credencial de Admin SDK a variáveis `VITE_`. `.env.local` está ignorado pelo Git.

[Configuração Web oficial](https://firebase.google.com/docs/web/setup) · [FAQ de autenticação e domínios autorizados](https://firebase.google.com/docs/auth/faq-and-troubleshooting).

## Vercel

- Framework preset: Vite.
- Instalação: `npm ci`.
- Build: `npm run build`.
- Output: `dist`.
- Na configuração do projeto Vercel, adicione as mesmas quatro variáveis obrigatórias em Environment Variables para os ambientes desejados.
- Adicione o domínio real da aplicação Vercel à lista de Authorized domains do Firebase.
- Faça um novo deploy depois de adicionar ou alterar variáveis; valores `VITE_` entram no bundle durante a compilação.

Sem essas variáveis, a produção exibe a tela de configuração pendente e não permite entrar no painel. O botão de modo local existe apenas em `npm run dev`, sem Firebase configurado. Ele não é disponibilizado no bundle de produção.

O workflow GitHub valida código e build. O envio à Vercel depende da integração do repositório configurada pelo proprietário. Um push bem-sucedido não confirma, sozinho, que um deploy terminou.

## Domínio de autenticação na Vercel

O arquivo `vercel.json` encaminha `/__/auth/*` e `/__/firebase/*` ao projeto `financial-management-262fb` com rewrites transparentes, sem redirecionar o navegador para outro domínio. Essas rotas precisam estar publicadas antes de alterar a variável de autenticação.

Para usar `contas-planos.vercel.app` em produção:

1. No Firebase Authentication, mantenha `contas-planos.vercel.app` nos domínios autorizados.
2. No Google Cloud, abra o cliente OAuth Web usado pelo provedor Google do Firebase. Adicione a origem `https://contas-planos.vercel.app` e o URI de retorno exato `https://contas-planos.vercel.app/__/auth/handler`, preservando os anteriores.
3. Na Vercel, configure `VITE_FIREBASE_AUTH_DOMAIN=contas-planos.vercel.app` apenas em Production. Se a variável atual também vale para Preview, separe os ambientes: Preview continua com `financial-management-262fb.firebaseapp.com`.
4. Gere um novo deploy de produção após salvar a variável. O ambiente local continua usando o domínio padrão do Firebase em `.env.local`.

O domínio personalizado de autenticação não altera automaticamente a marca exibida pelo Google. Nome e logotipo são configurados separadamente em Google Auth Platform → Branding.

[Proxy oficial de autenticação Firebase](https://firebase.google.com/docs/auth/web/redirect-best-practices#option_3_proxy_auth_requests_to_firebaseappcom) · [Rewrites Vercel](https://vercel.com/docs/routing/rewrites).

## Dados e comprovantes

- Contas autenticadas usam chaves de navegador prefixadas pelo UID.
- Sair da conta desmonta a área financeira e remove seu estado da tela; os dados locais permanecem para quando a mesma conta voltar a entrar nesse navegador.
- Comprovantes usam um banco IndexedDB separado por UID/modo local.
- O JSON exportado contém registros e metadados dos comprovantes, mas não os arquivos.
- Não há upload de recibos para Firebase Storage nesta etapa.
- Para compartilhamento entre dispositivos, ainda é necessário implementar Firestore com regras de associação a grupos e um adaptador para arquivos.
