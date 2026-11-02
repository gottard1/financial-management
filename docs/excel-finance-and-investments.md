# Regras opcionais de controle financeiro e investimentos

## Compatibilidade e origem

A referência `controleFinanceiroPrimeMarcel.xlsm` foi aberta somente para leitura. A análise extraiu fórmulas do XML e descompactou os módulos VBA do arquivo OLE, sem abrir Excel, executar macros ou recalcular o arquivo. Nenhum lançamento, posição, avaliação ou receita foi importado para o aplicativo.

Foram conferidas as abas Inputs, Mastersheet Gastos Aux, Mastersheet Gastos, Mastersheet Entradas, Controle 2025/2026/2027, Eventos e Saldo Fundos, além dos módulos Saida e Entradas. Evidências das regras:

- `Inputs!F1` usa `dia > fechamento`: no próprio dia a compra continua na fatura atual; `I1` trata a mudança de ano. O aplicativo usa calendário contínuo, sem limitar a recorrência ao fim do ano.
- `Saida` divide o valor total por `num_parcela` para compras parceladas, mas repete o valor integral quando `rep > 1`. O aplicativo diferencia essas opções e conserva os centavos.
- `Saida` escreve em **Mastersheet Gastos Aux**; os relatórios consultam **Mastersheet Gastos**. Essa duplicidade de fontes não foi reproduzida.
- O relatório **Com Quem** de 2026 usa incorretamente `Mastersheet Entradas!M:M` como critério de essencial. O aplicativo filtra `essential` na própria despesa, combinando-o com evento e classificação de companhia.
- **Eventos** usa categoria e nome do evento nos `SUMIFS`. O aplicativo liga despesas a IDs de eventos e apresenta totais por categoria, sem copiar lançamentos.
- `Controle 2026!B35` contém 53,8%. Existem entradas manuais nas linhas de metas, inclusive `G44` em uma sequência de fórmulas. Esses valores não são tratados como regras gerais nem transformados em aportes automáticos.
- A coluna de valores de recebimentos desta cópia não tem valores numéricos diferentes de zero. Isso não informa a renda real do titular; os dados não foram usados como situação financeira da conta.

O comportamento anterior foi confirmado no código: mês pelo vencimento, valor de uma parcela, revisão das recorrentes do mês anterior, disponível por responsabilidade pessoal mais cotas de grupos menos aportes, reservas acumuladas por aportes e comparação de até 24 meses. Essas opções permanecem disponíveis.

## Onde usar

| Área              | Recursos                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Categorias        | Cadastro de despesas, categorias de receitas e tipos de investimentos. Despesas e orçamento continuam usando o catálogo existente.             |
| Despesas          | Essencial opcional, evento, Com quem, cartão, compra, parcelas por valor unitário ou total, geração explícita e recorrência finita/infinita.   |
| Faturas e eventos | Cadastro e edição de cartões e eventos, consulta de faturas e totais dos eventos por categoria.                                                |
| Receitas          | Recebimentos com data, descrição, categoria e valor; integração mensal explícita com o perfil.                                                 |
| Orçamento         | Estratégia opcional de economia e distribuição, com aportes fixos sugeridos por destino.                                                       |
| Metas e reservas  | Aportes existentes, saldo inicial, retirada, transferência e consulta de saldo por objetivo/data.                                              |
| Investimentos     | Ativos, aplicações, resgates, rendimentos, taxas, impostos, ganhos/perdas realizados e avaliações manuais datadas.                             |
| Visão anual       | Doze meses de fluxo, patrimônio ao fim do ano, progresso das metas e compromissos de parcelas. Análises de até 24 meses continuam disponíveis. |

## Faturas e parcelas

Sem cartão, `date` continua sendo o vencimento e determina o mês. Com cartão, `purchaseDate` é a data original, `invoiceMonth` é o mês do fechamento e `date` é o vencimento. O resumo usa a competência da fatura apenas para lançamentos com cartão.

