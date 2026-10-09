# Progresso e ponto de retomada

Atualizado em 09/10/2026. Estados, critérios e evidências nas [tasks](tasks/README.md).

## Entrega atual

RF-022 integrada pelo usuário via [PR #9](https://github.com/Gabacles/rovere-finance/pull/9) na main `600ca74`; CI final aprovada em `558bbe8`. Código/merge/evidências conferidos, mantendo as entregas anteriores validadas e CSV/OFX obrigatórios.

RF-023 concluída localmente na branch `feat/rf-023-statement-calculations`, criada dessa main: classificação manual de natureza/magnitude, histórico/versionamento/idempotência, cobertura explicitamente confirmada para conjunto atual e total calculado separado do declarado. Subtotais separam consumo bruto, saldo anterior, créditos e pagamentos informados; não somam compras/planos/previsões ou caixa. Mudanças de linhas/classificação pedem reconferência sem apagar afirmações. [Contrato](statement-calculation.md), [ADR-0011](decisions/0011-explicit-line-nature-and-coverage.md), [fase 2](tasks/phase-2.md).

## Validação executada

`npm run check`: 42 documentos/18 tasks e hash histórico, tipos, 106 unitários, builds e smoke aprovados. Integração: 81 aprovados (10 RF-023). Chromium: 9 jornadas, com resposta perdida, classificação/cobertura/diferença, conflito/reload/histórico, refresh após confirmação de importação e regressões de 500 registros por formato. Duas capturas móveis inspecionadas. Comandos, limites e ajustes na RF-023; resultados anteriores preservados nas tasks de suas versões.

Docker atualizado, quatro serviços saudáveis, oitava migration aplicada sem reset; schema/banco sem diferenças; proxy público 200 e cobrança privada 401 sem sessão. Implementação `954f00e` publicada no [PR #10](https://github.com/Gabacles/rovere-finance/pull/10); CI remota ainda a conferir antes de integrar. Registro posterior somente de documentação preserva código validado.

## Próxima ação concreta

1. Revisar [PR #10](https://github.com/Gabacles/rovere-finance/pull/10) da RF-023 para main; conferir head/CI e autorização específica antes de integrar.
2. Após integração, RF-024: pagamentos/alocações bancárias, revalidando dinheiro disponível e saldo conhecido, sem descontar pagamento informado e alocação duas vezes.
3. RF-025: ajustes/estornos e aceite do ciclo. RF-026: OpenAPI/Swagger após RF-025 e antes da fase 3, solicitada pelo usuário; atualmente somente contratos Markdown. A V1 ainda não está concluída.

## Políticas e ambiente

BIZ-02/BIZ-04/BIZ-05 resolvidas por delegação: encargos informados sem juros presumidos, CSV/OFX genéricos até layouts comprovados, revisão explícita de excedentes de reembolso. [Políticas](v0-policies.md). BIZ-01/BIZ-03 preservadas. Retenção continua proposta técnica/de privacidade; não há decisão BIZ bloqueante nesses limites.

Serviços ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025 e Mailpit 18025. Volume preservado; testes somente em schemas próprios de `rovere_test`. Sem usuários predefinidos ou envio externo. [README](../README.md).
