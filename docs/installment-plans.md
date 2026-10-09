# Planos confirmados e conciliação — RF-022

Um plano mensal da v0 exige total BRL não negativo, quantidade, crédito próprio e primeira competência confirmados pelo usuário. O total deve coincidir com o total conhecido da compra; a data original pode continuar desconhecida. Não se deduz plano de texto/parcela importados. Quantidade de 1 a 10 mil é guarda computacional reutilizada da distribuição existente, não homologação de capacidade ou limite bancário.

`InstallmentPlan` conserva esses fatos e a decisão. `InstallmentForecast` distribui centavos com `allocateCents`: restos vão às primeiras parcelas, soma igual ao total e número único dentro do plano. Competências são meses consecutivos desde a primeira competência explicitamente confirmada; não se estimam datas de cobrança, fechamento, vencimento ou pagamento. Gerar previsões não cria `CardCharge`, movimento bancário ou fatura futura.

## Conciliação explícita

Cada previsão pode ser ligada a uma cobrança própria, e cada cobrança a no máximo uma previsão. O usuário confirma a parcela e a magnitude BRL do valor efetivo; esta deve corresponder à magnitude numérica do valor original. O sinal da origem continua intacto, sem classificação financeira automática (RF-023). Crédito e competência devem coincidir. Número/quantidade de parcela explicitamente conhecidos na origem não podem contradizer o plano; quando ausentes, permanecem desconhecidos na origem, e a decisão de associação é conservada separadamente.

Valor efetivo pode diferir do previsto: conservar ambos e apresentar a diferença exata, sem redistribuir outras parcelas ou alterar o total confirmado. Uma previsão ligada é exibida como registro efetivo associado; consultas futuras devem usar o efetivo no lugar da previsão, não somar ambos. Desconciliar conserva cobrança e vínculo com a compra, restaura a previsão pendente e registra histórico. Desassociar cobrança da compra requer antes desconciliar sua previsão.

Na v0 há um plano imutável por compra. Descrição/notas/data original podem ser editadas; alterar/limpar total exige futura revisão explícita do plano (fora da RF-022), portanto retorna conflito. Substituição, cancelamento e redistribuição não são automáticos. Nenhuma importação cria plano ou concilia previsões silenciosamente; novas cobranças são selecionadas após confirmação da importação. Compromissos passados podem constar no calendário confirmado, sem se tornarem cobranças efetivas fictícias.

## HTTP

Sessão própria, origem confiável, JSON, `Idempotency-Key` e versão da compra obrigatórios nas escritas. Chaves compartilham o escopo de todos os comandos de compra. Mesma chave/payload normalizado recupera a resposta original; conflito de chave/versão/vínculo retorna 409. Toda escrita incrementa a versão da compra e grava snapshot no histórico imutável, sob a mesma serialização por proprietário da confirmação de importação. Falha desfaz plano/previsões/vínculo/histórico integralmente.

| Rota | Entrada/saída |
|---|---|
| `GET /api/expenses/:id` | Acrescenta `installmentPlan` (ou null) com previsões, efetivos associados e diferenças; snapshots antigos podem não ter esse campo |
| `POST /api/expenses/:id/installment-plan` | `{expectedVersion, total:{currency:'BRL',cents}, count, creditAccountId, firstPeriod:'YYYY-MM', cadence:'monthly'}`; confirma e gera previsões |
| `POST /api/expenses/:id/installment-plan/matches` | `{expectedVersion, number, chargeId, confirmedAmount:{currency:'BRL',cents}}`; confirma ligação e valor efetivo; também associa à compra se ainda livre |
| `POST /api/expenses/:id/installment-plan/matches/:number/remove` | `{expectedVersion}`; desconciliação explícita |

Referências SQL compostas por proprietário/compra, unicidade de parcela e cobrança, valores BIGINT e proteção de imutabilidade complementam validação do domínio puro e da transação. Total/plano/previsões são distintos de obrigação da fatura, caixa e pagamento. Sem categoria, natureza financeira, ajuste/estorno ou projeção global nesta task.
