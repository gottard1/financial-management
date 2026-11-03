# Arquitetura e evolução

## Decisões desta versão

### Extensões financeiras opcionais

As regras do Excel e investimentos são extensões aditivas do v3. `domain/finance/extendedFinance` concentra competências de faturas, conservação do total parcelado, integração de recebimentos, reservas, posições manuais, projeções e sugestões de economia. `migrateData` valida as novas coleções opcionais, com listas vazias quando ausentes; codec, backup, regras e servidor compartilham esses contratos. Os painéis em `features/finance` usam os mesmos adaptadores de persistência da conta e do grupo. Não há execução de macros nem importação de dados da planilha. Veja [regras, compatibilidade e uso](excel-finance-and-investments.md).

Cartões podem escolher opcionalmente o mês do vencimento (`dueMonthMode`); a ausência mantém o cálculo automático anterior. As datas concretas são apresentadas antes de salvar e os termos ficam congelados no lançamento. `domain/expenses/consolidatedExpenses` reúne despesas pessoais e cotas de grupos sem persistir cópias; grupos convidados usam as cotas da projeção pública e a identidade da associação autenticada, mantidas pelo hook de grupos. A interface sinaliza carregamento ou cotas incompletas em vez de tratar o total parcial como definitivo. Novas despesas de grupo começam com rateio igual; registros e recorrências anteriores mantêm seu rateio.

### Domínio independente

Rateio, tributos e resumo mensal são funções puras. Recebem dados explícitos e retornam resultados ou erros de validação. Não acessam estado global nem DOM. O dinheiro trafega em centavos inteiros; conversão de entrada e formatação ocorrem nas bordas da interface.

Os testes ficam próximos às regras. Quando uma regra financeira mudar, adicione um exemplo de comportamento esperado e um caso de fronteira antes de atualizar a implementação.

### Organização por funcionalidade

Cada pasta de `features/` contém a interface de um fluxo. `components/ui` possui elementos sem responsabilidade de negócio, e `components/layout` contém elementos de navegação. `app/App.jsx` compõe essas peças e mantém a navegação local e as ações entre funcionalidades.

A estrutura usa JavaScript ES Modules e JSX. Não há TypeScript nesta versão. Se contratos crescerem, introduza tipos gradualmente começando por entidades e repositórios, sem reescrever as regras desnecessariamente.

Nos grupos, `content-stack` organiza os blocos por um único `gap`: 24 px no computador e 20 px no celular. Os filhos diretos não acumulam margens verticais, inclusive resumos, avisos, solicitações e painéis aninhados de repasses. Ações em cabeçalhos e linhas não recebem a margem superior usada por ações independentes. Filtros de despesas compartilham uma grade responsiva; cartões de participantes alinham suas ações mesmo com nomes de comprimentos diferentes.

`components/ui/FormattedInput` fornece máscaras de moeda, percentual e telefone. `shared/formatting/inputFormatters` mantém a apresentação independente dos dados: moeda em `1.250,50`, percentual em `53,8` e telefones brasileiros reconhecidos em `(11) 98765-4321`. A normalização visual ocorre ao sair do campo, preservando digitação e cursor. Percentuais usam ponto nos callbacks numéricos existentes; moeda continua passando por `parseMoney`, sem arredondar nem truncar entradas inválidas. Contatos internacionais, ramais e textos históricos não reconhecidos são preservados. Os componentes atendem campos controlados, `FormData`, atualização externa e limpeza do formulário; não exigem migração ou regravação dos dados anteriores. Nomes e descrições continuam como texto livre.

### Persistência por adaptador

`localFinanceRepository` é a fronteira com `localStorage`. O hook `useFinanceData` coordena a cópia local e a sincronização privada no ciclo de vida React. A camada de domínio valida a estrutura salva, migra v1/v2 para v3 e recusa dados inválidos; não apaga o original.

O estado local continua sendo um documento inteiro para backup e compatibilidade. `financeCloudCodec` transforma esse estado em registros individuais por pessoa, despesa, grupo, plano, meta, aporte, repasse e competência de renda. `financeCloudStore` grava apenas registros alterados, removendo os excluídos, e atualiza uma revisão global da conta na mesma transação. Assim, uma gravação antiga não sobrescreve silenciosamente alterações de outra sessão. A ordenação das listas é preservada no documento de revisão, sem regravar todas as despesas ao excluir uma delas.

