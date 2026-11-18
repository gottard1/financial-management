# Repasses e comprovantes

## Como usar

1. Selecione o espaço **Grupo** e o grupo desejado.
2. Escolha o mês de referência da dívida.
3. Abra **Repasses e comprovantes** ou use o botão na visão geral do grupo.
4. Abra **Ver detalhamento** para conferir as despesas, quem pagou, a parte devida em cada sentido, o valor compensado e os repasses confirmados da dupla. Quem deve usa **Devolver** para abrir o registro junto à dupla, confere o valor (total ou parcial) e clica em **Informar devolução** depois de enviar o dinheiro. O resultado ou eventual erro aparece junto ao repasse. O saldo só baixa após a confirmação de quem recebe. Quem recebe pode usar **Já recebi** ou **Recebi uma parte**.
5. Selecione quem devolveu, quem recebeu, o valor e a data real do pagamento. A data pode estar em outro mês; a competência da dívida permanece a selecionada.
6. Se desejar, anexe um comprovante JPG, PNG, WEBP ou PDF de até 5 MB.
7. Após confirmar, o histórico mostra o recebimento e a dívida restante é recalculada.

Repasses parciais são permitidos. Um novo repasse não pode exceder o saldo atual **da dupla**, mesmo que a pessoa tenha créditos ou dívidas com outras pessoas. O restante aparece após a confirmação. Despesas pendentes entram na parte do mês, mas não geram acerto até serem marcadas como pagas.

## O que muda nos cálculos

Em grupos com duas pessoas, as despesas compartilhadas pelas duas são divididas em 50/50, independentemente do método antigo. Despesas de um único participante continuam integralmente atribuídas a ele. Em grupos de três ou mais, cada despesa preserva seus participantes e método (igual, proporcional ou personalizado). O rateio usa centavos inteiros e maiores restos; empates seguem a ordem dos participantes e as partes sempre somam o total.

Cada parte de uma despesa paga gera uma obrigação com quem pagou, exceto a parte do próprio pagador. As obrigações nos dois sentidos são somadas e compensadas **somente dentro de cada dupla**. Duplas zeradas não aparecem. Créditos nunca são redirecionados a terceiros.

Os saldos líquidos individuais continuam disponíveis como resumo contábil, mas não determinam mais as sugestões nem o limite de um novo repasse. Uma pessoa com saldo líquido zero pode ter valores a receber e devolver em duplas diferentes. Para um repasse confirmado de A para B:

```text
saldo[A] += valor recebido por B
saldo[B] -= valor recebido por B
```

O repasse também abate a obrigação de A com B. Não cria despesa, receita ou dinheiro guardado. Os totais de gastos e rendas permanecem inalterados.

O histórico usa `data.settlements`, ainda no formato v3. Cada registro tem ID, grupo, remetente, destinatário, valor, data, competência, observação, estado e comprovante opcional. Somente registros `confirmed` da competência e do grupo selecionados entram no saldo; `void` permanece no histórico sem abatimento.

Novos registros têm `settlementRule: 'pairwise-v1'`. O esquema permanece v3; registros antigos não são regravados nem recebem esse marcador retroativamente. A projeção compartilhada inclui os detalhes públicos das duplas, sem rendas, observações ou metadados privados de comprovantes. Repasses do ledger compartilhado são aplicados uma única vez após a projeção.

### Repasses anteriores e conciliação

A regra anterior guardava remetente, destinatário e valor, mas não a origem por despesa. Podia sugerir A → C quando as despesas geravam A → B e B → C. Portanto, não é seguro redistribuir esse pagamento automaticamente.

Quando os repasses históricos líquidos de uma dupla estão no sentido e dentro do valor devido por ela, são abatidos normalmente. Se não há dívida nessa dupla, se o pagamento está no sentido contrário ou supera a obrigação atual, a competência recebe **Acerto aguardando revisão**. O histórico e os ajustes contábeis são preservados, e todas as novas sugestões/confirmações dessa competência são suspensas para não reabrir valores quitados. Isso também protege contra inconsistências após editar despesas já acertadas. O estorno explícito continua disponível a quem tem permissão; não há estorno, migração ou conciliação automática.

Um grupo antigo de duas pessoas que usava um rateio diferente de 50/50 e tem repasses anteriores sem o novo marcador também exige revisão. Isso evita cobrar a diferença de uma conta que já havia sido quitada pela regra anterior. Projeções compartilhadas antigas, sem os dados de duplas, exigem atualização pelo administrador antes de novos acertos.

Sem os dados de produção, não é possível listar quais grupos têm esses casos. Antes de conciliar um aviso, confira as despesas e o histórico com os participantes. Não altere registros nem cobre diferenças automaticamente.

### Confirmação compartilhada e Firebase

O botão **Devolver** reaproveita `report-payment` e a confirmação do recebedor. Recebimentos diretos usam `receive-payment` na mesma API autenticada `/api/group-finance`. A transação valida acesso ativo, identidade de quem recebe, revisão do grupo, competência, dívida da dupla, valor parcial, IDs duplicados e solicitações pendentes. O Firestore bloqueia confirmações diretas por clientes; o estorno permanece protegido pelas regras existentes de identidade, imutabilidade e revisão do ledger.

Ao publicar esta versão, publique também `firestore.rules` e a API. O frontend precisa da nova ação `receive-payment`, e as regras antigas de saldo global não são compatíveis com acertos por dupla. O código não publica regras ou altera dados de produção durante os testes.

## Correções

Use **Estornar registro** e confirme para desfazer o efeito de um recebimento lançado incorretamente. O registro fica marcado como estornado e o comprovante permanece acessível. Não há exclusão permanente de repasses na interface.

## Comprovantes locais

Os arquivos ficam no IndexedDB deste navegador, isolados por conta ou modo local. A gravação valida tipo, extensão e tamanho. A confirmação do registro é persistida antes de mostrar sucesso; se a gravação dos dados falhar, o novo anexo é removido quando possível.

Use **Visualizar comprovante** para preparar um link de abertura do arquivo. Os arquivos não são enviados à nuvem e não são incluídos na exportação JSON. Limpar os dados do navegador ou usar outro navegador/dispositivo pode deixar os arquivos indisponíveis. O cadastro é um controle manual; não verifica autenticidade ou compensação bancária.
