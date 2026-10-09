# Progresso e ponto de retomada

Atualizado em 09/10/2026. Estados, critérios e evidências nas [tasks](tasks/README.md).

## Entrega atual

Entrega 1 RF-014/RF-018 e RF-020 integradas pelo usuário. RF-021 integrada via [PR #8](https://github.com/Gabacles/rovere-finance/pull/8) na main `ab96e59`; CI final aprovada em `e257954`. Código/merge/evidências conferidos, mantendo trabalho validado e CSV/OFX obrigatórios.

RF-022 concluída localmente na branch `feat/rf-022-installment-plans`, criada dessa main: plano mensal confirmado, distribuição exata e previsões separadas das cobranças efetivas. Conciliação/desconciliação explícitas conservam origem, diferenças, desconhecimento e histórico; não criam cobranças/faturas ausentes. Total do plano é protegido, e cobranças conciliadas exigem desconciliação antes de desassociar. [Contrato](installment-plans.md), [ADR-0010](decisions/0010-confirmed-installment-forecasts.md), [fase 2](tasks/phase-2.md).

## Validação executada

`npm run check`: 40 documentos/17 tasks e hash histórico, tipos, 101 unitários, builds e smoke aprovados. Integração: 71 aprovados (12 RF-022). Chromium: 8 jornadas, incluindo resposta perdida do plano, previsão versus cobrança importada CSV/OFX, diferença de centavos, proteção/recarregamento do total, desconciliação/histórico e regressões de 500 registros por formato. Captura móvel inspecionada. Comandos, ajustes e limitações na task RF-022; resultados anteriores preservados nas tasks de suas versões.

Docker atualizado, quatro serviços saudáveis, sétima migration aplicada sem reset; schema/banco sem diferenças; proxy público 200 e compras privadas 401 sem sessão. Entrega pronta para publicação/revisão na branch; CI remota ainda a conferir antes de integrar.

## Próxima ação concreta

1. Publicar RF-022 e abrir PR para main; conferir head/CI e autorização específica antes de integrar.
2. Após integração, RF-023: natureza explícita das linhas e consultas do ciclo, separando total calculado/declarado e diferenças para revisão.
3. RF-024/RF-025: pagamentos/alocações e ajustes/estornos. A V1 ainda não está concluída.

## Políticas e ambiente

BIZ-02/BIZ-04/BIZ-05 resolvidas por delegação do usuário: encargos informados sem juros presumidos, CSV/OFX genéricos até layouts comprovados, revisão explícita de excedentes de reembolso. [Políticas](v0-policies.md), ADR-0009. BIZ-01/BIZ-03 preservadas. Sem decisões BIZ bloqueantes nesses limites; retenção continua proposta técnica/de privacidade.

Serviços ativos: PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025 e Mailpit 18025. Volume preservado; testes só em schemas próprios de `rovere_test`. Sem usuários predefinidos ou envio externo. [README](../README.md).
