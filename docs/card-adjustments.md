# Ajustes, estornos e ciclo vertical — RF-025

Ajustes manuais exigem crédito/fatura próprios, data civil, descrição, valor original com sinal, natureza/magnitude e motivo explicitamente informados. Naturezas: tarifa, juros informados, outro débito, outro crédito e estorno. Não simular juros, preencher compra/parcelas ausentes ou criar ajuste para fazer coincidir uma diferença. CardCharge guarda o fato efetivo e ManualCardAdjustment guarda sua origem/evidência imutável. Reimportação posterior pode vincular essa cobrança, preservando a evidência manual.

## Estorno da compra

Um crédito efetivo classificado `refund`, importado ou manual, pode ser associado explicitamente a uma compra própria. Nesta v0, uma linha de estorno inteira corresponde a uma compra; fracionamento entre compras não é automático. Confirmar magnitude, motivo e versões da compra/cobrança/fatura. Não relacionar por descrição/sinal e não inferir recebimento bancário. FKs tipadas impedem referências entre usuários.

Soma de estornos associados não supera total original confirmado. Compra parcial pode receber associação, mas custo elegível permanece desconhecido até confirmar total suficiente. Depois, custo elegível = total original − estornos associados. Não alterar total original, data, correções, distribuição do plano ou parcelas efetivas. Alterar/limpar total de compra com estornos exige revalidação; plano continua protegido. Desassociar é explícito, conserva crédito efetivo/histórico e não remove efeito da fatura. BIZ-05: registrar necessidade de revisão de futuros reembolsos/compromissos, sem criar recebível, dívida ou devolução fictícios.

## Reversão de ajuste manual

Não apagar fato informado. Reverter ajuste manual cria uma única linha compensatória na competência explicitamente selecionada, com mesma magnitude e efeito contrário confirmado (`other_credit` para débito/tarifa/juros; `other_debit` para crédito/estorno). Referência tipada original/compensatória conserva motivo e origem. Um ajuste tem no máximo uma reversão; não gerar cadeia automática. Remover antes associação ativa de estorno à compra, quando existente. Classificação de ajustes manuais e de créditos associados é protegida contra mudanças que contradigam suas dependências. Não reverter pagamentos bancários ou parcelas como efeito colateral.

## Pagamento após estorno

Novo crédito/mudança de vínculo invalida atualidade da cobertura/base; confirmar novamente registros e base. Alocações bancárias reais permanecem ativas. Se a base revisada for menor que pagamentos existentes, a reconfirmação exige `preserveOverpaymentConfirmed:true`: saldo da obrigação é zero e excedente = alocado − base fica em `credit_review_required`. Excedente não vira saldo bancário, recebível ou dinheiro livre; reserva da saída permanece usada. Nova alocação positiva é recusada. Sem essa confirmação, mantém-se o conflito anterior RF-024; reversão de alocação continua sendo correção explícita de vínculo, não refund bancário automático.

Esta decisão complementa ADR-0012 somente para o excedente após revisão explícita. Rotativo, transferência de saldo anterior entre faturas, ajuste de recebimentos de terceiros e dívida consolidada continuam fora do ciclo básico validado; saldo anterior positivo identificado permanece bloqueado para revisão, sem duplicar obrigação.

## HTTP

Sessão própria, JSON/origem confiável, Idempotency-Key e versões obrigatórios. Comandos serializados por proprietário, revalidação de limites/dependências, transação com journal imutável; mesma chave/payload normalizado recupera resultado original após edição/restart. Conflitos 409, referências alheias 404, erros sem payload/stack.

| Rota | Contrato |
|---|---|
| `POST /api/credit-accounts/:creditId/statements/:id/adjustments` | `{expectedStatementVersion, postedOn, description, amount:MoneyDTO com sinal, classification:{nature,amount:MoneyDTO magnitude}, reason, informedConfirmed:true}` |
| `POST /api/credit-accounts/:creditId/statements/:id/adjustments/:chargeId/reverse` | Mesmos dados da compensatória + `expectedChargeVersion`, `expectedOriginalStatementVersion`; magnitude igual/efeito contrário e confirmação explícita |
| `GET /api/credit-accounts/:creditId/statements/:id/adjustments/history` | Últimos 20 comandos privados de ajustes/reversões da fatura |
| `POST /api/expenses/:id/refunds` | `{expectedExpenseVersion, chargeId, expectedChargeVersion, expectedStatementVersion, amount:MoneyDTO magnitude, reason, associationConfirmed:true}` |
| `POST /api/expenses/:id/refunds/:chargeId/remove` | `{expectedExpenseVersion, expectedChargeVersion, expectedStatementVersion, reason}` |
| `GET /api/expenses/:id/refunds/history` | Últimos 20 comandos privados de associação/desassociação |

Leitura da compra acrescenta estornos associados, soma e custo elegível disponível/desconhecido/revisão. Comandos atualizam versões afetadas e assinaturas de contexto sem mudar dinheiro/datas originais. Origin manual/reversão fica na leitura da cobrança. A RF-025 valida o ciclo básico compra → plano → CSV/OFX → fatura → pagamento → estorno/ajuste, sem declarar toda a V1 concluída.
