# Confirmação financeira e conciliação — RF-018

Esta fatia conclui o fluxo CSV/OFX da entrega 1: upload → revisão → confirmação → consulta → reimportação. [Revisão RF-017](import-review.md), [domínio](domain.md) e [contratos](contracts.md).

## Fatos mínimos e limites de conhecimento

`BankEntry` registra conta própria, data civil informada, descrição e centavos com sinal em BRL. `CardCharge` registra crédito próprio, fatura obrigatória, cartão opcional, data informada, descrição, centavos com sinal e conhecimento de parcela. Ambos preservam exatamente os valores aprovados na revisão. Datas civis usam `DATE`, centavos `BIGINT`; DTOs usam strings.

Cobrança não pressupõe compra completa: número de parcela pode ser conhecido com total desconhecido; nenhum plano ou parcela anterior/futura é gerado. Não há total de compra, saldo, limite, abertura/fechamento, vencimento ou pagamento presumidos. O sinal permanece conforme arquivo/configuração/correção confirmada; esta etapa não classifica consumo, receita, transferência, juros, estorno ou pagamento por descrição/sinal. Categorias, despesas agregadas, liquidações e orçamento ficam nas fases seguintes.

Fatura exige competência explícita antes de gravar cobranças, conforme ADR-0005. Competência divergente do arquivo exige confirmação manual na revisão. Metadados de origem permanecem disponíveis mesmo se um registro já existente for vinculado. A data informada de processamento não vira silenciosamente a data original da compra.

## Identidades e correspondências

Identidade externa tem escopo **usuário + tipo de registro + conta interna confirmada + namespace de origem + ID externo textual**. IDs mantêm zeros à esquerda. O namespace CSV deriva de `profile.id`; OFX deriva do conjunto ordenado de instituição/conta informado (`ORG`, `FID`, `BANKID`, `BRANCHID`, `ACCTID`, `ACCTTYPE`). Famílias SGML/XML compartilham namespace quando esses metadados são iguais; intervalo do download, versão OFX e competência não fazem parte do escopo. CSV e OFX não compartilham identidade automaticamente.

`BankExternalIdentity` e `CardExternalIdentity` têm unicidade no escopo e FK para registro/dono/conta compatíveis. ID existente exige mesmos centavos, data e destino; cartão/parcelamento contraditórios quando ambos conhecidos também bloqueiam. Mudança de descrição não sobrescreve a descrição/observação pessoal existente. Dados incompatíveis resultam em `EXTERNAL_IDENTITY_CONFLICT`; “manter ambas” não contorna a identidade única. Correções marcadas por OFX permanecem em revisão, sem ajuste financeiro automático.

Sem identidade forte, igualdade de conta, competência, data, valor e descrição normalizada apenas produz sugestões (até cinco por linha). O fingerprint é índice de busca, **não constraint de unicidade**. Semelhança com registros anteriores exige `link`, `create` com `distinctFrom`, ou `skip`; nunca gera merge automático. Duas linhas legítimas iguais no mesmo lote continuam distintas, salvo identidade externa comum compatível. IDs repetidos compatíveis no mesmo arquivo criam um registro e múltiplas evidências; valores conflitantes bloqueiam o lote selecionado.

Decisões manuais usam FKs tipadas por usuário. Vincular preserva o registro existente e suas observações; guarda a nova evidência e o snapshot confirmado, sem sobrescrever conhecimento parcial. Selecionar todas não apaga vínculos já salvos. Decisões explícitas em lote:

- `all: { reconcile: "link" }`: aplica às linhas selecionadas ainda sem decisão, somente quando há sugestão única compatível; ambiguidade/limite de sugestões continua pendente.
- `all: { reconcile: "distinct" }`: mantém separadas as sugestões das linhas selecionadas, preservando decisões anteriores. Identidades externas não são contornadas.

Esses comandos salvam IDs concretos e histórico na revisão, sem efeitos financeiros antes da confirmação. Linhas excluídas continuam excluídas.

