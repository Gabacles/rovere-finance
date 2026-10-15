# Progresso e ponto de retomada

Atualizado em 15/10/2026. Estados, critérios e evidências nas [tasks](tasks/README.md).

## Entrega atual

RF-028 integrada pelo [PR #15](https://github.com/Gabacles/rovere-finance/pull/15), main `9612bcb` confirmada por fetch; comparação com `8b4ba58` sem diferenças de código. RF-027/PR #14 e RF-026/PR #13 permanecem integradas. Resultados históricos dessas entregas pertencem às fases 2/3 e não comprovam RF-029. O usuário informou merge em produção; esta execução verificou o repositório, sem homologação remota.

RF-029 em andamento na branch `feat/rf-029-recurring-incomes`, criada da main atualizada com árvore inicial limpa. P3-01 aprovada expressamente: regras mensais fixas, uma âncora, vigência inclusiva e geração em intervalo finito com prévia/confirmação, limite técnico inicial de 120 meses por comando. [Contrato canônico](recurring-incomes.md), [ADR-0016](decisions/0016-confirmed-monthly-income-generation.md) e [task/evidências](tasks/phase-3.md).

Domínio puro, migration aditiva, origem tipada, journals, API e UI implementados e validados. Previsões não movimentam caixa. Edição, pausa, cancelamento e retomada de séries ficam para RF-030/P3-02; recebimentos RF-028 permanecem disponíveis. RF-030 a RF-036 e P3-02/P3-04 a P3-07 não implementadas nesta entrega.

## Conferência e validação

`npm run check` aprovado: 54 documentos/28 tasks, tipos, 194 unitários/18 suites, builds, 101 operações OpenAPI e smoke. Integração final: 146 testes/17 suites. E2E: 15 jornadas. Docker saudável, migration RF-029 aplicada sem reset; novas rotas protegidas e diff check aprovados. Incluem regressões CSV/OFX, recebimentos e ciclo de cartão, upgrade, replay/restart, concorrência, rollback e mobile. Falha de massa duplicada corrigida e registrada na task. Prévia + geração de 120 meses: 442 ms no PostgreSQL local; calendário existente 120.000 datas em 20 ms. Não comprova capacidade de produção. Ainda faltam revisão staged, commit/push e PR.

RF-028 histórica: check (159 unitários/17 suites), integração (135 testes/15 suites), E2E (14 jornadas) e Docker aprovados na versão correspondente. O código integrado foi comparado, sem refazer trabalho validado desnecessariamente; regressões foram executadas na RF-029.

## Próxima ação concreta

1. Revisar staged diff/segredos da RF-029; validações locais aprovadas.
2. Revisar diff e dados sensíveis, registrar resultados reais e limitações na task; commit/push da branch e PR para main autorizados pelo usuário.
3. Conferir CI do head final. Não fazer merge/push direto para main nem avançar RF-030 nesta entrega.

## Políticas e ambiente

BIZ-01 a BIZ-05 preservadas; P3-03 em [recebimentos](income-settlements.md), P3-01 em [recorrências](recurring-incomes.md). [Políticas da v0](v0-policies.md) e [pendências](decisions/pending.md). Sem saldo/limite presumido, financiamento, transferência própria ou imposto inferido.

Node 24.14.0/npm 11.9.0 via C:/nvm4w/nodejs requerem execução autorizada fora do sandbox. Docker db/Mailpit iniciados, volume preservado. Testes em schemas próprios de rovere_test, dados fictícios e email local; migration RF-029 aplicada também no Docker local sem reset do volume. Avisos pg e NO_COLOR/FORCE_COLOR preexistentes registrados na task. Portas: banco 15432, API 3100, frontend http://127.0.0.1:18080, SMTP 11025, Mailpit 18025. [Comandos](../README.md). Produção/TLS não homologados.

Histórico HTTP limitado às últimas 20 versões, journal integral no banco. Recuperação conserva dados/chave enquanto tela montada, sem persistir rascunho financeiro após reload. Direção bancária confirmada permanece após reversão; revisão futura explícita. Limite de geração por comando não equivale a benchmark de produção.
