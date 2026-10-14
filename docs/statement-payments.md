# Pagamentos e alocações bancárias — RF-024

Uma alocação vincula parte de uma saída bancária própria a uma fatura própria. Usa BankEntry já confirmado, não cria outro movimento ou Expense, não altera origem/sinal/data e não gera juros presumidos. Data do caixa permanece a do movimento, independente da competência da fatura. Classificar linha de cartão como pagamento não liquida obrigação: pagamentos informados são somente evidência separada e não são descontados novamente.

## Base e saldo conhecido

Antes de alocar, o usuário confirma uma base: total declarado conhecido ou total calculado completo com cobertura atual. A escolha é explícita, inclusive em divergência; confirma que o valor é o total antes de pagamentos e que não representa obrigação de outra fatura já existente. Base negativa/ausente/overflow não é obrigação pagável nesta entrega. Zero confirmado significa sem obrigação, não pagamento fictício.

Saldo conhecido = base confirmada − soma das alocações ativas, sem saldo negativo presumido como caixa. Estados: `unknown`, `unpaid`, `partial`, `paid`, `no_obligation`, `review_required` e `credit_review_required` após revisão explícita de excedente. Sem atraso automático. Nova linha, classificação, cobertura ou total alterado pedem revisão, preservando alocações. RF-025 permite base abaixo do já alocado somente com `preserveOverpaymentConfirmed:true`: saldo zero, excedente para revisão e reserva bancária mantida, sem dinheiro livre. Sem essa confirmação, continua o conflito RF-024. [Regra canônica de estornos](card-adjustments.md). Diferenças e pagamentos informados continuam separados.

Saldo anterior não zero explicitamente classificado `previous_balance` bloqueia confirmação/alocação nesta v0: sua relação com a obrigação anterior deve ser resolvida antes de evitar dupla utilização entre faturas. Transferência/cancelamento de obrigação, saldo anterior e ajustes com dependências ficam na RF-025/evolução explícita; não inferir vínculos. Dados incompletos podem usar base declarada somente com as confirmações manuais acima. A base guarda evidência, assinatura e snapshot do contexto financeiro.

## Dinheiro disponível e comandos

O usuário confirma que o movimento é saída e sua magnitude BRL integral, numericamente igual ao valor original, sem inferir direção por sinal/descrição. Magnitude positiva no intervalo BIGINT; MIN_CENTS não tem magnitude positiva representável. Disponível do movimento = magnitude confirmada − alocações ativas, não saldo de conta bancária. Um movimento pode pagar várias faturas, uma fatura pode receber vários movimentos; soma nunca supera disponível da origem nem saldo do destino.

Decisões do proprietário são serializadas na mesma transação usada pelos demais comandos financeiros. Versões de BankEntry e Statement, base atual e todas as reservas são revalidadas antes de criar/reverter alocação. FKs tipadas por conta/crédito/usuário impedem cruzamento de proprietários. Módulos futuros de liquidação/transferência devem incluir estas reservas na disponibilidade e compartilhar a disciplina de trava; não usar o mesmo dinheiro por consultas isoladas de cada módulo.

Reversão é explícita e auditada: inativa a alocação, libera a reserva, mantém origem/histórico e não cria estorno bancário. É permitida mesmo quando base precisa de revisão, para corrigir vínculos; não reutilizar versão antiga. Valores/referências de alocações são imutáveis. Uma saída previamente confirmada conserva sua evidência; se valor original mudar, disponibilidade fica desconhecida e novas alocações são recusadas até revisão futura. Não presumir recebível/devolução por estorno.

## HTTP

Sessão própria/origem confiável/JSON em escritas. Idempotency-Key obrigatório, escopo proprietário/comandos de pagamento: mesma chave/payload normalizado recupera resultado original mesmo após outra edição/restart, chave/payload diferente retorna 409. Histórico e alteração atômicos; falha desfaz base, fonte, reserva, versões e alocação. Erros sem payload/stack.

| Rota | Entrada/saída |
|---|---|
| `GET /api/credit-accounts/:creditId/statements/:id/payments?page=1` | Base/candidatas, contexto de revisão, soma ativa, saldo/estado e alocações paginadas (25) |
| `POST /api/credit-accounts/:creditId/statements/:id/payments/basis` | `{expectedStatementVersion, kind:'declared' ou 'calculated', referenceHash, beforePaymentsConfirmed:true, independentObligationConfirmed:true}` |
| `POST /api/credit-accounts/:creditId/statements/:id/payments` | `{expectedStatementVersion, bankEntryId, expectedBankVersion, confirmedOutflow:MoneyDTO, outflowConfirmed:true, amount:MoneyDTO}` |
| `POST /api/credit-accounts/:creditId/statements/:id/payments/:allocationId/reverse` | `{expectedStatementVersion, expectedBankVersion}`; revalida proprietário/versões da origem persistida |
| `GET /api/credit-accounts/:creditId/statements/:id/payments/history` | Últimos 20 comandos imutáveis; snapshots completos privados persistidos |
| `GET /api/bank-entries/:id/payment-source` | Movimento original, versão, saída confirmada/desconhecida, reservas ativas e disponível; sem saldo de conta presumido |

Cada comando avança versão da fatura; alocação/reversão também avançam versão do movimento. Histórico de fatos RF-020 continua separado dos comandos de pagamento. Importação/reimportação preserva vínculos e versões existentes; consultas/revisões da base não mudam competência, ciclo, consumo, planos ou caixa original. Novos módulos devem manter esta separação.

RF-025 acrescenta opcional `preserveOverpaymentConfirmed:true` à confirmação de base e `progress.creditExcess` quando há excedente revisado. Ausência/false preserva normalização e replay das chaves anteriores. Reversão de alocação continua sendo correção explícita de vínculo, nunca refund automático para fazer coincidir a base reduzida.