## API e transação

| Método e rota | Comportamento |
|---|---|
| `GET /api/imports/:id/confirmation-preview` | Versão, novos/vinculados/ignorados, totais das linhas aptas por destino e até vinte pendências; snapshot consistente |
| `PATCH /api/imports/:id/review` | Além de seleção/correções, aceita `action=create/link/skip`, `existingId` e `distinctFrom`; salva decisão autorizada e versionada |
| `POST /api/imports/:id/confirm` | `{ expectedVersion }` e `Idempotency-Key`; carrega decisões persistidas, revalida e confirma atomicamente |
| `GET /api/imports/:id` | Após confirmar, inclui resultado persistido sem chave privada de idempotência |
| `GET /api/imports/:id/rows` | Revisão ou confirmado; evidencia origem e candidato sem editar lote confirmado |
| `GET /api/entries?kind=bank/card&accountId=...` | Consulta própria, 25 por página; cartão aceita `statementId`; sem saldo calculado |
| `DELETE /api/imports/:id/file` | `expectedVersion`; após confirmar, remove somente bytes originais e libera quota; conserva fatos, origens normalizadas, decisões e resultado |

Todas as rotas exigem sessão; IDs alheios retornam 404. Escritas exigem Origin confiável e JSON. Campos extras e proprietário no corpo são rejeitados. Erros têm código, mensagem, `requestId` e, em bloqueios da confirmação, violações por ID/posição de linha, sem payload financeiro.

A confirmação bloqueia o usuário e a revisão dentro da transação PostgreSQL. Essa serialização inicial por proprietário impede corridas entre lotes distintos e reenvios do mesmo comando; não é promessa de paralelismo alto. Revalida versão, estado, destinos, dinheiro, campos obrigatórios, decisões e identidades. Qualquer falha desfaz lançamentos, identidades, evidências, resultado e transição de estado. Limite transacional de 60 s; capacidade funcional medida com 500 registros por formato, sem alegar throughput em produção.

`ImportConfirmation` tem chave única por usuário e um resultado por lote. Mesma chave/lote/versão retorna exatamente o resultado armazenado, inclusive após perda de resposta, restart ou remoção do arquivo bruto. Outra chave para lote confirmado, versão antiga ou chave com comando diferente resulta em 409. A prévia não substitui revalidação na transação.

`ImportOutcome` vincula cada origem a movimento/cobrança tipado, ou registra ignorar. Resultado tem contagens, IDs por linha e totais. Totais distinguem valor selecionado de novos efeitos; não representam total de compra/fatura. Somatórios usam `bigint` com overflow verificado. Pendências deixam a prévia parcial e impedem confirmar; linhas excluídas explicitamente não bloqueiam as válidas.

## Retenção e próximos módulos

Lote confirmado não pode ser cancelado/apagado pela rota de revisão; reversão financeira exige tratamento posterior de dependências. Remoção explícita dos bytes originais é permitida sem apagar proveniência normalizada ou finanças; quota de vinte arquivos/50 MiB considera arquivos ainda retidos. Não aplicar prazo automático de retenção ainda não aprovado. Histórico financeiro não é limitado a vinte importações.

Consulta de registros é somente leitura nesta fatia. Compras manuais, plano completo, calendário/ciclo de fatura, pagamentos/alocações, estornos e ajustes financeiros versionados permanecem nas fases seguintes. BIZ-02/BIZ-04/BIZ-05 seguem abertas. Esta conclusão não declara a V1 completa nem cobertura de todas as invariantes futuras.

Implementação: [confirmação](../apps/api/src/imports/confirmation.service.ts), [matching](../apps/api/src/imports/financial-records.ts), [domínio puro](../packages/domain/src/import-confirmation.ts), [schema](../apps/api/prisma/schema.prisma), [SQL](../apps/api/prisma/migrations/202610090001_import_confirmation/migration.sql), [UI](../apps/web/src/imports.tsx). Resultados executados nas [tasks](tasks/phase-1.md).
