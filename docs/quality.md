# Estratégia de qualidade e aceite da V1

> Arquitetura geral aprovada em 08/10/2026. Este documento define o destino planejado; consulte [progresso](progress.md) e [tasks](tasks/README.md) para saber o que está implementado.

Importação terá testes desde a primeira entrega. Os arquivos de teste serão sintéticos, reproduzindo estruturas reais sem expor dados pessoais.

| Cenário | Critério verificável |
|---|---|
| CSV e OFX em lote | Cada formato importa uma fatura de 500 compras, com destino, valores e vínculos preservados |
| CSV heterogêneo | Separadores, encoding, aspas, decimais e datas são interpretados ou apontados para configuração |
| OFX 1.x e 2.x | Arquivos bancários e de cartão homologados geram registros normalizados equivalentes |
| OFX sem parcelas | Nenhuma parcela futura ou total de compra é inventado |
| Fatura ausente | Usuário confirma o período ou mantém pendência visível |
| Arquivo inválido | Erro é explicado e nenhum lançamento financeiro indevido é gravado |
| Erro em parte do lote | Linhas problemáticas são corrigidas ou excluídas explicitamente |
| Reenvio e concorrência | Repetições simultâneas não duplicam os efeitos financeiros |
| Compras iguais | Duas compras legítimas de mesmo valor e descrição podem ser preservadas |
| Conciliação manual/importada | Categoria, observações e reembolsos existentes permanecem |
| Parcelamento | A soma das parcelas é exatamente igual ao total, inclusive com centavos indivisíveis |
| Fechamento | Casos na data de corte respeitam informação explícita e sinalizam estimativas |
| Fatura parcial e estorno | Saldo da obrigação é correto e despesas não são duplicadas |
| Reembolso | Calendário independente, pagamentos parciais e múltiplos recebimentos funcionam |
| Compromisso com terceiro | Pagamento reduz a obrigação sem criar outra despesa |
| Salário recorrente | Importação liquida a previsão correspondente uma única vez |
| Recorrências | Dias 30/31, fevereiro, pausas e cancelamentos seguem política explícita |
| Transferências e investimentos | Não aumentam receitas/despesas de consumo indevidamente |
| Projeção | Orçamento, parcelas e despesas já registradas não são somados em duplicidade |
| Isolamento | Usuário A não lê nem altera registros, arquivos ou lotes de B |
| Atualização da interface | Confirmação atualiza os módulos afetados sem recarga manual |
| Recuperação | Reinício de tarefa ou perda da resposta HTTP não deixa importação parcialmente confirmada |

Testes unitários cobrirão as regras financeiras. Testes de integração usarão PostgreSQL real para restrições, transações e concorrência. Testes de API cobrirão autorização e contratos; testes end-to-end cobrirão as jornadas principais.

A CI executará formatação, lint, tipos, testes, build e verificação de migrações, com análise de dependências e segredos. Desempenho terá medição em ambiente documentado; não se propõe um prazo de processamento sem benchmark.

## Evidências

A matriz acima define o aceite futuro da V1; não significa que os cenários já foram implementados. Resultados reais, limitações e comandos executados ficam na task correspondente.
