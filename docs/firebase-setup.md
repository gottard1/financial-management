# Firebase Authentication e Vercel

## Estado desta integração

A tela de acesso usa o SDK oficial do Firebase Authentication: e-mail/senha, criação de conta, recuperação de senha e Google. O código está pronto; a conexão real depende das configurações Web do projeto Firebase e dos provedores habilitados.

Os dados financeiros são sincronizados em uma área privada por UID no Cloud Firestore, com uma cópia local para alterações pendentes. Os arquivos de comprovantes continuam locais. O compartilhamento opcional publica apenas os dados do grupo e vincula contas a participantes existentes mediante convite e aceite. A opção de desenvolvimento conserva os dados locais anteriores sem importá-los automaticamente para uma conta.

## Persistência financeira privada

Antes de publicar esta versão:

1. Mantenha o banco Firestore padrão no mesmo projeto do Authentication.
2. Publique novamente **todo o arquivo `firestore.rules`**, incluindo o novo bloco `users/{uid}/finance/{recordId}`. As regras da versão anterior permitem apenas os grupos e não permitem o salvamento privado.
3. Publique também `firestore.indexes.json`, que desativa a indexação do conteúdo serializado dos registros privados. Pelo CLI autenticado, use `npx firebase deploy --only firestore --project financial-management-262fb`. Pelo Console, publique as regras e adicione uma isenção de campo único para collection group `finance`, campo `payload`, desativando os índices ascendente, descendente e array.
4. A sincronização privada fica ativa por padrão nas contas autenticadas. `VITE_FINANCE_CLOUD_ENABLED=false` permite desativá-la temporariamente; `true` ou ausência da variável ativa o recurso. Alterar a variável exige novo build/deploy. O modo local de desenvolvimento não sincroniza.
5. Entre primeiro na conta pelo navegador que contém os registros existentes e aguarde **Dados financeiros salvos na nuvem**. Só depois teste o mesmo login em outro dispositivo.

### Migração e recuperação

- A cópia local da própria conta é enviada automaticamente apenas depois que o servidor confirma a ausência de registros remotos. Um cache vazio não é tratado como banco vazio.
- Se já existe uma versão remota e o navegador não tem alterações pendentes, a nuvem é carregada. Se há dados divergentes ainda não enviados, a edição é bloqueada, a cópia local é preservada e o aplicativo pede resolução.
- Para resolver, exporte a cópia local e carregue a nuvem pelo botão correspondente. O aplicativo também arquiva os dados locais sob uma chave com prefixo `financial-management-conflict-` antes de substituir a cópia ativa. Não há mesclagem automática entre versões.
- Alterações ficam primeiro salvas no navegador com um marcador de envio pendente. São agrupadas por 600 ms e gravadas em uma transação que exige a revisão remota esperada. Novas alterações feitas durante um envio são enfileiradas para o envio seguinte.
- Se a conexão ou as regras impedirem o envio, o status informa a falha e mantém os registros locais. Use **Tentar sincronizar** ao restabelecer a conexão. Não limpe o navegador enquanto houver envio pendente.

### Armazenamento e privacidade

O caminho privado `users/{uid}/finance` contém um documento `state` com a revisão e a ordem dos registros. Cada pessoa, grupo, despesa, orçamento, meta, aporte e repasse tem seu próprio documento, identificado pelo tipo e pelo ID original. Cada competência de renda tem um documento com valores e benefícios das pessoas daquele mês. O formato v3 é reconstituído na leitura; não são criados IDs novos na migração. Só os registros alterados são gravados, junto da revisão, em uma transação atômica. Os dados são validados antes de carregar a interface.

Cada documento contém um `payload` JSON validado, sem cortar caracteres Unicode, limitado a 750 KB. O aplicativo aceita até 10 mil registros e uma ordenação de até 500 KB; cada transação pode alterar ou remover até 450 registros. Uma primeira migração com mais de 450 registros exige migração assistida: o aplicativo recusa o envio e mantém a cópia local para exportação. O conteúdo `payload` não deve ser indexado. Uma alteração comum escreve somente os documentos modificados e o documento de revisão; a leitura inicial recupera os registros da conta e as leituras seguintes acompanham alterações.

As regras não permitem que outro integrante de grupo consulte a área privada do titular. Grupos continuam usando uma projeção separada sem rendas ou despesas individuais. Metadados dos comprovantes acompanham os repasses privados, mas os arquivos continuam no IndexedDB e não aparecem em outro dispositivo.

### Comparação mensal

As despesas podem ter `installments: { total, current }` quando forem compras parceladas. O total aceita inteiros positivos representáveis com segurança, sem um teto comercial de 360 parcelas, e inclui a parcela atual. Financiamentos longos, como 420 parcelas de R$ 978, mantêm R$ 978 como o valor mensal. A cópia mensal incrementa `current`, preserva o ID de origem e encerra a oferta de cópia quando `current === total`. O valor informado é o de cada parcela, sem dividir novamente pelo total. Esses campos opcionais acompanham o backup, a sincronização privada e a projeção compartilhada. Não há criação automática de lançamentos futuros; a comparação mensal mostra somente os meses já lançados.

