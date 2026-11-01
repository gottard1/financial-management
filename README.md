# Contas & Planos

Controle financeiro pessoal e em grupos, feito em React, com quantidade variável de participantes. Organiza rendas, despesas, orçamento e dinheiro guardado em uma interface responsiva, com os cálculos visíveis antes de salvar.

O nome do repositório é **financial-management**. Contas autenticadas sincronizam os dados financeiros privados no Cloud Firestore e mantêm uma cópia local com alterações pendentes. O modo local de desenvolvimento funciona sem banco. Configure o Firebase e publique as regras antes de habilitar a versão de produção.

## Requisitos

- Node.js **22.12 ou superior**; recomenda-se Node 22 LTS.
- npm, incluído no Node.
- Navegador atualizado.
- O modo local de desenvolvimento não exige banco ou chave de API. Para o login Firebase, configure as variáveis indicadas em [Firebase e Vercel](docs/firebase-setup.md).

## Instalação e execução

Na pasta do projeto:

```powershell
npm ci
npm run dev
```

Abra **http://127.0.0.1:5174/**. O Vite usa porta fixa para manter a mesma origem dos dados locais; se ela estiver ocupada, encerre a instância anterior. Não abra o HTML diretamente pelo explorador de arquivos.

Para verificar a versão de produção:

```powershell
npm run build
npm run preview
```

A prévia de produção fica em http://127.0.0.1:4174/. Como essa origem é diferente, ela terá seu próprio armazenamento de navegador.

## Comandos

| Comando                | Finalidade                                                       |
| ---------------------- | ---------------------------------------------------------------- |
| `npm ci`               | Instala exatamente as versões do lockfile                        |
| `npm run dev`          | Abre o servidor de desenvolvimento local                         |
| `npm test`             | Executa os testes de regras e armazenamento com Node Test Runner |
| `npm run build`        | Compila a aplicação para `dist/`                                 |
| `npm run preview`      | Serve a compilação para conferência local                        |
| `npm run format`       | Formata os arquivos com Prettier                                 |
| `npm run format:check` | Confere o padrão de formatação                                   |
| `npm run check`        | Confere formatação, testes e compilação                          |

O workflow `.github/workflows/validate.yml` executa a mesma verificação em pushes e pull requests, após os arquivos serem enviados ao GitHub. Nenhum push ou deploy é feito pelo aplicativo.

## Como começar

1. Em **Pessoas e grupos**, cadastre as pessoas.
2. Crie um grupo com seu nome, como Casa, Família ou Viagem, e convide outras pessoas por e-mail. Não há limite fixo de participantes.
3. Em **Perfil**, confira seus dados e salve sua renda e seus benefícios do mês.
4. Use **Individual** para os gastos pessoais ou **Grupo** para escolher um espaço compartilhado.
5. Ao lançar uma despesa, selecione quem participa, a forma de divisão e quem pagou.
6. Confira os valores antes de salvar e os acertos na visão geral do grupo.
7. Abra **Comparar meses** para ver a evolução dos gastos, totais pagos e pendentes e despesas por categoria em um período de até 24 meses.

