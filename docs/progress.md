# Progresso e ponto de retomada

Atualizado em 14/10/2026. Estados, critérios e evidências nas [tasks](tasks/README.md).

## Entrega atual

RF-025 integrada pelo usuário via [PR #12](https://github.com/Gabacles/rovere-finance/pull/12) na main `fe318b2`; CI final aprovada em `9cc6643`. Código/merge/evidências conferidos, mantendo as entregas anteriores e CSV/OFX obrigatórios. Ciclo básico de cartão validado dentro dos limites da v0; a V1 inteira ainda não está concluída.

RF-026 concluída localmente na branch `feat/rf-026-api-documentation`, criada dessa main: Swagger UI `/api/docs`, JSON `/api/openapi.json`, [snapshot](api/openapi.json) com 85 operações reais, contratos HTTP/identidade e checagem de inventário/atualização na CI. UI na mesma origem da aplicação, sessões/Origin/CSRF/limites preservados. Produção desabilitada por padrão e acesso autenticado quando habilitada. [Uso/manutenção](api-documentation.md), [fase 2](tasks/phase-2.md). Sem migration ou alteração das regras financeiras.

## Validação executada

`npm run check` aprovado: 47 documentos/18 tasks e hash histórico, tipos, 117 unitários, builds, OpenAPI/schema/inventário/snapshot (85 operações) sem conexão com banco e smoke. Integração: 109 aprovados, incluindo quatro RF-026 com contratos HTTP e política de documentação em produção/opt-in/revogação. Chromium: 12 jornadas aprovadas, incluindo Swagger autenticado/leitura/escrita, além das regressões de 500 CSV/500 OFX e ciclo de cartão. Docker atualizado, quatro serviços saudáveis, volume preservado, sem migrations novas. UI/JSON/assets pelo proxy público 200/no-store; `/api/me` 401 sem sessão. Evidências/falhas/limites detalhados na task.

## Próxima ação concreta

1. Publicar/revisar PR da RF-026 para main; conferir head/CI e autorização específica antes de integrar.
2. Após integração da RF-026, detalhar e executar primeira fatia da fase 3 (planejamento/recorrências/receitas/terceiros), mantendo entregas pequenas e as políticas já aprovadas.
3. Saldo anterior, financiamento e obrigações consolidadas continuam fora do ciclo básico desta v0, sem inferências automáticas.

## Políticas e ambiente

BIZ-02/BIZ-04/BIZ-05 resolvidas por delegação: encargos informados sem juros presumidos, CSV/OFX genéricos até layouts comprovados, revisão explícita de excedentes de reembolso. [Políticas](v0-policies.md). BIZ-01/BIZ-03 preservadas. Retenção continua proposta técnica/de privacidade; não há decisão BIZ bloqueante nesses limites.

Serviços ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025 e Mailpit 18025. Volume preservado; testes somente em schemas próprios de `rovere_test`. Sem usuários predefinidos ou envio externo. Aviso pg sobre consultas concorrentes permanece registrado para revisão antes de upgrade, sem falha financeira observada. [README](../README.md).
