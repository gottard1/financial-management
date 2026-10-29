# Estimativas de renda — referência de 2026

Fontes oficiais consultadas em 29/10/2026:

- [INSS: tabela mensal de 2026](https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal). Empregado: faixas progressivas até R$ 1.621,00 (7,5%), R$ 2.902,84 (9%), R$ 4.354,27 (12%) e R$ 8.475,55 (14%).
- [Receita Federal: tributação de 2026](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026). IRRF: tabela mensal ordinária; dependente R$ 189,59; simplificado R$ 607,20. Redução sobre rendimentos tributáveis antes das deduções: até R$ 5.000 zera o imposto; entre R$ 5.000 e R$ 7.350 aplica 978,62 − 0,133145 × rendimento, limitada ao imposto calculado.
- [Receita Federal: exemplos da redução](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2025/dezembro/receita-federal-orienta-fontes-pagadoras-e-contribuintes-a-calcular-a-reducao-do-imposto-de-renda-a-partir-de-1o-de-janeiro-de-2026).
- [Simples Nacional: DAS-MEI de 2026](https://www8.receita.fazenda.gov.br/simplesnacional/Noticias/NoticiaCompleta.aspx?id=c3b2044c-ff97-432a-b33c-ecf2a3df6dc3). INSS R$ 81,05; ICMS R$ 1; ISS R$ 5. DAS: comércio R$ 82,05; serviços R$ 86,05; misto R$ 87,05.

## Premissas do aplicativo

- Ferramenta de orçamento mensal, não folha de pagamento nem declaração fiscal. Todas as entradas e saídas monetárias da API usam centavos inteiros.
- CLT: renda bruta integralmente tributável, um vínculo e uma fonte pagadora; comparação entre INSS + dependentes e simplificado. Não acumula os dois descontos. Sem férias, 13º, pensão, previdência privada, remunerações variáveis, benefícios ou ajuste anual. FGTS patronal não reduz salário líquido.
- INSS: calcula faixas sem arredondamento intermediário e arredonda o total ao centavo mais próximo, meio centavo para cima. IR da tabela e redução arredondados separadamente. Sistemas de folha podem produzir diferenças de centavos por convenções de arredondamento.
- Outros descontos são reduções financeiras; não há informação suficiente para presumir dedutibilidade fiscal. O desconto simplificado reduz somente a base do IR, não o dinheiro recebido.
- MEI padrão: saldo de caixa após DAS e custos, não renda pessoal fiscal. Sem MEI Caminhoneiro, teste de elegibilidade, limite de receita, apuração anual ou tratamento do lucro. DAS fixo também em meses sem faturamento.
- PJ: alíquota efetiva e custos definidos pelo usuário; nenhum regime, anexo, fator R ou tratamento do pró-labore é inferido. Alíquota zero é permitida e deve ser conscientemente configurada.
- Líquido informado: não recalcula tributos e desconta somente os outros descontos inseridos.
- Retorno `tax` exclui `inss` e `irrf`; assim `net = gross - inss - irrf - tax - otherDeductions`. No PJ, `otherDeductions` retornado agrega os custos fixos PJ e os demais descontos; `details` separa os dois.
- Déficits retornam `net` negativo de forma explícita na simulação. A interface bloqueia o salvamento da configuração até que a renda ou os descontos sejam ajustados. Não converter silenciosamente o déficit em zero nem usar renda negativa como peso de rateio.
- As tabelas e URLs usadas no cálculo ficam em `domain/income/taxTables2026.js`, com ano de referência explícito. A estimativa continua usando a referência de 2026 ao consultar outros anos; a interface deve apresentar esse limite de vigência.
