# Progresso e ponto de retomada

Atualizado em 08/10/2026. Estados e evidências nas [tasks](tasks/README.md).

## Entrega atual

RF-000/RF-001, RF-010 a RF-013 e RF-015 a RF-017 concluídas. RF-014 permanece em andamento: revisão persistida não equivale a confirmação financeira. [Roadmap](roadmap.md).

RF-015 integrada pelo usuário via PR #2. Após autorização explícita, [PR #4](https://github.com/Gabacles/rovere-finance/pull/4) da RF-016 aberto e integrado com CI aprovada, main `d94332b`. A autorização anteriormente bloqueada foi resolvida.

RF-017 implementada na branch `feat/rf-017-import-review`, criada dessa main: upload CSV/OFX privado no PostgreSQL, parsing em thread com lease recuperável, origem/candidato imutáveis, revisão versionada, correções/seleção, destinos autorizados por bloco, paginação, download/retry/remoção. [Contrato e limites](import-review.md), [ADR-0006](decisions/0006-private-import-review.md). [PR #5](https://github.com/Gabacles/rovere-finance/pull/5) com integração explicitamente autorizada; CI de push e PR aprovadas no código `dca5d1d`.

## Validação

`npm run check`: documentação/hash, tipos, 85 unitários, builds e smoke aprovados. Integração: 28 aprovados, incluindo 500 registros por formato, dois usuários, concorrência, rollback, restart e recuperação sem sobrescrever revisão. Chromium: 3 jornadas e teardown aprovados, capturas móveis inspecionadas. Docker reconstruído com instalação limpa, 4 serviços saudáveis, terceira migration aplicada sem reset; schema versus banco sem diferença; proxy público 200 e imports privado 401 sem sessão. Comandos, falhas corrigidas e limitações nas tasks; resultados remotos da RF-017 ainda não verificados.

## Próxima ação concreta

1. Encerrar após a integração autorizada do PR #5. O usuário pediu para não iniciar a próxima task neste momento; RF-018 não iniciada. Na próxima retomada, conferir merge/CI e main atualizada antes de criar a branch.
2. RF-018: detalhar movimentos/cobranças mínimos, identidades externas, confirmação atômica/idempotente, conciliação e aceite de 500 compras em CSV e OFX.
3. Manter RF-014 aberta até confirmar/reimportar em banco e navegador. Não implementar faturas, saldo, limite ou parcelas ausentes como atalho.

## Ambiente e pendências

Serviços ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025 e Mailpit 18025. Volume preservado; testes em schemas próprios de `rovere_test`. Sem usuário predefinido ou envio externo. [README](../README.md).

BIZ-03 resolvida: competência explícita antes de gravação financeira. BIZ-02, BIZ-04 e BIZ-05 abertas, sem bloquear revisão genérica. [Pendências](decisions/pending.md). Sem movimentos, pagamentos, saldos ou limites; sem retenção automática presumida. Próxima entrega continuará em branch própria e dados fictícios.
