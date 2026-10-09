# Progresso e ponto de retomada

Atualizado em 09/10/2026. Estados, critérios e evidências nas [tasks](tasks/README.md).

## Entrega atual

RF-023 integrada pelo usuário via [PR #10](https://github.com/Gabacles/rovere-finance/pull/10) na main `9461047`; CI final aprovada em `a43d6f2`. Código/merge/evidências conferidos, mantendo entregas anteriores e CSV/OFX obrigatórios.

RF-024 concluída localmente na branch `feat/rf-024-statement-payments`, criada dessa main: base declarada/calculada e saída bancária confirmadas, alocações parciais/integral com versões, reserva revalidada sob concorrência, idempotência/histórico e reversão sem apagar movimento. Saldo deriva somente de alocações ativas; pagamentos informados na fatura não são descontados novamente. Mudança financeira exige revisão, preservando pagamentos. [Contrato](statement-payments.md), [ADR-0012](decisions/0012-explicit-statement-payment-allocations.md), [fase 2](tasks/phase-2.md).

## Validação executada

`npm run check`: 44 documentos/18 tasks e hash histórico, tipos, 110 unitários, builds e smoke aprovados. Integração: 95 aprovados (14 RF-024). Chromium: 10 jornadas, com uma saída dividida entre duas faturas, parcial/integral, resposta perdida, limite excedido, reload/reversão/reserva/histórico e regressões de 500 registros por formato. Duas capturas móveis inspecionadas. Comandos, limites e ajustes na RF-024; resultados anteriores preservados nas tasks de suas versões.

Docker atualizado, quatro serviços saudáveis, nona migration aplicada sem reset; schema/banco sem diferenças; proxy público 200 e fonte bancária privada 401 sem sessão. Entrega pronta para publicação/revisão na branch; CI remota ainda a conferir antes de integrar.

## Próxima ação concreta

1. Publicar RF-024 e abrir PR para main; conferir head/CI e autorização específica antes de integrar.
2. Após integração, RF-025: ajustes/estornos, revalidação de dependências e aceite vertical do ciclo. Saldo anterior positivo identificado exige revisão, sem duplicar obrigações entre faturas.
3. RF-026: OpenAPI/Swagger após RF-025 e antes da fase 3; atualmente somente contratos Markdown. A V1 ainda não está concluída.

## Políticas e ambiente

BIZ-02/BIZ-04/BIZ-05 resolvidas por delegação: encargos informados sem juros presumidos, CSV/OFX genéricos até layouts comprovados, revisão explícita de excedentes de reembolso. [Políticas](v0-policies.md). BIZ-01/BIZ-03 preservadas. Retenção continua proposta técnica/de privacidade; não há decisão BIZ bloqueante nesses limites.

Serviços ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025 e Mailpit 18025. Volume preservado; testes somente em schemas próprios de `rovere_test`. Sem usuários predefinidos ou envio externo. [README](../README.md).