Abra **Comparar meses** no menu principal. O espaço Individual usa gastos pessoais mais a parte do participante nos grupos administrados nesse conjunto de dados; o espaço Grupo usa somente as despesas do grupo selecionado. O intervalo aceita de 1 a 24 meses e oferece atalhos de 6 e 12 meses terminando no mês de referência.

O gráfico e as tabelas exibem renda em dinheiro, despesas pagas e pendentes, média e diferença entre os dois últimos meses do intervalo, além da distribuição por categoria. Os gastos seguem o vencimento, não a data do repasse; repasses não são somados novamente como despesas. Benefícios VA/VR não são somados à renda em dinheiro. Meses sem registros contam como zero. Meses com rateio proporcional sem renda suficiente são marcados para revisão e excluídos dos totais, sem inventar um gasto zero.

## Ativar convites e consulta compartilhada

1. Crie o banco **Cloud Firestore padrão**, em modo de produção, no mesmo projeto usado pelo Authentication. Escolha a localização antes de criar o banco.
2. Publique as regras do arquivo `firestore.rules`. Pelo Console, copie esse arquivo para a aba Regras do Firestore e publique. Com Firebase CLI autenticado, a alternativa é `npx firebase deploy --only firestore:rules --project financial-management-262fb`. Este comando não publica o site.
3. Configure `VITE_GROUP_SHARING_ENABLED=true` no ambiente desejado da Vercel e gere um novo deploy. Localmente, adicione a variável a `.env.local` e reinicie o Vite. Sem essa variável, apenas os convites e a consulta compartilhada ficam desativados; a sincronização financeira privada continua ativa por padrão.
4. Em **Pessoas e grupos**, cadastre os nomes e o grupo. Em **Convites e acesso ao grupo**, escolha o grupo e o participante existente e informe o e-mail. Quem publica o grupo é seu administrador no Firestore; somente essa conta pode atualizar dados e gerenciar convites.
5. Compartilhe o endereço do site com o convidado. O sistema **não envia e-mail de convite**: os convites ficam disponíveis dentro do aplicativo, inclusive para contas criadas posteriormente. A confirmação de e-mail é enviada pelo Firebase quando a pessoa clica em **Enviar confirmação**.
6. O convidado entra com o e-mail informado, confirma o endereço, clica em **Já confirmei meu e-mail** e aceita o convite. Google normalmente já fornece e-mail verificado. O aceite preserva o ID do participante e todo seu histórico no grupo.

A área de acesso está separada em **Convidar e gerenciar** (formulário, convites enviados e atualização dos dados), **Convites recebidos** (confirmação do e-mail e aceite) e **Grupos compartilhados** (consulta de despesas e repasses). Os contadores indicam convites pendentes e grupos recebidos; após o aceite, a consulta do grupo abre automaticamente.

### Comportamento e limites

- O e-mail é opcional para participantes; sem convite aceito não há acesso compartilhado. O administrador pode alterar o e-mail ou cancelar um convite pendente. O participante vinculado não é trocado por outro cadastro; o administrador pode remover a pessoa do grupo para revogar esse acesso.
- O participante consulta despesas, sua parte, saldo após repasses e histórico de repasses por competência. Os lançamentos são gerenciados pelo administrador. Os grupos recebidos aparecem também no seletor do espaço **Grupo**. A Visão geral mostra os mesmos totais mensais, orçamento, benefícios agregados, participantes e acertos do administrador, em modo de consulta.
- O Firestore recebe uma projeção explícita de nomes/IDs dos integrantes, despesas do grupo com rateio calculado e repasses. Inclui resumos mensais com renda total do grupo, benefícios agregados, aportes, orçamento e acertos; não inclui rendas individualizadas, perfis de renda, despesas individuais, e-mails dos demais convidados, notas ou arquivos/metadados de comprovantes.
- As alterações do administrador são publicadas com atraso de 700 ms enquanto o aplicativo está aberto. Falhas geram aviso e podem ser retomadas com **Atualizar dados compartilhados**. O primeiro convite também publica o histórico existente.
- O estado completo do administrador é sincronizado pela área privada da própria conta. A projeção compartilhada permanece separada e não expõe esse estado aos convidados. Revisões transacionais evitam sobrescrever uma publicação concorrente sem aviso.
- Aceite e associação são gravados atomicamente. As regras exigem e-mail verificado, convite pendente para aquele endereço e correspondência entre grupo, participante e UID.
- O snapshot é um documento Firestore, sujeito ao limite de tamanho por documento. Não há upload de arquivos nesta etapa.

