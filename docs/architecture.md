# Arquitetura e evolução

## Decisões desta versão

### Domínio independente

Rateio, tributos e resumo mensal são funções puras. Recebem dados explícitos e retornam resultados ou erros de validação. Não acessam estado global nem DOM. O dinheiro trafega em centavos inteiros; conversão de entrada e formatação ocorrem nas bordas da interface.

Os testes ficam próximos às regras. Quando uma regra financeira mudar, adicione um exemplo de comportamento esperado e um caso de fronteira antes de atualizar a implementação.

### Organização por funcionalidade

Cada pasta de `features/` contém a interface de um fluxo. `components/ui` possui elementos sem responsabilidade de negócio, e `components/layout` contém elementos de navegação. `app/App.jsx` compõe essas peças e mantém a navegação local e as ações entre funcionalidades.

A estrutura usa JavaScript ES Modules e JSX. Não há TypeScript nesta versão. Se contratos crescerem, introduza tipos gradualmente começando por entidades e repositórios, sem reescrever as regras desnecessariamente.

### Persistência por adaptador

`localFinanceRepository` é a fronteira com `localStorage`. O hook `useFinanceData` traduz essa fronteira para o ciclo de vida React. A camada de domínio valida a estrutura salva, migra v1 para v2 e recusa dados inválidos; não apaga o original.

O estado local ainda é um documento inteiro. Isso atende ao protótipo em um navegador; não é a estratégia de escrita concorrente para duas pessoas. Firebase deve usar entidades e operações por registro.

### Tabelas tributárias versionadas

`domain/income/taxTables2026.js` concentra os valores e referências usados no cálculo. O cálculo não deve trocar silenciosamente para outra tabela nem usar a tabela atual para um período sem aviso. A futura seleção por competência deve associar uma versão à renda salva.

## Modelo atual

| Entidade | Identificação      | Responsabilidade                                      |
| -------- | ------------------ | ----------------------------------------------------- |
| Pessoas  | ID estável         | Nomes e referências, sem limite fixo                  |
| Grupos   | ID e memberIds     | Composição dos espaços compartilhados                 |
| Rendas   | Mês e ID da pessoa | Valores líquidos e perfil de simulação                |
| Despesas | ID e workspace     | Valor, participantes, percentuais, pagador e situação |
| Planos   | Workspace e mês    | Limite total, categorias e meta de economia           |
| Metas    | ID e scope         | Objetivo acumulado e prazo                            |
| Aportes  | ID e scope         | Valor guardado e vínculo opcional com meta            |

`workspace`/`scope` usam `person:<id>` ou `group:<id>`. Rendas e configurações são mapas por ID da pessoa, dentro de cada mês. Adicionar ou renomear alguém não muda os vínculos dos registros existentes.

Cada despesa registra uma lista explícita de `participants` e um `payer`. O pagador pode ser membro do grupo sem participar da divisão. Novos integrantes não são incluídos retroativamente nas contas anteriores. Uma pessoa pode participar de vários grupos; seu resumo agrega as próprias despesas e suas cotas nesses grupos, sem duplicar lançamentos.

O rateio usa o método dos maiores restos para conservar centavos. Percentuais personalizados são validados em centésimos de porcentagem e somam 100%. O resumo retorna responsabilidades, pagamentos, saldos e sugestões de transferências entre devedores e credores por ID.

O formato atual é v3, salvo em `financial-management-v3`. O adaptador migra v1/v2, convertendo escopos, pagadores, participantes, rendas, planos, metas e aportes. Os registros originais permanecem intactos nas antigas chaves. Nomenclaturas antigas ficam restritas à migração e seus testes.

## Caminho para Firebase

