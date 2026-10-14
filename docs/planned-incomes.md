# Receitas previstas avulsas — RF-027

Contrato executável desta fatia: [domínio puro](../packages/domain/src/incomes.ts), [API](../apps/api/src/incomes/incomes.service.ts), [UI](../apps/web/src/incomes.tsx) e [migration aditiva](../apps/api/prisma/migrations/202610140001_planned_incomes/migration.sql). Evidências e estado na [task](tasks/phase-3.md).

Uma Income é uma previsão manual, sem efeito de caixa. Não cria BankEntry, cobrança, fatura, despesa, liquidação, saldo ou orçamento. Não infere competência, conta, terceiro, recorrência, tributo ou recebimento. Estados únicos desta fatia: `planned` e `cancelled`. Cancelamento é explícito, terminal e preserva fatos/histórico; nova previsão exige nova criação. Valor esperado zero confirmado continua previsão.

## Dados e evidência

Descrição obrigatória, aparada, 1–500 caracteres; notas opcionais até 1000 caracteres. `facts.expectedOn` é data civil gregoriana (0001–9999), `facts.expectedAmount` é BRL em centavos decimais canônicos não negativos até `9223372036854775807`. Nenhum cálculo usa ponto flutuante. Resposta usa `KnownValue`: `unknown` ou `confirmed` com valor e evidência `{ kind: 'user', decisionId }`. Origem `{ kind: 'manual', decisionId }` conserva o comando de criação, mesmo após correções/cancelamento. Cada fato corrigido registra o comando responsável; fatos omitidos preservam evidência anterior.

Na criação, fato omitido ou `null` permanece desconhecido. PATCH omitido preserva; `null` limpa explicitamente. Limpar um fato não apaga sua afirmação no histórico. `knowledge` complete exige data e valor confirmados; partial não implica erro. Campos extras, proprietário no corpo, moeda diferente, valores negativos/overflow e datas inválidas são rejeitados.

## HTTP e concorrência

| Método/rota | Contrato |
|---|---|
| POST `/api/incomes` | descrição, notas/facts opcionais; resposta Income, 201 |
| GET `/api/incomes?page=1` | 25 previsões próprias por página, incluindo canceladas; total é contagem |
| GET `/api/incomes/:id` | projeção atual, versão e evidências |
| PATCH `/api/incomes/:id` | expectedVersion e ao menos uma alteração; 200 |
| POST `/api/incomes/:id/cancel` | somente expectedVersion; 201 |
| GET `/api/incomes/:id/history` | últimas 20 versões, mais recente primeiro; journal integral permanece persistido |

Todas as rotas exigem sessão; escritas exigem Origin confiável, JSON até 16 KiB e `Idempotency-Key` de 1–100 caracteres `[A-Za-z0-9_-]`. expectedVersion é inteiro de 0 a 2147483646. Não aceitar versão obsoleta nem edição/cancelamento repetido com nova chave em cancelada. Erros principais: `INVALID_INCOME`, `INVALID_INPUT`, `INVALID_VERSION`, `INVALID_IDEMPOTENCY_KEY` (400), `INCOME_NOT_FOUND` (404), `INCOME_VERSION_CONFLICT`, `INCOME_CANCELLED`, `IDEMPOTENCY_CONFLICT` (409); falhas internas são redigidas. JSON inválido/oversized segue filtro seguro do prefixo incomes.

Autorização e versão/estado são revalidados sob trava de User, na mesma transação do fato, incremento e journal imutável. Chave é exclusiva por usuário no módulo Income e cobre ação, destino, versão e patch normalizado. Mesmo comando recupera a resposta original, inclusive após edição, cancelamento e restart; chave com outro comando conflita. Replay revalida proprietário, mas não exige que o snapshot histórico seja a versão atual. UI busca a projeção atual após replay. SQL mantém FKs compostas de comando/receita/proprietário, unicidade de versão, limites/evidências, origem permanente e cancelamento terminal. Histórico não admite UPDATE/DELETE.

UI exige confirmação de dados/cancelamento e permite limpar data/valor mantendo-os desconhecidos. Em resposta incerta conserva formulário e chave, bloqueia outras ações e oferece recuperar resultado do mesmo comando; conflitos definidos liberam recarregamento explícito. Lista, detalhe e histórico são atualizados sem recarga da página. A preservação da tentativa incerta vale enquanto a tela está montada; recarga completa não persiste rascunho financeiro no navegador.

## Limites da entrega

Sem recorrências, liquidações, associação de importação, classificação automática, categorias ou orçamento. P3-01 a P3-07 continuam propostas pendentes. Antes de RF-028/RF-029 habilitar vínculos, adicionar guardas de correção/cancelamento conforme dependências reais, sem apagar histórico ou recebimentos. OpenAPI acompanha somente estas operações; [acesso e políticas de documentação](api-documentation.md) preservados.