Fechamento e vencimento aceitam dias de 1 a 31. Datas inexistentes são limitadas ao último dia do mês. Se o dia de vencimento é anterior ou igual ao fechamento, o vencimento ocorre no mês seguinte. Cada lançamento guarda `cardTerms`: editar o cadastro do cartão não altera faturas já registradas. Alterar compra ou cartão no formulário recalcula os termos explicitamente. Parcelas seguintes preservam a data original de compra e avançam competência e vencimento.

O padrão continua **valor de uma parcela**, sem gerar o futuro. No modo **total da compra**, `purchaseTotal` guarda o total e o resto em centavos vai para as primeiras parcelas. Exemplo: R$100/3 = R$33,34 + R$33,33 + R$33,33. A revisão não modifica parcelas com total conservado; pode-se mudar explicitamente para o modo unitário ao editar. Cada ocorrência é independente: editar uma não reescreve parcelas já geradas.

A geração cria pendências identificadas pela mesma origem; a revisão das recorrentes e a projeção consultam as origens/competências existentes. Gerar novamente não duplica ocorrências. Valores variáveis ainda exigem revisão. Recorrências por quantidade de meses repetem o valor integral e têm contagem própria, separada das parcelas. Há limite operacional de 600 parcelas por geração e projeção de até 600 meses adicionais por origem; grupos também respeitam o limite transacional do servidor de 450 registros alterados. Não há geração automática ao abrir um mês.

## Receitas e fluxo

`months` e os perfis continuam salvos. A opção `receiptMode` vale somente para a pessoa e mês escolhidos:

- **Complementar (padrão):** perfil mais recebimentos que não estão marcados como incluídos no perfil. O cadastro começa com essa marca ligada para evitar repetição acidental.
- **Perfil:** somente o valor mensal anterior; lançamentos detalham esse valor.
- **Lançamentos:** somente recebimentos individuais daquele mês.

Sem recebimentos e sem nova configuração, o resultado antigo é idêntico. A mesma renda integrada alimenta o rateio proporcional, sem alterar VA/VR ou os cálculos tributários existentes. Um resgate é registrado na reserva/investimento, nunca como recebimento novo.

```text
Saldo antes dos aportes = renda nova − despesas por responsabilidade
Aportes do mês = aportes existentes + depósitos do caixa nas reservas
Disponível = saldo antes dos aportes + resgates para o caixa
             − aportes do mês − aplicações vindas diretamente do caixa
Patrimônio do espaço = saldo das reservas + valor atual dos investimentos
```

Transferências entre reservas e aplicações financiadas por reservas não descontam novamente o caixa. Resgates destinados à reserva não aumentam o disponível. Saldo inicial não é receita nem aporte do fluxo mensal. Taxas e impostos do investimento reduzem a posição, separados de consumo pessoal.

## Economia e histórico

A estratégia permanece desativada até ser salva. A meta pode ser percentual da renda nova ou valor em reais. O modelo inicial sugerido é 53,8%, com distribuição 65/20/9/2/1/1/1/1 para Longo prazo, Viagens, Apartamento, Pais, Samantha, Amigos, S2 e Carro novo. A soma precisa ser exatamente 100%, com até duas casas decimais.

Os valores fixos são limitados ao saldo positivo, na ordem dos destinos; o restante é distribuído por maiores restos para conservar centavos. Sugerido e realizado aparecem separadamente. O realizado soma aportes, depósitos e aplicações do caixa classificados com o destino, uma vez cada. Os formulários permitem vincular o objetivo e a classificação da distribuição separadamente. Não há gravação automática de aportes, uso de resgates na meta percentual ou sugestão negativa.

As configurações pertencem ao mês. Copiar outra estratégia abre uma revisão antes de salvar. Ao alterar uma estratégia já salva, sua versão anterior fica em `savingsStrategyHistory`. Nenhuma estratégia recalcula os lançamentos históricos. A meta anterior em reais é preservada e volta a ser a referência dos meses sem estratégia opcional.

O cartão de acumulado e a visualização **soma dos aportes históricos** das metas continuam disponíveis. O seletor permite optar pelo saldo até o fim do mês mais investimentos vinculados. A consulta detalhada das reservas aceita qualquer data e inclui retiradas e transferências.

