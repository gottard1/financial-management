# VA/VR e fontes de pagamento

Na despesa pessoal ou compartilhada, escolha **Fonte do pagamento**: dinheiro/conta/cartão, VA ou VR. A ausência do campo nos registros antigos mantém dinheiro como fonte e preserva os resultados anteriores. Não há conversão automática de despesas de alimentação em gastos com vale.

## Controle do mês

A aba individual **VA / VR** apresenta cada vale separadamente:

- Valor informado no perfil de renda daquele mês (também pode ser editado nesta aba).
- Gastos: valor total das despesas pagas com o vale do titular.
- Restante no mês: valor informado menos gastos pagos.
- Compromissos: despesas pendentes marcadas para usar aquele vale.
- Restante após pendências: valor informado menos gastos e compromissos.
- Categorias dos gastos pagos e lista de lançamentos com filtros por vale, categoria e situação.

Valores excedentes são sinalizados como déficit, sem esconder gastos nem impedir seu registro. Registrar uma despesa não cria créditos de benefício. Não há transporte automático de sobras entre meses; o restante do mês não é uma consulta de saldo da operadora. O mês é o vencimento da despesa. VA/VR não pode compor uma fatura de crédito; selecione **Sem cartão** antes de escolher o vale.

Despesas pagas descontam o vale; pendentes apenas comprometem o valor previsto. Editar valor, fonte, situação, pagador ou mês recalcula a visão sem criar movimentos em duplicidade. Excluir um lançamento desfaz seu efeito. Recorrências preservam a fonte e continuam pendentes ao serem trazidas; valores variáveis exigem novo preenchimento. Meses anteriores não são reescritos ao copiar.

## Caixa, orçamento e grupos

O total de consumo e as categorias continuam somando todas as despesas, inclusive VA/VR. O saldo antes dos aportes, o disponível e as sugestões de economia usam somente as responsabilidades em dinheiro; a renda de salário e o rateio proporcional não incluem o benefício. A visão anual mostra consumo, responsabilidades em dinheiro e parte coberta pelo vale separadamente.

Nos grupos, o vale é do pagador escolhido. O valor integral da conta sai do vale dele, mesmo quando não participa da divisão. O rateio, as cotas, o total pago, os saldos e os acertos continuam iguais. A própria cota do pagador coberta pelo vale não desconta seu dinheiro disponível; as cotas dos demais continuam como responsabilidades em dinheiro. Exemplo: conta de R$100 dividida igualmente e paga com o VA de Ana: VA de Ana gasta R$100, a própria cota de R$50 fica coberta pelo vale, e Bia continua devendo R$50 a Ana. Um repasse confirmado reduz o acerto conforme o fluxo existente, sem ser classificado como renda nova.

A aba inclui pagamentos com seu vale em grupos administrados e convidados, usando a identidade autenticada da associação. Cada lançamento entra uma vez. A fonte e o gasto do grupo são compartilhados; os valores recebidos e o restante de VA/VR ficam privados. Carregamento ou falha dos grupos sinaliza totais parciais. Não consulta perfis de outros membros.

## Dados e validação

O campo opcional `paymentSource` aceita `cash`, `foodAllowance` ou `mealAllowance`. Todos os valores continuam em centavos inteiros. Backup, armazenamento local, codec e sincronização usam o documento de despesa existente. Créditos mensais permanecem em `incomeConfigs`, sem criar outra fonte de crédito. Não há nova coleção ou mudança de `firestore.rules`.

A API de grupos aceita esse campo por lista explícita, valida os valores e publica a projeção na mesma transação financeira. Permissões anteriores continuam valendo: associação ativa para editar, sem acesso a dados privados, exclusões ou alterações de renda por participantes.

Há regressões para compatibilidade por ausência, centavos, estouro numérico, pagamentos/pendências, troca de fonte, edição/exclusão, isolamento por pessoa/mês, virada do ano, recorrência variável sem duplicação, codec/backup, grupos convidados, identidade do pagador, rateio intacto e permissões. `npm run check` executa formato, testes e build; `npm run test:rules` verifica a persistência e o isolamento no emulador. O fluxo de interface é conferido com dados fictícios em navegador isolado.

O lançamento usa uma fonte para o valor inteiro. Pagamento parcial misturando dinheiro e vale e saldo acumulado de operadora ficam para uma evolução do modelo de pagamentos.