`financeSync` mantém marcadores locais de envio pendente, serializa gravações e preserva alterações feitas durante um envio. A nuvem só é carregada depois de uma leitura confirmada pelo servidor. Uma conta ainda vazia recebe a cópia local da mesma conta; versões divergentes com alterações não enviadas exigem exportação e resolução explícita. A troca pela versão remota arquiva a versão local antes de substituir a cópia ativa. A gravação individual de comprovantes continua em IndexedDB.

Erros transitórios de envio são retomados automaticamente com espera progressiva entre 1 e 30 segundos. A volta da conexão reabre a escuta e tenta enviar alterações pendentes. Falhas de permissão e conflitos não entram nessa repetição. A confirmação de salvamento continua dependendo da transação remota.

### Edição por participantes

`MonthlyOverview` compõe o mesmo resumo e os mesmos painéis para administrador e participante. A parte, o total pago e o saldo destacados usam o participante vinculado à conta. `SharedGroupWorkspace` reutiliza os formulários de despesas, recorrência, orçamento, reservas, repasses e comparação. Os formulários aguardam a resposta do servidor antes de comunicar sucesso; controles de exclusão ficam ausentes para participantes.

`POST /api/group-finance` valida o token Google e verifica associação ativa e convite aceito dentro da transação. Participantes podem incluir/editar despesas, planos, metas e aportes, copiar recorrentes e convidar novos membros. Somente o administrador pode alterar o nome e os dados cadastrais do grupo. Convites de participantes não podem mudar vínculos nem reativar pessoas removidas. O formulário de convite fica exclusivamente na aba **Pessoas e grupos**, em `SharedGroupInvitationPanel`; as telas financeiras não oferecem convites ou edição cadastral. A rota não aceita exclusões, remoção de membros, mudança de administrador ou alterações em perfis/rendas pessoais. A prévia proporcional é calculada no servidor e retorna somente as cotas.

A mesma transação grava os documentos financeiros privados do proprietário, a revisão e a projeção pública atualizada. As regras do Firestore continuam impedindo leitura ou escrita direta de convidados na área privada. `financeRevision` relaciona a projeção à revisão financeira e impede que uma publicação automática com dados antigos desfaça uma edição compartilhada. Concorrência retorna conflito, preservando os dados atuais.

### Tabelas tributárias versionadas

`domain/income/taxTables2026.js` concentra os valores e referências usados no cálculo. O cálculo não deve trocar silenciosamente para outra tabela nem usar a tabela atual para um período sem aviso. A futura seleção por competência deve associar uma versão à renda salva.

## Modelo atual

| Entidade | Identificação      | Responsabilidade                                        |
| -------- | ------------------ | ------------------------------------------------------- |
| Pessoas  | ID estável         | Nomes e referências, sem limite fixo                    |
| Grupos   | ID e memberIds     | Composição dos espaços compartilhados                   |
| Rendas   | Mês e ID da pessoa | Valores líquidos e perfil de simulação                  |
| Despesas | ID e workspace     | Valor, participantes, percentuais, pagador e situação   |
| Planos   | Workspace e mês    | Limite total, categorias e meta de economia             |
| Metas    | ID e scope         | Objetivo acumulado e prazo                              |
| Aportes  | ID e scope         | Valor guardado e vínculo opcional com meta              |
| Repasses | ID, scope e mês    | Recebimento confirmado/estornado e comprovante opcional |

### Models e extensões

Os models são objetos JavaScript validados por `migrateData`, sem ORM ou classes de banco. Valores monetários usam centavos inteiros.

