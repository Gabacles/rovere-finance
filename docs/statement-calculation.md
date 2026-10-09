# Natureza das linhas e total calculado — RF-023

Classificação de `CardCharge` é manual, versionada e auditada: natureza e magnitude BRL não negativa devem ser explicitamente confirmadas. Magnitude corresponde numericamente ao valor original; sinal, data, descrição, competência, parcela e origem permanecem intactos. Sinal/descrição, conciliação de parcela e reimportação não classificam automaticamente. `null` remove a afirmação, preservando histórico. Magnitude segue BIGINT; MIN_CENTS não admite magnitude positiva representável.

| Natureza | Efeito no total do ciclo antes de liquidações | Consumo bruto separado |
|---|---|---|
| `purchase` — Compra | Soma | Soma |
| `fee` — Tarifa | Soma, apenas valor informado | Soma |
| `interest` — Juros | Soma, sem cálculo presumido | Soma |
| `refund` — Estorno | Subtrai | Exibido separadamente; não altera compra/terceiros automaticamente |
| `other_credit` — Outro crédito | Subtrai | Não soma |
| `other_debit` — Outro débito | Soma | Não presumir consumo |
| `previous_balance` — Saldo anterior | Soma | Não soma novamente consumo de outro período |
| `payment` — Pagamento informado | Não entra; subtotal informativo separado | Não soma |
| `informational` — Informação sem efeito | Não entra, por decisão explícita | Não soma |

O total calculado considera somente cobranças efetivas desta fatura/competência. Não soma Expense, planos, previsões ou BankEntry. Pagamento de fatura não cria consumo; classificá-lo não liquida obrigação nem gera caixa. Diferença com total declarado pode refletir registros faltantes ou convenções da instituição (inclusive pagamentos apresentados no extrato): nunca criar ajuste ou presumir dívida/pagamento para fazer coincidir. Ajustes/estornos com dependências financeiras são RF-025; aqui somente se classifica linha já existente.

## Cobertura e desconhecimento

Subtotal conhecido usa somente linhas classificadas e é apresentado como subtotal, nunca como fatura completa. Total calculado completo exige todas as linhas classificadas e cobertura `complete` explicitamente confirmada para o conjunto atual. Fatura vazia não equivale a total zero sem essa confirmação. `partial`/unknown preservam incompletude.

A declaração de cobertura conserva evidência e assinatura do conjunto de IDs, versões, valores e classificações. Importação de nova linha ou alteração da classificação torna a confirmação anterior desatualizada; não apaga a decisão manual. Reimportação vinculada sem mudanças mantém a assinatura. Reconfirmar cobertura usa a versão atual da fatura e inclui novo histórico. Leitura do resumo usa snapshot consistente do banco. Overflow de subtotal/total/diferença fica explícito e não retorna total fictício.

Diferença = declarado − calculado, disponível somente com total calculado completo e declarado conhecido. Estados iguais/divergentes não significam pago/conciliado. Ciclo aberto/fechado, competência, datas de caixa e liquidação continuam independentes. Uma cobrança conciliada a previsão só pode receber natureza `purchase` ou ficar desconhecida; outras naturezas exigem desconciliação explícita. Conciliação RF-022 também recusa natureza já confirmada incompatível.

## HTTP

| Rota | Contrato |
|---|---|
| `GET /api/card-charges/:id` | Dados originais, versão e classificação conhecida/desconhecida, do proprietário |
| `PATCH /api/card-charges/:id/classification` | `{expectedVersion, classification: {nature,amount:{currency:'BRL',cents}} ou null}`; JSON, sessão/origem e `Idempotency-Key` obrigatórios |
| `GET /api/card-charges/:id/history` | Últimos 20 comandos imutáveis; histórico completo privado no banco |
| `GET /api/credit-accounts/:creditId/statements/:id/summary` | Contagens, cobertura e atualidade, subtotais por natureza, consumo bruto, pagamentos informados, total calculado e diferença/declarado separados |
| `PATCH /api/credit-accounts/:creditId/statements/:id` | Fatos RF-020 acrescentam `coverage:'complete' ou 'partial' ou null`; expectedVersion e histórico existentes, assinatura gerada no servidor |

Chaves de classificação têm escopo proprietário/comandos de cobranças: mesma chave/payload normalizado recupera resposta original, mesmo após edição/restart; chave diferente com versão antiga ou payload divergente retorna 409. Transação serializa decisões do proprietário, protege vínculos e revalida versão; falha do histórico desfaz classificação. Erros não expõem payload/stack. Listagem de cobranças RF-018 acrescenta versão/classificação sem alterar registros originais.