É possível usar apenas o modo individual, sem criar nenhum grupo. Uma pessoa pode participar de vários grupos e ser cadastrada apenas pelo nome. Com o compartilhamento Firestore ativado, o administrador pode associar um e-mail ao participante existente; após entrar com Google e aceitar o convite no aplicativo, a pessoa consulta, cria e edita os dados do grupo com sua própria conta, preservando o histórico. Exclusões, remoção de membros e limpeza de histórico continuam exclusivas do administrador. Veja a [ativação e os limites do compartilhamento](docs/firebase-setup.md#ativar-convites-e-consulta-compartilhada).

## Funcionalidades

### Perfil

- A aba **Perfil** reúne os dados pessoais da própria conta e a renda e os benefícios de cada mês.
- Permite editar nome, telefone, cidade e ocupação. O e-mail de acesso aparece somente para consulta.
- O login Google preenche o nome inicial automaticamente. Nomes personalizados são preservados.
- Telefone, cidade, ocupação, salário e benefícios não são publicados na projeção compartilhada dos grupos.

### Espaço individual

- Cada pessoa pode registrar os próprios gastos, sem obrigatoriedade de dividir.
- Há um seletor da pessoa e do mês de referência.
- O resumo pessoal inclui **despesas pessoais + sua parte nas despesas de todos os grupos de que participa**.
- A tabela de despesas pessoais mostra apenas seus lançamentos; as contas compartilhadas são gerenciadas no espaço Grupo.
- Rendas, limites, metas e aportes são identificados pelo espaço e mês.

### Espaços de grupo

- Exclusão de grupos com histórico preservado para consulta, ou exclusão definitiva do histórico por confirmação digitada. A limpeza definitiva remove os registros financeiros daquele grupo e os convites, preserva pessoas e rendas e mantém apenas um pequeno marcador remoto de bloqueio.
- Participantes ativos usam os mesmos painéis para cadastrar e editar despesas, trazer recorrentes, ajustar orçamento e criar metas e aportes. Podem confirmar e estornar os próprios recebimentos e convidar novos membros somente na aba **Pessoas e grupos**. Os dados cadastrais do grupo são editados apenas pelo administrador. Participantes não podem alterar vínculos existentes, excluir registros, remover membros, apagar grupos ou limpar históricos. A edição compartilhada exige a API autenticada do servidor; os dados privados das contas permanecem isolados.

- Crie vários grupos e escolha seus membros entre as pessoas cadastradas.
- Divida cada despesa igualmente, proporcionalmente à renda ou com percentuais personalizados que somam 100%.
- Selecione os participantes de cada conta: pode ser o grupo inteiro, um subconjunto ou uma única pessoa.
- Seleção de quem pagou o valor total da conta, entre todos os integrantes do grupo.
- Situação paga ou pendente, categoria, vencimento e indicação de conta fixa.
- Prévia da divisão antes de salvar e edição ou exclusão dos lançamentos.
- Saldos individuais e sugestões de transferências entre devedores e credores, considerando somente despesas pagas.
- O pagador pode ser um integrante que não participa da divisão; nesse caso, recebe o reembolso correspondente.
- Novos integrantes não entram automaticamente em despesas antigas, pois cada conta mantém sua própria lista de participantes.
- Contas recorrentes com valor fixo ou variável. Ao trazer o mês anterior, revise os valores e selecione quais contas copiar; as variáveis exigem o valor atual antes de salvar. As cópias ficam pendentes, sem duplicar a mesma origem ou alterar meses anteriores.
- Compras parceladas com quantidade total e parcela atual. Informe o valor de uma parcela; ao trazer o mês seguinte, a numeração avança até a última e a compra deixa de ser oferecida para cópia. Contas mensais sem prazo continuam disponíveis. Os lançamentos futuros não são criados automaticamente.

### Renda e estimativa do líquido

Em **Pessoas e renda**, selecione uma pessoa e informe seu tipo de recebimento:

| Tipo      | Cálculo                                                                   |
| --------- | ------------------------------------------------------------------------- |
| Líquido   | Valor já líquido menos descontos adicionais informados                    |
| CLT       | Bruto − INSS progressivo − IRRF após redução − outros descontos           |
| MEI comum | Receita − DAS conforme atividade − custos informados                      |
| Outro PJ  | Receita − tributos pela alíquota informada − custos fixos − outros custos |

O resultado detalha cada desconto. Apenas o líquido salvo entra no orçamento e na proporção das contas. Cada pessoa pode usar um tipo de renda diferente; o perfil e a renda são salvos por mês. Os nomes são globais.

Cada pessoa também pode informar, por mês:

- **Bonificação líquida em dinheiro**, como um adicional já recebido após os descontos aplicáveis.
- **Outras entradas líquidas**, sem recalcular sua tributação.
- **Vale-alimentação (VA)** e **vale-refeição (VR)**, registrados separadamente do dinheiro disponível.

A renda em dinheiro é o líquido da renda principal mais os adicionais líquidos. Ela alimenta o orçamento e a proporção das contas. VA e VR aparecem como benefícios de alimentação: não aumentam o disponível em dinheiro, não alteram o rateio e não representam saldo remanescente do cartão, pois o consumo dos benefícios ainda não é acompanhado.

Os adicionais devem ser informados sem repetir valores já incluídos na renda principal. Um bônus bruto ou de natureza tributária especial precisa ser convertido para o líquido antes do registro; o aplicativo não presume que bonificações sejam isentas. Descontos de participação no VA/VR podem ser informados em outros descontos, caso ainda não estejam na renda líquida registrada.

O resumo de renda permanece visível. Valores tributados, premissas e fontes ficam recolhidos em **Ver descontos e cálculo** e só são exibidos quando solicitados.

A simulação CLT usa tabelas de **2026**, um vínculo e uma fonte pagadora. Compara deduções legais com o desconto simplificado, sem acumular ambos. FGTS patronal não reduz o salário. Outros descontos financeiros não são presumidos dedutíveis para o IR. Não trata férias, 13º, múltiplos vínculos ou ajuste anual.

Para MEI, o resultado representa caixa após DAS e custos, não renda pessoal fiscal, lucro distribuível ou cálculo de IRPF. Não inclui MEI Caminhoneiro nem verifica elegibilidade ou limites de receita. PJ não tem alíquota única: a taxa e os custos são configuráveis, sem inferir anexo, fator R ou pró-labore.

As tabelas de 2026 ficam explícitas inclusive quando outro ano é selecionado. Nesses casos, há aviso na tela; para usar valor real de outro período, selecione renda já líquida. Um líquido negativo é mostrado na simulação e não pode ser salvo até corrigir os dados.

Veja as [fontes oficiais e premissas](docs/income-calculations-2026.md).

### Orçamento

- Limite de gastos total por espaço e mês.
- Limites independentes por categoria.
- Meta de quanto guardar no mês.
- Comparação de gastos previstos com o limite, incluindo contas pagas e pendentes.
- Zero representa ausência de limite.

### Metas e reservas

- Metas com nome, valor desejado e prazo opcional.
- Aportes com valor, data, observação e destino (meta ou reserva livre).
- Valor guardado no mês, acumulado registrado e progresso de cada meta.
- Aportes não contam como despesa e são descontados uma única vez do disponível.
- Exclusão de aportes para corrigir registros; metas com aportes vinculados não podem ser apagadas antes deles.

## Regras dos cálculos

Todos os valores monetários de domínio são **centavos inteiros**. Operações de rateio usam razões inteiras com `BigInt`, evitando deriva de ponto flutuante.

- O valor é distribuído pelo método dos maiores restos: cada parte recebe os centavos inteiros e os restantes vão para as maiores frações. Empates seguem a ordem dos participantes da despesa.
- A soma das partes sempre coincide com o total.
- Proporcional: `parte = valor × renda líquida individual / soma das rendas`.
- Renda total zero entre os participantes bloqueia a divisão proporcional. A divisão igual continua disponível, inclusive com apenas um participante selecionado.
- Alterar a renda recalcula as contas proporcionais daquele mês. As rendas de outros meses são mantidas.
- Contas pendentes entram no orçamento, mas não no acerto de pagamentos.
- A API retorna saldos por ID e transferências sugeridas com origem, destino e valor. Saldo positivo significa valor a receber; negativo, valor a repassar.

```text
Gastos pessoais previstos = despesas pessoais + sua parte nas contas dos grupos
Disponível previsto = renda líquida − gastos previstos − aportes do mês neste espaço
Saldo do participante = total pago − sua responsabilidade nas despesas pagas
Saldo positivo = tem a receber; saldo negativo = tem a repassar
```

O disponível é uma previsão por responsabilidade, **não o saldo bancário**. Os espaços têm reservas independentes: um aporte do grupo não é novamente atribuído aos espaços individuais. O resumo do grupo cobre apenas contas e aportes daquele espaço; não agrega despesas pessoais. Não some os totais de espaços diferentes como se fossem independentes, pois cotas compartilhadas aparecem nos painéis pessoais.

## Arquitetura

```text
src/
  main.jsx                         # Inicialização React
  app/App.jsx                      # Composição de telas e estado de navegação
  components/
    layout/                        # Navegação lateral e seletor de espaço
    ui/                            # Progresso e avisos compartilhados
  features/
    overview/                      # Resumo mensal e análise do orçamento
    expenses/                      # Formulário e lista de despesas
    income/                        # Formulário e simulação da renda
    budget/                        # Limites e metas mensais
    savings/                       # Metas e aportes
    groups/                        # Cadastro de pessoas, grupos e composição
  domain/
    expenses/                      # Dinheiro, rateio e acerto
    income/                        # Estimativa líquida, adicionais, benefícios e tabelas versionadas
    budget/                        # Agregação por pessoa/espaço e migração
  hooks/                           # Estado React e persistência
  infrastructure/storage/          # Adaptador localStorage e serialização
  shared/constants/                # Categorias compartilhadas
  styles/                          # Estilos e responsividade
  **/*.test.js                     # Testes próximos ao módulo testado
docs/                              # Arquitetura, evolução e fontes de cálculo
.github/workflows/                 # Verificação automática
```

Direção de dependência: **interface → hooks/domínio; armazenamento → domínio**. O domínio não importa React, navegador, Firebase ou componentes. Os componentes de interface reutilizam as mesmas funções testadas dos resumos.

Os repositórios isolam `localStorage`, migração, exportação e Firestore. O coordenador de sincronização serializa gravações, retoma alterações pendentes e detecta conflitos por revisão. O hook controla o ciclo React; funcionalidades ficam em pastas por domínio de uso. O SDK de banco fica concentrado na infraestrutura.

Leia [decisões e evolução da arquitetura](docs/architecture.md) antes de adicionar funcionalidades.

## Dados, sincronização e privacidade

- Contas autenticadas salvam rendas, benefícios, despesas, grupos, planos, metas, aportes e repasses na área privada `users/{uid}/finance` do Firestore. Somente o titular pode ler ou escrever essa área.
- A cópia em `localStorage`, chave `financial-management-v3`, fica isolada por UID e permite preservar alterações enquanto o envio à nuvem está pendente. O modo local de desenvolvimento não autentica nem sincroniza.
- A primeira conexão migra a cópia local da mesma conta quando o servidor confirma que não há dados na nuvem. Outro dispositivo carrega os dados já existentes; versões locais divergentes ficam protegidas para exportação e resolução explícita.
- O status do aplicativo distingue carregamento, alterações pendentes, salvamento confirmado, falha e conflito. Uma alteração ainda pendente não deve ser considerada salva na nuvem.
- Formatos antigos v1/v2 são migrados para pessoas e grupos por IDs, preservando as chaves originais sem sobrescrevê-las.
- Pessoas, rendas, despesas, planos, metas e aportes passam a usar IDs estáveis, sem depender da posição em uma lista.
- Dados inválidos são preservados e a persistência fica bloqueada para evitar sobrescrita.
- Há exportação JSON. A importação de backup pela interface ainda não foi implementada.
- Limpar dados do navegador apaga comprovantes e alterações ainda não sincronizadas. Dados confirmados na nuvem são recuperados com o mesmo login. Exporte backups antes de limpar o navegador.
- Host, protocolo, porta, navegador e perfil definem a origem. `localhost` e `127.0.0.1` não compartilham dados. Mover os arquivos do projeto não altera os registros se a URL continuar a mesma.
- Conflitos de revisão impedem sobrescrita silenciosa. O usuário pode exportar sua versão local e carregar a nuvem; a versão local também é arquivada no navegador antes dessa troca. Não há mesclagem ou importação de backups pela interface.

Backups contêm informações financeiras. A pasta `backups/`, nomes de exportação e credenciais estão no `.gitignore`. Não versione dados pessoais nem chaves privadas.

## Verificação

No computador, as despesas aparecem em tabela. Em telas menores, a navegação fica no rodapé e as despesas são apresentadas em cartões, preservando as mesmas ações e cálculos. Formulários e seletores se reorganizam por largura, sem manter uma barra lateral ocupando a tela do celular.

Os testes cobrem rateio com 1, 3, 5 e mais participantes, conservação de centavos, subconjuntos, percentuais, vários credores e devedores, pagador fora da divisão, pendências, rendas zeradas, tributos de 2026, migração, isolamento de grupos, aportes, limites e proteção do armazenamento original.

Antes de abrir uma alteração:

```powershell
npm run check
```

Também confira no navegador: fluxos individuais e de grupo, cadastro e edição, mudança de mês/pessoa, prévias de cálculo, salvar/recarregar, tela pequena e navegação por teclado.

## Próximas etapas

- Sincronização de arquivos de comprovantes e restauração de backups pela interface.
- Importação de backups e retiradas das reservas.
- Pagamentos parciais, múltiplos pagadores e transferências entre espaços.
- Fechamento de mês com snapshots para preservar divisões antigas.
- Relatórios exportáveis a partir do histórico mensal.
- Tabelas tributárias selecionadas por competência.
- Publicação Vercel após concluir a versão local.

## Modelo de dados

O formato v3 contém `people`, `groups`, `months`, `incomeConfigs`, `expenses`, `plans`, `goals`, `contributions` e `settlements`. Rendas e configurações mensais são mapas por ID da pessoa. Grupos contêm seus `memberIds`. Despesas guardam o `payer`, seus `participants` e os `percentages` quando personalizados. Veja os [campos dos models e as opções de evolução](docs/architecture.md#models-e-extensões).

Escopos usam `person:<id>` e `group:<id>`. Uma conta em grupo nunca é duplicada para gerar os resumos pessoais; as cotas são derivadas pelo mesmo motor de rateio. Os cadastros de pessoas e grupos são preservados. É possível renomear grupos, adicionar, remover e reativar integrantes. A remoção conserva os IDs históricos em `memberIds`, registra os inativos em `removedMemberIds` e revoga convites e acesso da conta vinculada, sem apagar despesas ou repasses. O grupo mantém pelo menos um integrante ativo.

## Limitações atuais

Uma despesa tem um pagador para seu valor total. Repasses confirmados abatem o saldo; o dinheiro não é movimentado pelo aplicativo. A inclusão de contas recorrentes é explícita e permite revisar o valor de cada mês antes de salvar. Metas não calculam rendimentos ou retiradas. O aplicativo não acessa bancos nem realiza transações. As estimativas tributárias servem para orçamento e não substituem conferência da folha ou apuração fiscal.

O projeto permanece privado, sem licença de distribuição definida. Uma licença pode ser adicionada quando a forma de disponibilização for decidida.

## Login e publicação

O acesso usa exclusivamente Google; o primeiro login cria a conta automaticamente. Convites começam pelo e-mail, com consulta autenticada do nome no servidor e nome provisório para quem ainda não tem conta. Configure o aplicativo Web e os provedores seguindo [Firebase e Vercel](docs/firebase-setup.md). Sem configuração, o login fica pendente. O modo local sem autenticação está disponível somente em desenvolvimento; produção não oferece esse acesso.

O SDK autentica a conta e os dados financeiros usam Firestore com regras privadas por UID. Os arquivos de comprovantes permanecem locais. Dados antigos do modo local são preservados e não são importados automaticamente para uma conta autenticada. Consulte [ativação e migração](docs/firebase-setup.md#persistência-financeira-privada).

## Repasses recebidos

No espaço Grupo, abra **Repasses e comprovantes** para confirmar devoluções totais ou parciais e, opcionalmente, anexar um comprovante. Os recebimentos reduzem o saldo a repassar sem criar receita ou despesa. O histórico permite estornar um registro incorreto, mantendo o comprovante. Veja [regras e armazenamento de comprovantes](docs/settlements.md).

A versão atual usa arquivos JPG, PNG, WEBP ou PDF de até 5 MB, salvos no IndexedDB deste navegador. O JSON exportado guarda os metadados, não os arquivos.