| Model / seção                             | Campos principais                                                                                                                                                                 | Persistência                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Pessoa / `people`                         | `id`, `name`, `accountUid`, `inviteEmail`, `profile` (`phone`, `city`, `occupation`)                                                                                              | Documento privado por pessoa                                           |
| Grupo / `groups`                          | `id`, `name`, `memberIds`, `adminPersonId`, `removedMemberIds`, `deleted`                                                                                                         | Documento privado e projeção pública filtrada                          |
| Renda mensal / `months`                   | competência → pessoa → líquido em dinheiro                                                                                                                                        | Documento `income:<mês>`                                               |
| Configuração de cálculo / `incomeConfigs` | `type`, `gross`, `dependents`, `otherDeductions`, `meiActivity`, `pjTaxPercent`, `pjFixedCosts`, `cashBonus`, `otherCashIncome`, `foodAllowance`, `mealAllowance`                 | Mesmo documento mensal de renda                                        |
| Despesa / `expenses`                      | `id`, `workspace`, `description`, `amount`, `category`, `date`, `status`, `payer`, `participants`, `split`, `percentages`, `fixed`, `fixedAmountType`, `installments`, `originId` | Documento por despesa                                                  |
| Orçamento / `plans`                       | chave `scope\|mês`, `spendingLimit`, `savingTarget`, `categories`                                                                                                                 | Documento por espaço/mês                                               |
| Meta / `goals`                            | `id`, `scope`, `title`, `target`, `targetDate`                                                                                                                                    | Documento por meta                                                     |
| Aporte / `contributions`                  | `id`, `scope`, `amount`, `date`, `goalId`, `note`                                                                                                                                 | Documento por aporte                                                   |
| Repasse / `settlements`                   | `id`, `scope`, `from`, `to`, `amount`, `date`, `referenceMonth`, `note`, `status`, `receipt`                                                                                      | Privado por repasse; recebimentos compartilhados em `settlementMonths` |
| Convite / `groupInvites`                  | `groupId`, `personId`, `email`, `personName`, `groupName`, `adminUid`, `status`, `acceptedUid`                                                                                    | Coleção de convites                                                    |
| Vínculo / `groupMemberships`              | `uid`, `groupId`, `personId`, `inviteId`                                                                                                                                          | Coleção de associações                                                 |
| Estado / `finance/state`                  | `schemaVersion`, `revision`, `recordCount`, `orders`, `updatedAt`                                                                                                                 | Controle de integridade e concorrência                                 |

O líquido e as configurações de entrada são persistidos. Detalhes tributários, cotas e resumos são derivados; não existe um model independente de simulação salva. Alterar entradas pode recalcular o passado, e os arquivos de comprovantes continuam locais.

É possível ampliar o modelo. As próximas adições com maior utilidade são:

| Proposta                                  | Necessidade atendida                                                         | Prioridade sugerida                        |
| ----------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| `AuditEvent`                              | Registrar quem alterou cada dado do grupo, quando e os valores anteriores    | Alta após liberar colaboração              |
| `MonthlySnapshot` / `CalculationSnapshot` | Preservar fechamentos, tabela tributária e resultados de cálculos históricos | Alta                                       |
| `IncomeEntry`                             | Várias fontes de receita por pessoa/mês                                      | Conforme a necessidade de rendas variáveis |
| `Payment` e `PaymentSource`               | Pagamentos parciais, vários pagadores, contas/cartões e consumo de VA/VR     | Conforme a necessidade de conciliação      |
| `ReserveMovement`                         | Aportes, retiradas e transferências entre reservas                           | Conforme a necessidade de retiradas        |

`IncomeEntry` e `ReserveMovement` agora estão implementados como coleções opcionais, juntamente com cartões, eventos, ativos, movimentos e avaliações de investimentos. As demais propostas continuam evoluções futuras. Novas entidades exigem valores padrão/migração, validação, inclusão no codec e regras, projeção pública por lista explícita e testes de persistência e isolamento. Novos campos públicos não devem carregar perfis ou salários individuais.

`workspace`/`scope` usam `person:<id>` ou `group:<id>`. Rendas e configurações são mapas por ID da pessoa, dentro de cada mês. Adicionar ou renomear alguém não muda os vínculos dos registros existentes.

Cada despesa registra uma lista explícita de `participants` e um `payer`. O pagador pode ser membro do grupo sem participar da divisão. Novos integrantes não são incluídos retroativamente nas contas anteriores. Uma pessoa pode participar de vários grupos; seu resumo agrega as próprias despesas e suas cotas nesses grupos, sem duplicar lançamentos.

A remoção de integrantes é lógica: `memberIds` continua contendo as referências históricas e `removedMemberIds` identifica quem não participa de novos lançamentos. Cálculos históricos e acertos usam as referências originais, inclusive de pessoas removidas; os formulários de novas despesas e convites usam `activeGroupMembers`. Antes de marcar a remoção local, o administrador revoga o acesso remoto em transação, cancelando convites pendentes ou revogando convites aceitos e excluindo a associação. A reativação mantém o ID anterior e exige novo aceite para recuperar o acesso.

O rateio usa o método dos maiores restos para conservar centavos. Percentuais personalizados são validados em centésimos de porcentagem e somam 100%. O resumo retorna responsabilidades, pagamentos, saldos e sugestões de transferências entre devedores e credores por ID.