## Investimentos

Ativos têm nome, tipo, instituição, identificador opcional e objetivo opcional. Cada movimento possui ID, espaço e data; aplicações/resgates escolhem caixa ou reserva. Os rendimentos, taxas e impostos são registrados no ativo. Para receber em caixa um rendimento creditado ao ativo, registra-se também seu resgate, sem repeti-lo em Receitas.

Ganhos/perdas de resgate são informados manualmente nos campos opcionais do próprio resgate, separados dos rendimentos creditados ao ativo. Não se deve repetir o mesmo ganho nos dois locais. Não há cálculo de custo médio, quantidade de cotas, tributação ou lucro de venda automático.

Uma avaliação representa a posição **no fim do dia**, já incluindo todos os movimentos daquela data. Movimentos posteriores ajustam a última avaliação anterior à consulta. Ela não cria aplicação nem rendimento realizado. O ajuste entre valor avaliado e saldo contábil fica separado do resultado realizado informado e pode conter resultados ainda não classificados. Avaliações da mesma posição/data são únicas e podem ser corrigidas por edição.

Aplicações da reserva diminuem o objetivo de origem; o investimento pode acompanhar o mesmo objetivo ou outro. O patrimônio total nunca mantém o mesmo dinheiro simultaneamente nos dois saldos. O progresso líquido soma reserva e posições vinculadas ao objetivo. Saldos negativos por retirada, aplicação ou correção retroativa são bloqueados; as movimentações posteriores também são revalidadas.

## Persistência, grupos e limites

As novas coleções opcionais do formato v3 são `cards`, `events`, `incomeEntries`, `reserveMovements`, `investments`, `investmentMovements` e `investmentValuations`. Ausência significa lista vazia. Migração e serialização não modificam o objeto de origem, os IDs ou as antigas chaves v1/v2. Backup JSON e codec por registro incluem as novas coleções; dados inválidos continuam protegidos contra sobrescrita.

Cadastros e movimentos de grupos usam o mesmo servidor autenticado, revisão e transação da projeção. Participantes ativos podem incluir/editar os registros financeiros permitidos; continuam sem exclusão, alteração de renda pessoal ou privilégios administrativos. Catálogos de categorias dos grupos continuam sob gestão do administrador. A projeção inclui apenas campos explícitos do grupo e nunca inclui recebimentos pessoais, perfis, salários ou benefícios.

Receitas e disponibilidade baseadas nos salários do administrador permanecem privadas. A visão anual de participantes mostra despesas e movimentos patrimoniais compartilhados; sugestões de distribuição baseadas na renda ficam privadas. A configuração da estratégia permanece compartilhada. O resumo pessoal e os compromissos pessoais incluem cotas dos grupos uma única vez. Projeções proporcionais sem renda futura conhecida são sinalizadas como incompletas, nunca apresentadas como uma previsão válida de zero.

As regras e a API modificadas precisam acompanhar uma futura publicação do aplicativo; nenhum push ou deploy faz parte desta execução. Clientes anteriores não reconhecem os novos tipos de registro: sua leitura falha de forma protegida em vez de sobrescrever os dados. Atualize os clientes usados na mesma conta antes de usar as novas entidades. Comprovantes continuam locais e a importação de backup pela interface permanece uma limitação anterior.

## Validação

- `npm run check`: formato, regressões de domínio/armazenamento/servidor/componentes e build.
- `npm run test:rules`: isolamento por UID, novas coleções, convites, concorrência, permissões de grupos e recebimentos no emulador Firestore.
- Testes de domínio adicionais: datas, fechamento, arredondamento, modo unitário antigo, recorrência finita variável, migração sem mutação, backup, sincronização, duplicação, estratégias, resgates, avaliações e patrimônio sem duplicação.
- Conferência com navegador isolado e dados fictícios: cadastro dos três catálogos, cartão/evento, compra total em três parcelas, receita, abertura/retirada de reserva, aplicação de reserva, rendimento, avaliação, estratégia e visão anual; recarga e persistência; tela de 390 px e ausência de erros JavaScript.
