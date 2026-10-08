# Experiência e dashboard

> Arquitetura geral aprovada em 08/10/2026. Este documento define o destino planejado; consulte [progresso](progress.md) e [tasks](tasks/README.md) para saber o que está implementado.

A navegação principal terá: **Visão geral, Movimentações, Contas e cartões, A receber e a pagar, Orçamento e Importações**.

A ação global “Nova movimentação” adaptará os campos para receita, despesa, transferência, compra, compromisso ou liquidação. O usuário poderá lançar uma despesa sem conta bancária cadastrada, deixando explícito quando não há informação suficiente para calcular o caixa.

A tela de importação terá revisão em tabela, edição em lote, filtros por pendência, comparação com possíveis correspondências e um resumo final. Uma fatura válida com centenas de compras poderá ser confirmada em conjunto.

Na tela de cartão, limite informado e limite estimado terão identificação de origem e data. A soma da fatura atual não será apresentada automaticamente como todo o limite utilizado. Histórico incompleto produzirá aviso de cobertura.

O dashboard anual distinguirá:

- Meses anteriores: registros efetivos e lacunas conhecidas.
- Mês atual: realizado e compromissos ainda previstos.
- Meses futuros: recorrências, parcelas, compromissos e estimativas identificadas.
- Resultado mensal, caixa, orçamento e reembolsos em indicadores separados.

Para evitar dupla contagem nas projeções, propõe-se calcular o complemento de despesas variáveis por categoria como:

`máximo(orçamento da categoria − realizado − compromissos já incluídos, zero)`

O orçamento só adicionará o que ainda não está representado. Sem orçamento ou histórico suficiente, o sistema exibirá projeção incompleta, sem classificar automaticamente o restante da renda como dinheiro livre.

Após alterações, as consultas de movimentações, faturas, recebíveis, orçamento e dashboard serão invalidadas conforme os dados afetados. TanStack Query oferece esse mecanismo; a resposta do backend só indicará sucesso depois da persistência. [Invalidação de consultas](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)

A interface deverá funcionar por teclado, apresentar erros junto aos campos, manter foco previsível e oferecer dados tabulares equivalentes aos gráficos.