O formato atual é v3, salvo em `financial-management-v3`. O adaptador migra v1/v2, convertendo escopos, pagadores, participantes, rendas, planos, metas e aportes. Os registros originais permanecem intactos nas antigas chaves. Nomenclaturas antigas ficam restritas à migração e seus testes.

## Integração Firebase e próximos passos

1. Introduzir autenticação e um ID estável de usuário.
2. Associar pessoas e grupos financeiros a contas autenticadas, distinguindo cadastro financeiro de usuário com acesso.
3. Criar um contrato assíncrono de repositório para consultar e alterar entidades, com estado de carregamento e falhas.
4. Implementar adaptador Firestore sem importar SDK no domínio ou em componentes de apresentação.
5. Gravar cada despesa, aporte e renda como entidade própria. Não sobrescrever o documento inteiro do grupo.
6. Testar regras no Firebase Emulator Suite: acesso autorizado, usuário externo, alteração de associação e validação de registros.
7. Preservar os IDs ao migrar automaticamente os dados locais da mesma conta quando o servidor confirma ausência de dados remotos. Divergências exigem resolução explícita, com exportação e arquivo local antes de trocar de versão.
8. Validar sincronização, escritas concorrentes, erros de rede e reconexão antes de publicar.

Uma organização possível no Firestore:

```text
users/{userId}
workspaces/{workspaceId}
  members/{userId}
  expenses/{expenseId}
  incomes/{personId-month}
  plans/{month}
  goals/{goalId}
  contributions/{contributionId}
```

Essa árvore continua sendo uma proposta de evolução para edição colaborativa por registro dentro dos grupos. O schema conectado hoje usa `users/{uid}/finance` para os registros privados, `sharedGroups` para a projeção de consulta e `groupInvites`/`groupMemberships` para o acesso. As regras verificam o UID na área privada e a associação nos grupos. Chaves de Admin SDK pertencem ao servidor e nunca ao bundle React. Os campos públicos de configuração do SDK cliente não substituem autorização por regras.

## Evolução das regras financeiras

### Renda em dinheiro e benefícios

`calculateIncome` mantém o cálculo da renda principal e seus tributos. `calculateCompensation` compõe esse resultado com bonificações e outras entradas declaradas líquidas, sem alterar sua base tributária. VA e VR são recursos restritos, expostos em campos próprios e excluídos de `net`, que permanece sendo a renda em dinheiro usada na divisão.

`sumRestrictedBenefits` agrega apenas os perfis de renda do mês e das pessoas selecionadas. A interface não soma benefícios à disponibilidade de caixa. Os novos campos têm padrão zero, mantendo a compatibilidade com configurações antigas.

`domain/benefits/benefitPayments` implementa a fonte opcional `expense.paymentSource`: `cash` (padrão por ausência), `foodAllowance` e `mealAllowance`. O consumo continua nos totais e categorias; `cashExpenses` separa as responsabilidades em dinheiro usadas no saldo antes dos aportes, na disponibilidade e nas sugestões de economia. No espaço pessoal, a própria cota paga pelo próprio vale sai de `cashExpenses`; cotas de outros participantes continuam em dinheiro. No grupo, o desembolso em vale fica separado do desembolso em dinheiro, com rateio, pagamentos, saldos e acertos idênticos aos anteriores. O vale sempre pertence ao pagador, inclusive quando não participa do rateio.

`features/benefits/BenefitsPanel` usa a união derivada das despesas, incluindo projeções de grupos e a identidade da associação. Desconta o valor integral pago pelo titular, sem repetir a cota ou duplicar o grupo administrado. Contas pendentes são compromissos, não débitos realizados. Os valores mensais são os mesmos `foodAllowance`/`mealAllowance` do perfil; editar o vale preserva a renda em dinheiro e as outras configurações do mês. Não há saldo acumulado inferido ou transporte automático de sobras. Veja [contrato e limites](va-vr.md).

O campo opcional viaja no documento de despesa já existente, no backup e na sincronização. O servidor valida a enumeração e a incompatibilidade com fatura de crédito; aceita alterações e remoção explícita pela mesma API e mantém as permissões. Somente a fonte e a despesa do grupo são públicas: configurações e saldos dos vales continuam privados. Não há alteração nas regras do Firestore para esta extensão.

