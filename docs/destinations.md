# Destinos mínimos de importação

RF-016 implementa cadastros de crédito e seleção de destinos. Upload, revisão e movimentos/cobranças pertencem à RF-017/RF-018. Não há cálculo financeiro nestes cadastros.

## Modelo e conhecimento

- `Account` é a credencial Better Auth; `FinancialAccount` é a conta bancária/carteira mínima RF-013, sem saldo ou movimentos.
- `CreditAccount` tem nome e moeda BRL, sem limite ou saldo presumidos.
- `Card` tem nome e tipo explícito (`physical`, `virtual`, `additional`). Vários cartões podem compartilhar crédito e faturas; números do arquivo não geram associação automática.
- `Statement` registra somente competência `YYYY-MM` confirmada manualmente, proprietário e instante de criação. Fechamento, vencimento, total e estado de pagamento não são presumidos.
- Competência: anos 0001–9999 e meses 01–12. Não equivale ao intervalo do extrato ou data de caixa. [ADR-0005](decisions/0005-missing-statement-period.md).

Schema e migration: [Prisma](../apps/api/prisma/schema.prisma) e [SQL](../apps/api/prisma/migrations/202610080002_import_destinations/migration.sql). Nenhuma tabela de identidade/contas bancárias é alterada.

## API executável

Sessão obrigatória; dono obtido da sessão; campos extras, inclusive `userId`, rejeitados. Escritas exigem JSON e Origin confiável conforme [identidade](identity.md).

| Método e rota | Entrada / saída |
|---|---|
| `GET /api/accounts`, `POST /api/accounts` | Cadastros bancários/carteiras existentes, contrato RF-013 |
| `GET /api/credit-accounts` | Lista própria: `id`, `name`, `currency` |
| `POST /api/credit-accounts` | `{ name }`; retorna conta |
| `GET /api/credit-accounts/:id` | Conta própria; 404 para ausente ou alheia |
| `GET /api/credit-accounts/:id/cards` | `id`, `creditAccountId`, `name`, `kind` |
| `POST /api/credit-accounts/:id/cards` | `{ name, kind }`; conta própria |
| `GET /api/credit-accounts/:id/statements` | `id`, `creditAccountId`, `period`, `periodOrigin`; ordem de competência |
| `POST /api/credit-accounts/:id/statements` | `{ period: "2026-10" }`; confirmação manual explícita |

Nomes aparados com 1–100 caracteres. Novos POSTs exigem `Idempotency-Key`: 1–100 letras ASCII, números, `_` ou `-`. Escopo: proprietário e tipo de recurso. Para cartões/faturas, o ID da conta de crédito também participa da comparação do payload. UI gera UUID e reutiliza a chave após falha de resposta com os mesmos dados.

Reenvio do mesmo payload normalizado/chave retorna o mesmo cadastro com HTTP 201, inclusive sob concorrência. Dados diferentes retornam 409 `IDEMPOTENCY_CONFLICT`. Competência única por crédito; outra chave para período existente retorna 409 `STATEMENT_PERIOD_EXISTS`. A API anterior de contas mantém seu contrato RF-013; confirmação financeira terá idempotência transacional na RF-018.

Erros novos de validação/autorização/conflito têm `code`, `message`, `requestId` e, quando aplicável, `violations`. Respostas não expõem chave de criação ou proprietário. Não há edição/exclusão dos novos cadastros nesta fatia.

## Isolamento e interface

FK composta `(creditAccountId, userId)` referencia `(id, userId)` do crédito. Escritas/atualizações diretas no SQL não podem ligar usuários diferentes. SQL restringe moeda, tipo, competência e origem manual. Não há RLS.

Interface permite cadastrar crédito/cartões/períodos e selecionar conta bancária ou crédito com competência, deixando cartão desconhecido quando necessário. Trocar crédito limpa cartão/competência e descarta respostas de consultas anteriores. Cadastros persistem após reload; seleção ainda é local e será persistida com a revisão RF-017. Upload/confirmação financeira ainda não estão disponíveis.

Implementação: [serviço](../apps/api/src/credit/destinations.service.ts), [controller](../apps/api/src/credit/credit.controller.ts), [UI](../apps/web/src/destinations.tsx). Testes: [integração](../apps/api/test/destinations.integration.test.ts) e [Chromium](../tests/e2e/destinations.spec.ts); resultados na [task](tasks/phase-1.md).
