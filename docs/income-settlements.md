# Liquidações explícitas de receitas — RF-028

P3-03 aprovada expressamente pelo usuário em 14/10/2026: recebimentos parciais e múltiplos movimentos; acima do previsto exige corrigir explicitamente a previsão ou escolher outro destino confirmado, deixando o excedente sem alocação; abaixo do previsto não quita o restante. Não inferir tributos, tarifas, baixa, salário, transferência própria ou reembolso por sinal/descrição. [ADR-0015](decisions/0015-explicit-income-settlements.md). Demais propostas da fase 3 continuam pendentes.

## Previsão, movimento e vínculo

Income continua previsão manual. IncomeSettlement associa valor positivo BRL a um BankEntry existente confirmado via CSV/OFX; não cria receita, despesa, movimento bancário, saldo ou orçamento. Data efetiva vem do BankEntry, separada da data prevista. Previsto desconhecido/cancelado não recebe alocação; zero confirmado não representa recebimento. Um movimento pode atender várias receitas; uma receita pode ter vários movimentos, sem rateio automático.

Previsto vem dos fatos da receita; recebido é soma inteira das alocações ativas. Pendente é previsto menos recebido quando conhecido e fontes atuais; diferença é recebido menos previsto (assinada). Estados derivados: unknown, unreceived, partial, received, no_expected_amount, cancelled, review_required. Valor zero usa no_expected_amount, sem pagamento sintético. Consulta não classifica Pix/transferência/reembolso automaticamente.

Correção que limpe o valor ou o reduza abaixo do já recebido é recusada com revisão explícita dos vínculos: manter/corrigir o valor esperado ou reverter somente associação incorreta antes de editar. Não diminuir recebimento histórico, apagar reservas ou gerar devolução. Cancelar exige nenhuma alocação ativa; reverter preserva movimento/histórico, libera somente a reserva e permite nova decisão explícita. Reversão não é estorno de caixa.

## Disponibilidade conjunta e transação

BankEntryConfirmation guarda direção inflow/outflow, magnitude integral igual ao original e evidência manual. Sinal é preservado e não confirma direção. Magnitudes zero, MIN_CENTS sem magnitude positiva representável e overflow são rejeitados. Confirmação é permanente nesta fatia, inclusive após reversão; trocar direção exige fluxo futuro de revisão, sem reinterpretar silenciosamente o movimento. Backfill conserva saídas de StatementPaymentSource e seus IDs/evidências/reservas; trigger e FK composta impedem confirmação incompatível por outro escritor SQL.

Pagamentos de fatura e receitas consultam a mesma soma de todas as reservas ativas, no mesmo módulo de disponibilidade. Escritas revalidam proprietário, direção, fonte atual, versões da receita/movimento e limites da origem/destino sob trava User na mesma transação. Avançam ambas as versões e gravam IncomeCommand atomicamente. Correções/cancelamento da RF-027 usam a mesma trava e guardas de dependências. FKs tipadas por proprietário/conta, alocações imutáveis com reversão única e journal imutável.

Fonte alterada torna disponibilidade desconhecida e exige revisão, conservando reservas; novas alocações recusadas, reversões explícitas continuam permitidas. Disponível é do movimento, nunca saldo da conta. Não usar consultas exclusivas por módulo para reutilizar dinheiro já reservado.

## HTTP e interface

| Rota | Contrato |
|---|---|
| GET `/api/incomes/:id/settlements?page=1` | Receita atual, resumo, alocações paginadas (25) e bankEntry null |
| POST `/api/incomes/:id/settlements` | expectedVersion, bankEntryId, expectedBankVersion, confirmedInflow, inflowConfirmed:true, amount |
| POST `/api/incomes/:id/settlements/:settlementId/reverse` | expectedVersion, expectedBankVersion, reversalConfirmed:true |
| GET `/api/bank-entries/:id/settlement-source` | Movimento original, versão, confirmação explícita de direção, todas as reservas e disponível |
| GET `/api/incomes/:id/history` | Journal unificado, últimas 20 versões; inclui associação/reversão e snapshots privados |

Sessão própria, Origin confiável, JSON até 16 KiB; Idempotency-Key em toda escrita, mesmo namespace por usuário de IncomeCommand da RF-027. Retry conserva ação/destino/versões/chave/corpo original e recupera resultado após resposta perdida, edição e restart; outro payload conflita. GET/listas são paginados, sem conta arbitrária de outro usuário. Falhas de journal desfazem confirmação, reserva e ambas as versões. Erros JSON redigidos inclusive no prefixo bank-entries. OpenAPI mantém exemplos fictícios, guardas, CSRF, limites e política RF-026.

UI seleciona manualmente conta/movimento já importado, confirma direção/magnitude e valor destinado. Mostra previsto/recebido/pendente/diferença, data efetiva e reservas compartilhadas. Não preenche magnitude ou valor a alocar por sinal/descrição. Confirmação de reversão explícita. Resposta incerta conserva corpo/chave/formulário enquanto tela montada; recuperação não duplica vínculos. Conflito permite atualizar projeção antes de decidir novamente; consultas afetadas são invalidadas sem reload completo.

## Limites

Sem movimentos manuais, recorrências, terceiros, sugestões automáticas, compensação ou orçamento. Antes de novos consumidores, ampliar obrigatoriamente a consulta compartilhada e seus testes de corrida. [Task/evidências](tasks/phase-3.md), [previsões](planned-incomes.md), [pagamentos de fatura](statement-payments.md).
