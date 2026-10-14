# Progresso e ponto de retomada

Atualizado em 14/10/2026. Estados, critérios e evidências nas [tasks](tasks/README.md).

## Entrega atual

RF-026 integrada na main `a5b0b62` pelo [PR #13](https://github.com/Gabacles/rovere-finance/pull/13), após RF-025/PR #12. Merge e CI do head `1de60af` e da main conferidos no GitHub; comparação com implementação `224c81a` sem diferenças de código. O registro anterior de “aguardando integração” foi corrigido. Evidências e links das execuções na [fase 2](tasks/phase-2.md).

Swagger UI `/api/docs`, JSON `/api/openapi.json` e snapshot agora com 91 operações (seis de receitas) preservam sessão/Origin/CSRF e política de produção. Ciclo básico de cartão e CSV/OFX continuam no escopo de regressão; isso não conclui toda a V1.

Planejamento local da [fase 3](tasks/phase-3.md), originalmente em `docs/phase-3-planning` sem commit/push, preservado ao criar `feat/rf-027-planned-incomes` de `origin/main` conferida por fetch em `a5b0b62`. **RF-027 concluída e validada:** domínio, migration aditiva, API, UI, histórico, idempotência/versões e OpenAPI. Receitas previstas não movimentam caixa. RF-028 a RF-036 continuam pendentes; P3-01 a P3-07 não implementadas. Nenhum merge/push direto na main.

Implementação `e5df0b3` publicada em `origin/feat/rf-027-planned-incomes`, com identidade Git configurada, commit semântico e sem assinatura/coautoria do agente. [Abrir revisão da branch](https://github.com/Gabacles/rovere-finance/compare/main...feat/rf-027-planned-incomes?expand=1). Registro posterior somente documental; CI remota e integração ainda a conferir/autorizar.

## Conferência e validação

Inspeção inicial confirmou ausência de receitas persistidas; RF-027 acrescenta somente Income manual previsto/cancelado e journal próprio, sem caixa. Recorrências/terceiros/liquidações de receitas continuam ausentes. Disponibilidade bancária atual considera apenas faturas; RF-028 precisará de consulta conjunta. Estorno de cartão não é reembolso de terceiro.

RF-027: `npm run check` aprovado (146 unitários, tipos, builds, 91 operações OpenAPI e smoke), `npm run test:integration` (118 testes/12 suites), `npm run test:e2e` (13 jornadas) e `git diff --check` aprovados. Docker atualizado saudável e migration aplicada sem reset do volume. Incluem CSV/OFX, ciclo de cartão e Swagger; contratos anteriores do OpenAPI preservados. Evidências, falha inicial resolvida e limites na [task](tasks/phase-3.md). Resultados históricos RF-026 permanecem na fase 2.

## Próxima ação concreta

1. Abrir/revisar PR da branch RF-027 e conferir CI remota; integrar somente com autorização específica. Nenhum PR/merge automático realizado nesta entrega.
2. Após revisão/integração autorizada, detalhar RF-028 e resolver P3-03 antes de liquidações. Não copiar disponibilidade exclusiva de faturas.
3. Resolver as demais propostas antes dos comportamentos dependentes. RF-032 permanece alternativa independente futura; nenhuma outra task iniciada nesta entrega.

## Políticas e ambiente

BIZ-01 a BIZ-05 preservadas: orçamento bruto, BRL, calendário ancorado, competência explícita de fatura, encargos informados sem juros presumidos, CSV/OFX genéricos e revisão explícita de excedentes de reembolso. [Políticas](v0-policies.md) e [pendências](decisions/pending.md). Saldo anterior, financiamento, transferências próprias, saldos de referência e orçamento/relatórios não são entregues pelo planejamento da fase 3.

Docker RF-027 validado em PostgreSQL 15432, API 3100, frontend `http://127.0.0.1:18080`, SMTP 11025 e Mailpit 18025. Testes usam schemas próprios de `rovere_test`, dados fictícios e email local, sem reset do volume. Node 24.14.0/npm 11.9.0 em `C:/nvm4w/nodejs` exigem execução autorizada fora do sandbox; não houve rejeição automática. Histórico HTTP de receitas mostra últimas 20 versões; journal integral no banco. Recuperação de tentativa incerta conserva dados/chave enquanto a tela estiver montada, sem persistir rascunho no navegador após reload. Aviso pg sobre consultas concorrentes continua registrado para revisão antes de upgrade. [Comandos](../README.md).