- **Fechamento de mês:** salvar renda e divisão como snapshots para impedir que edições retroativas alterem períodos fechados.
- **Pagamentos:** separar obrigações de pagamentos para suportar parcelas, pagamentos parciais e múltiplos pagadores.
- **Acertos:** registrar transferências entre membros separadamente das despesas.
- **Reservas:** retiradas e transferências entre destinos do mesmo espaço estão disponíveis. Transferências entre espaços continuam uma evolução futura.
- **Receitas:** recebimentos individuais complementam ou substituem opcionalmente o total mensal, com prevenção explícita de repetição do perfil.
- **Histórico fiscal:** associar competência, tabela usada e premissas ao resultado da simulação.

## Verificação e manutenção

- `npm run check` é a validação local e de CI.
- O lockfile é versionado; use `npm ci` em CI e instalações reproduzíveis.
- `.editorconfig` e Prettier mantêm formato consistente.
- Arquivos gerados, credenciais, dependências e backups financeiros não entram no Git.
- Mudanças de persistência devem incluir migração e testes que garantam preservação dos dados originais.
- Testes de domínio não devem depender da renderização da interface.
- Confira os fluxos de ponta a ponta no navegador antes de liberar alterações de formulário ou navegação.

## Escopo intencional

Não há contas bancárias conectadas ou pagamentos reais. A API autenticada de grupos complementa a persistência privada Firebase; o modo local de desenvolvimento não precisa dessa infraestrutura. As posições de investimento são registros manuais. O desenho organiza o projeto para crescer por funcionalidades, sem introduzir serviços ou bibliotecas antes de existirem requisitos que os justifiquem.

## Autenticação e isolamento local

`infrastructure/firebase/client.js` inicializa apenas Firebase Authentication quando as quatro variáveis Web obrigatórias existem. `AuthProvider` controla a sessão e traduz erros do SDK; `AuthScreen` não conhece o domínio financeiro. O ponto de entrada monta o provider e `App` só monta a área financeira após autenticação ou modo de desenvolvimento autorizado.

A área financeira é remontada por UID. `namespacedStorage` isola contas e mantém o dataset local legado separado. A autorização remota está em `firestore.rules`, com isolamento privado por UID e associação verificada para grupos. A sessão não importa os dados do modo local para uma conta; a migração automática abrange somente os registros locais já pertencentes à própria conta autenticada.

A persistência do hook valida e salva sincronamente antes de publicar o novo estado React. Assim, falhas de quota ou validação podem ser tratadas pelo fluxo que grava um repasse e seu arquivo.

## Histórico de acertos

### Solicitações de recebimento

`domain/settlements/paymentReports` valida solicitações separadamente dos recebimentos. O campo opcional `paymentReports` é migrado para uma lista vazia e integrado ao codec privado, preservando documentos antigos sem essa seção. Solicitações pendentes ou recusadas nunca participam dos cálculos financeiros.

No compartilhamento, a API autenticada existente delega as ações `report-payment`, `confirm-payment` e `reject-payment` para `server/groupPaymentReports`. O servidor deriva o participante da associação autenticada, confirma o vínculo da conta destinatária e revalida o saldo atual. A confirmação atualiza `paymentReports` e `settlementMonths` na mesma transação. `paymentReportLocks` serializa solicitações pendentes por competência e par de participantes; recebimentos diretos consultam o mesmo marcador para não duplicar o fluxo.

As regras negam a criação direta de solicitações pelo cliente. Somente a API pode registrar ou responder; o destinatário pode marcar um recebimento como desfeito apenas junto ao estorno validado no ledger. A exclusão definitiva do histórico limpa solicitações e marcadores. Nenhuma dessas projeções expõe renda, telefone ou outros dados privados.

`usePaymentInbox` agrega as solicitações dos grupos autorizados e os convites recebidos. A caixa pessoal filtra pagador/destinatário por UID; ações de confirmação não dependem apenas de controles visuais. A abertura de uma notificação não altera valores nem representa confirmação.

`domain/settlements` ajusta somente os saldos e reutiliza o solver de transferências do domínio de despesas. Os lançamentos financeiros originais não são duplicados como entradas/saídas. O formato v3 recebe `settlements: []` por padrão, preservando a compatibilidade com registros existentes.

`receiptRepository` isola arquivos em IndexedDB por namespace. A interface guarda somente metadados no registro financeiro; a exportação JSON não inclui blobs. Falhas de gravação do registro permitem remover o anexo novo; estornos preservam arquivo e histórico. Uma futura integração cloud deve substituir esse adaptador, com autorização por grupo e tratamento de falhas entre operações de arquivo e banco.
