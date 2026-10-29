# Firebase Authentication e Vercel

## Estado desta integração

A tela de acesso usa o SDK oficial do Firebase Authentication: e-mail/senha, criação de conta, recuperação de senha e Google. O código está pronto; a conexão real depende das configurações Web do projeto Firebase e dos provedores habilitados.

Os dados pessoais e os arquivos de comprovantes continuam locais, separados por UID. O compartilhamento opcional usa Cloud Firestore para publicar apenas os dados do grupo e vincular contas a participantes existentes mediante convite e aceite. A opção de desenvolvimento conserva os dados locais anteriores sem importá-los automaticamente para uma conta.

## Ativar convites e consulta compartilhada

1. Crie o banco **Cloud Firestore padrão**, em modo de produção, no mesmo projeto usado pelo Authentication. Escolha a localização antes de criar o banco.
2. Publique as regras do arquivo `firestore.rules`. Pelo Console, copie esse arquivo para a aba Regras do Firestore e publique. Com Firebase CLI autenticado, a alternativa é `npx firebase deploy --only firestore:rules --project financial-management-262fb`. Este comando não publica o site.
3. Configure `VITE_GROUP_SHARING_ENABLED=true` no ambiente desejado da Vercel e gere um novo deploy. Localmente, adicione a variável a `.env.local` e reinicie o Vite. Sem a variável, os dados locais e o login continuam funcionando sem consultar o Firestore.
4. Em **Pessoas e grupos**, cadastre os nomes e o grupo. Em **Convites e acesso ao grupo**, escolha o grupo e o participante existente e informe o e-mail. Quem publica o grupo é seu administrador no Firestore; somente essa conta pode atualizar dados e gerenciar convites.
5. Compartilhe o endereço do site com o convidado. O sistema **não envia e-mail de convite**: os convites ficam disponíveis dentro do aplicativo, inclusive para contas criadas posteriormente. A confirmação de e-mail é enviada pelo Firebase quando a pessoa clica em **Enviar confirmação**.
6. O convidado entra com o e-mail informado, confirma o endereço, clica em **Já confirmei meu e-mail** e aceita o convite. Google normalmente já fornece e-mail verificado. O aceite preserva o ID do participante e todo seu histórico no grupo.

### Comportamento e limites

- O e-mail é opcional para participantes; sem convite aceito não há acesso compartilhado. O administrador pode alterar o e-mail ou cancelar um convite pendente. Vínculos aceitos são imutáveis nesta versão.
- O participante consulta despesas, sua parte, saldo após repasses e histórico de repasses por competência. Os lançamentos são gerenciados pelo administrador. Os grupos recebidos aparecem em **Pessoas e grupos**, separados dos espaços locais.
- O Firestore recebe uma projeção explícita de nomes/IDs dos integrantes, despesas do grupo com rateio calculado e repasses. Não recebe rendas, perfis de renda, despesas individuais, e-mails dos demais convidados, notas ou arquivos/metadados de comprovantes.
- As alterações do administrador são publicadas com atraso de 700 ms enquanto o aplicativo está aberto. Falhas geram aviso e podem ser retomadas com **Atualizar dados compartilhados**. O primeiro convite também publica o histórico existente.
- O estado completo do administrador ainda depende do navegador original e do backup JSON. A projeção compartilhada não substitui um backup e não é importada automaticamente em outro dispositivo. Revisões transacionais evitam sobrescrever uma publicação concorrente sem aviso.
- Aceite e associação são gravados atomicamente. As regras exigem e-mail verificado, convite pendente para aquele endereço e correspondência entre grupo, participante e UID.
- O snapshot é um documento Firestore, sujeito ao limite de tamanho por documento. Não há upload de arquivos nesta etapa.

### Validação local das permissões

Com Java 21 ou superior disponível no PATH, execute `npm run test:rules`. O comando inicia o emulador com o projeto fictício `demo-financial-sharing`; não usa dados de produção. Os testes verificam isolamento entre contas, consulta de convites, bloqueio sem confirmação de e-mail, aceite atômico, preservação do ID do participante e proteção de vínculos aceitos. `npm test` executa os testes de domínio; os testes de regras são ignorados quando o emulador não está ativo.

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
- A consulta compartilhada dos grupos usa Firestore quando ativada conforme as instruções acima. A sincronização do espaço pessoal e dos arquivos de comprovantes ainda não está implementada.