Para grupos publicados antes da integração com a Visão geral, o administrador deve usar **Atualizar dados compartilhados** uma vez após atualizar o aplicativo. Esta integração não exige novas regras nem índices além dos já previstos neste projeto.

### Excluir grupos

Em **Pessoas e grupos → Grupos cadastrados**, use **Excluir grupo** e confirme. A exclusão é lógica: o grupo recebe `deleted: true`, sai dos grupos ativos e fica em **Grupos excluídos**, com acesso somente ao histórico. Despesas, repasses, rendas, pessoas, orçamentos, metas e aportes permanecem no conjunto privado da conta. Os gastos históricos continuam entrando nos resumos individuais, sem recalcular ou duplicar registros por causa da exclusão.

O administrador pode consultar as despesas, os repasses, os saldos, o orçamento, as metas e os aportes do grupo excluído, além da comparação mensal. Não há novos lançamentos ou reativação de grupos excluídos nesta versão. A exclusão é permitida mesmo quando resta apenas um participante.

O Firestore recebe primeiro um marcador de exclusão permanente em `sharedGroups`, que bloqueia leituras dos convidados e novos aceites imediatamente. Convites são marcados como revogados e associações são removidas em lotes. Se a limpeza falhar, os acessos continuam bloqueados e o botão **Atualizar revogação** permite tentar novamente. Grupos ainda não publicados também recebem esse marcador para impedir republicação por uma sessão antiga. As regras não permitem remover o marcador ou voltar `deleted` para `false`.

Publique novamente o conteúdo completo de `firestore.rules` para permitir o campo `deleted`, bloquear acesso a grupos excluídos e autorizar a limpeza dos vínculos. Não são necessários novos índices para esta alteração.

### Apagar o histórico definitivamente

Na lista **Grupos excluídos**, clique em **Apagar histórico definitivamente**, revise o aviso e digite **APAGAR**. É possível exportar um backup antes de confirmar. A operação remove despesas e parcelas já lançadas, repasses, orçamentos, metas e aportes daquele grupo. Os totais individuais e a comparação mensal passam a desconsiderar os lançamentos apagados. Pessoas, rendas, benefícios e registros de outros grupos são mantidos.

O conteúdo financeiro da projeção compartilhada é eliminado e convites e associações são fisicamente removidos. Permanece somente um documento pequeno de bloqueio em `sharedGroups`, sem nome original, participantes, despesas ou repasses, para impedir que uma sessão antiga recrie o grupo.

O histórico privado é removido em etapas de até 300 registros, com confirmação de cada transação antes da seguinte. A contribuição de uma meta é apagada antes da meta para não deixar referências órfãs. Enquanto houver dados a limpar, o grupo fica marcado como `purging`; após uma interrupção, use **Continuar apagando histórico**. O aplicativo só confirma conclusão após o Firestore confirmar as gravações. Essa operação exige conexão quando a sincronização está ativa.

Comprovantes disponíveis no navegador atual são removidos depois da confirmação dos dados; arquivos que permanecerem em outros dispositivos e backups já exportados não são apagados remotamente. Em modo local, a exclusão afeta somente o navegador atual.

É necessário republicar `firestore.rules`: dentro de `match /groupInvites/{id}`, o administrador pode apagar também convites aceitos/revogados quando o grupo já estiver excluído. A exclusão permanente não exige índices novos.

### Remover ou reativar participantes

Em **Pessoas e grupos → Grupos cadastrados**, use **Remover** ao lado da pessoa e confirme. Despesas, repasses, rendas e saldos anteriores são preservados; a pessoa fica identificada como removida no histórico. Os novos lançamentos e convites usam somente os participantes ativos. Contas recorrentes que ainda incluem uma pessoa removida não são copiadas automaticamente: cadastre uma nova recorrência com os participantes atuais para preservar os rateios anteriores.

Em contas autenticadas, a remoção requer conexão com o Firestore: primeiro é atualizada a lista pública de ativos, o convite pendente é cancelado ou o convite aceito é marcado como revogado, e o vínculo de acesso é excluído na mesma transação. Se isso falhar, a remoção local não é aplicada. O cadastro da conta do convidado e seus dados privados não são excluídos. Mesmo que exista um vínculo antigo em cache, as regras consultam o estado atual de acesso antes de permitir novas leituras.

Para reativar, abra **Editar grupo**, selecione a pessoa marcada como **Reativar participante** e salve. Ela volta a participar de novos lançamentos, mas precisa de um novo convite e aceite para recuperar o acesso. Não é possível remover o último participante ativo. O proprietário da conta que administra o grupo mantém seu papel de administrador, independentemente de sua participação financeira.

Publique novamente `firestore.rules` antes de usar a remoção em produção; versões anteriores não autorizam a revogação de vínculos aceitos.

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
- Os dados financeiros privados e a consulta compartilhada usam áreas separadas no Firestore. Os arquivos de comprovantes ainda não são sincronizados.