1. Introduzir autenticação e um ID estável de usuário.
2. Associar pessoas e grupos financeiros a contas autenticadas, distinguindo cadastro financeiro de usuário com acesso.
3. Criar um contrato assíncrono de repositório para consultar e alterar entidades, com estado de carregamento e falhas.
4. Implementar adaptador Firestore sem importar SDK no domínio ou em componentes de apresentação.
5. Gravar cada despesa, aporte e renda como entidade própria. Não sobrescrever o documento inteiro do grupo.
6. Testar regras no Firebase Emulator Suite: acesso autorizado, usuário externo, alteração de associação e validação de registros.
7. Migrar dados locais por ação explícita do usuário, com prévia e deduplicação por ID.
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

Essa árvore é uma proposta para a futura integração, não um schema já conectado. A associação deve ser verificada pelas regras e nunca apenas pelo seletor da interface. Chaves de Admin SDK pertencem ao servidor e nunca ao bundle React. Os campos públicos de configuração do SDK cliente não substituem autorização por regras.

## Evolução das regras financeiras

### Renda em dinheiro e benefícios

`calculateIncome` mantém o cálculo da renda principal e seus tributos. `calculateCompensation` compõe esse resultado com bonificações e outras entradas declaradas líquidas, sem alterar sua base tributária. VA e VR são recursos restritos, expostos em campos próprios e excluídos de `net`, que permanece sendo a renda em dinheiro usada na divisão.

`sumRestrictedBenefits` agrega apenas os perfis de renda do mês e das pessoas selecionadas. A interface não soma benefícios à disponibilidade de caixa. Os novos campos têm padrão zero, mantendo a compatibilidade com configurações antigas.

O total nominal de benefícios não é um saldo de cartão. Rastrear pagamentos com VA/VR exigirá um modelo de fonte de pagamento e consumo; isso não é inferido dos valores mensais informados.

- **Fechamento de mês:** salvar renda e divisão como snapshots para impedir que edições retroativas alterem períodos fechados.
- **Pagamentos:** separar obrigações de pagamentos para suportar parcelas, pagamentos parciais e múltiplos pagadores.
- **Acertos:** registrar transferências entre membros separadamente das despesas.
- **Reservas:** adicionar retiradas e transferências entre espaços sem classificá-las como consumo.
- **Receitas:** evoluir do perfil mensal único para várias fontes de entrada por pessoa.
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

Não há serviços de backend, autenticação simulada, contas bancárias conectadas ou pagamentos reais. Não há necessidade de infraestrutura adicional para executar a versão local. O desenho organiza o projeto para crescer por funcionalidades, sem introduzir serviços ou bibliotecas antes de existirem requisitos que os justifiquem.

## Autenticação e isolamento local

`infrastructure/firebase/client.js` inicializa apenas Firebase Authentication quando as quatro variáveis Web obrigatórias existem. `AuthProvider` controla a sessão e traduz erros do SDK; `AuthScreen` não conhece o domínio financeiro. O ponto de entrada monta o provider e `App` só monta a área financeira após autenticação ou modo de desenvolvimento autorizado.

A área financeira é remontada por UID. `namespacedStorage` isola contas e mantém o dataset local legado separado. Não se trata de autorização de dados compartilhados em servidor; a etapa Firestore ainda exige regras e associação entre usuários e grupos. A sessão não importa automaticamente os dados locais para uma conta.

A persistência do hook valida e salva sincronamente antes de publicar o novo estado React. Assim, falhas de quota ou validação podem ser tratadas pelo fluxo que grava um repasse e seu arquivo.

## Histórico de acertos

`domain/settlements` ajusta somente os saldos e reutiliza o solver de transferências do domínio de despesas. Os lançamentos financeiros originais não são duplicados como entradas/saídas. O formato v3 recebe `settlements: []` por padrão, preservando a compatibilidade com registros existentes.

`receiptRepository` isola arquivos em IndexedDB por namespace. A interface guarda somente metadados no registro financeiro; a exportação JSON não inclui blobs. Falhas de gravação do registro permitem remover o anexo novo; estornos preservam arquivo e histórico. Uma futura integração cloud deve substituir esse adaptador, com autorização por grupo e tratamento de falhas entre operações de arquivo e banco.
