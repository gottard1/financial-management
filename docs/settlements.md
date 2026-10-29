# Repasses e comprovantes

## Como usar

1. Selecione o espaço **Grupo** e o grupo desejado.
2. Escolha o mês de referência da dívida.
3. Abra **Repasses e comprovantes** ou use o botão na visão geral do grupo.
4. Uma sugestão de acerto apenas preenche o formulário. Confirme somente quando o dinheiro tiver sido recebido.
5. Selecione quem devolveu, quem recebeu, o valor e a data real do pagamento. A data pode estar em outro mês; a competência da dívida permanece a selecionada.
6. Se desejar, anexe um comprovante JPG, PNG, WEBP ou PDF de até 5 MB.
7. Após confirmar, o histórico mostra o recebimento e a dívida restante é recalculada.

Repasses parciais são permitidos. Um novo repasse não pode exceder a dívida atual de quem paga nem o crédito de quem recebe. Despesas pendentes não geram acerto até serem marcadas como pagas.

## O que muda nos cálculos

O saldo original de cada integrante é o valor que pagou nas despesas menos sua responsabilidade nas contas pagas. Para um repasse de A para B:

```text
saldo[A] += valor recebido por B
saldo[B] -= valor recebido por B
```

O resultado reduz a dívida de A e o crédito de B. Não cria despesa, receita ou dinheiro guardado. Os totais de gastos e rendas permanecem inalterados.

O histórico usa `data.settlements`, ainda no formato v3. Cada registro tem ID, grupo, remetente, destinatário, valor, data, competência, observação, estado e comprovante opcional. Somente registros `confirmed` da competência e do grupo selecionados entram no saldo; `void` permanece no histórico sem abatimento.

Se uma despesa ou renda for alterada posteriormente, a dívida pode mudar. Os repasses históricos são preservados; um saldo pode se inverter quando houve pagamento maior que a obrigação recalculada. Nesse caso a aplicação sugere o acerto correspondente, em vez de apagar o histórico.

## Correções

Use **Estornar registro** e confirme para desfazer o efeito de um recebimento lançado incorretamente. O registro fica marcado como estornado e o comprovante permanece acessível. Não há exclusão permanente de repasses na interface.

## Comprovantes locais

Os arquivos ficam no IndexedDB deste navegador, isolados por conta ou modo local. A gravação valida tipo, extensão e tamanho. A confirmação do registro é persistida antes de mostrar sucesso; se a gravação dos dados falhar, o novo anexo é removido quando possível.

Use **Visualizar comprovante** para preparar um link de abertura do arquivo. Os arquivos não são enviados à nuvem e não são incluídos na exportação JSON. Limpar os dados do navegador ou usar outro navegador/dispositivo pode deixar os arquivos indisponíveis. O cadastro é um controle manual; não verifica autenticidade ou compensação bancária.
