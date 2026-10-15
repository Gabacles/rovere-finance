# Fase 3 — Planejamento e terceiros

Planejamento registrado em 14/10/2026 e preservado na entrega RF-027. Receitas previstas avulsas integradas; RF-028 integrada pelo PR #15 em 9612bcb. RF-029 em andamento nesta branch; RF-030 a RF-036 permanecem propostas pendentes, a refinar imediatamente antes de começar, sem ampliar esta branch para toda a fase.

## Base conferida e limites

- RF-026 integrada pelo [PR #13](https://github.com/Gabacles/rovere-finance/pull/13) na main `a5b0b62`. Head final `1de60af`, implementação `224c81a`; a comparação de código entre implementação e merge não encontrou diferenças. CI do head e do merge aprovadas; evidências na [fase 2](phase-2.md).
- Há [dinheiro exato](../../packages/domain/src/money.ts), [calendário ancorado](../../packages/domain/src/civil-date.ts), compras, planos, faturas, ajustes, estornos e pagamentos. Na inspeção inicial da main, [schema](../../apps/api/prisma/schema.prisma) e [controllers](../../apps/api/src/app.ts) não implementavam receitas. RF-027 acrescenta Income/IncomeCommand manuais; RF-029 acrescenta RecurrenceRule/ScheduledOccurrence; Counterparty, Receivable, Payable e suas liquidações permanecem futuros. Testes de datas não comprovam um módulo de recorrências persistido.
- Na base RF-027, a disponibilidade somava somente faturas. RF-028 usa [consulta comum](../../apps/api/src/accounts/bank-availability.ts) para reservas de receitas e faturas, direção explicitamente confirmada e a mesma disciplina transacional por proprietário. Novos consumidores deverão ampliar essa mesma consulta e seus testes; não usar fórmulas isoladas por módulo.
- `ExpenseRefund` existente representa estorno de cartão associado à compra, não reembolso de terceiro. O [custo elegível](../card-adjustments.md) será a referência para recebíveis, preservando compra original, parcelas e pagamentos reais.
- Permanecem o [monólito modular](../architecture.md), [domínio](../domain.md), [contratos](../contracts.md), [políticas aprovadas](../v0-policies.md) e ADRs 0001/0002/0003/0004/0007/0009/0010/0011/0012/0013. Não há troca de stack, provedor ou dependência de Open Finance. CSV **e OFX** continuam obrigatórios.

Previsão, fato econômico, caixa e evidência são distintos. Previsto não é recebido/pago; conciliação não substitui liquidação. Orçamento permanece bruto; reembolso recebido afeta caixa/custo pessoal líquido, sem recompor orçamento. Dados desconhecidos não viram zero. Recorrências mantêm âncora e usam o último dia do mês quando necessário, sem ajuste automático por dia útil.

## Sequência proposta

| Task | Entrega revisável | Dependências diretas |
|---|---|---|
| RF-027 | Receitas previstas avulsas | RF-026 e fundação existente |
| RF-028 | Liquidação explícita de receitas e disponibilidade conjunta | RF-027, RF-024/RF-025 |
| RF-029 | Geração mensal de receitas recorrentes | RF-027 |
| RF-030 | Edição, pausa e cancelamento de recorrências | RF-029, RF-028 |
| RF-031 | Despesas/assinaturas recorrentes e confirmação do fato | RF-030, RF-021/RF-022/RF-023 |
| RF-032 | Cadastro privado de terceiros | RF-026 |
| RF-033 | Reembolsos previstos vinculados à despesa | RF-032, RF-025 |
| RF-034 | Compromissos a pagar a terceiros | RF-032, RF-021 |
| RF-035 | Recebimentos e pagamentos de terceiros | RF-028, RF-033, RF-034 |
| RF-036 | Conciliação assistida e regressão integrada da fase | RF-028 a RF-035 |

Ordem sugerida: RF-027 → RF-028 → RF-029 → RF-030 → RF-031 → RF-032 → RF-033 → RF-034 → RF-035 → RF-036. RF-029 e RF-032 são alternativas independentes se houver pendência em liquidações. Dependência pendente não significa task iniciada ou bloqueada; se uma execução ficar bloqueada, registrar motivo e condição de desbloqueio na própria task.

Cada fatia inclui domínio aplicável, persistência/migration aditiva, API, UI, OpenAPI, testes e documentação; não considerar somente backend ou scaffolding como entrega. RF-036 integra a experiência, mas não adia a segurança ou os testes das liquidações anteriores. Movimentos manuais de conta, transferências próprias, saldos de referência, financiamento, orçamento e relatórios anuais não são implicitamente entregues por esta fase; continuam no escopo macro da V1/evoluções e exigem planejamento próprio. Até existir movimento manual, liquidações usam BankEntry confirmado via CSV/OFX.

## Recomendações para decisões ainda abertas

Estas são propostas, não novas políticas aprovadas. Não reabrir BIZ-01 a BIZ-05. Antes do comportamento dependente, registrar a decisão no documento canônico e, quando relevante, em ADR. RF-027 pode prosseguir sem estas escolhas porque não gera ocorrências nem liquida valores. Índice de pendências em [decisions/pending.md](../decisions/pending.md).

| ID de proposta | Recomendação e motivo | Antes de implementar |
|---|---|---|
| P3-01 — geração | Aprovada expressamente em 15/10/2026: mensal, fixa, uma âncora, vigência inclusiva e intervalo finito com prévia/confirmação; limite inicial de 120 meses por comando a validar tecnicamente. [Contrato](../recurring-incomes.md)/[ADR-0016](../decisions/0016-confirmed-monthly-income-generation.md). | Resolvida para RF-029; sem job, geração infinita ou caixa automático. |
| P3-02 — alterações | Separar correção de ocorrência e alteração futura da regra. Prévia do conjunto afetado; pausa não apaga ocorrências e retomada não recompõe meses silenciosamente. Cancelamento preserva histórico; ocorrência com vínculo/liquidação exige revisão, nunca apagamento. Preservar versões e não gerar segunda ocorrência do mesmo período após editar a regra. | RF-030, antes de habilitar alterações em série. |
| P3-03 — diferenças de receita | Aprovada explicitamente em 14/10/2026: parcial/múltiplos movimentos, excedente sem alocação até revisão explícita e nenhuma quitação automática abaixo do previsto. [Regra canônica](../income-settlements.md), [ADR-0015](../decisions/0015-explicit-income-settlements.md). | Resolvida para RF-028; sem inferir tributo, tarifa ou baixa. |
| P3-04 — despesas recorrentes | Ocorrência é previsão; confirmação explícita cria ou vincula uma única Expense, com fato/data/valor informados. Para cartão, cobrança/fatura continuam dependendo de evidência e competência confirmada. Despesas sem cartão não ganham cartão fictício; liquidação bancária de despesa própria exige fatia específica futura, sem usá-la como compromisso com terceiro artificial. | RF-031; definir competência de planejamento explicitamente, independente do dia previsto e da data de caixa. |
| P3-05 — cronogramas de terceiros | Vencimentos e valores informados/confirmados, independentes das parcelas do cartão; distribuição inteira só após confirmar total e quantidade. Antecipação permite escolher vários vencimentos, sem rateio automático FIFO. Múltiplos terceiros compartilham o teto elegível da mesma despesa. | RF-033/RF-034; confirmar UX de divisão e escolha de vencimentos. |
| P3-06 — revisão após estorno | Aplicar BIZ-05: invalidar a atualidade do cálculo de recebível quando custo elegível mudar, conservar recebimentos e reservas, sinalizar excedente e exigir revisão antes de novos vínculos afetados. Eventual devolução deve ser compromisso explicitamente criado e vinculado, nunca dívida automática; não compensar com valores a pagar sem decisão. | RF-033/RF-035; detalhar revisão e comando de devolução, sem reabrir a política aprovada. |
| P3-07 — sugestões | Começar por seleção manual e candidatos determinísticos de direção/valor/data, com motivo e diferenças visíveis. Tolerâncias de data/valor não autorizam liquidação; não há autoaceite. Preservar correções manuais e evidências de importação. | RF-036; definir critérios de ordenação e revisão, medindo limites de consulta. |

## [x] RF-027 — Receitas previstas avulsas, sem efeito de caixa

- Estado: concluída
- Descrição: permitir cadastrar, consultar, corrigir e cancelar uma receita prevista manual, mantendo origem e histórico.
- Contexto/objetivo: primeira entrega recomendada; fornece o destino econômico para liquidações e recorrências sem depender das decisões P3-01 a P3-07. Exemplo fictício: cadastrar uma previsão de salário para 30/11, corrigir o valor, recarregar e consultar a mudança; nada é recebido por essa ação.
- Dependências: RF-026 integrada em `a5b0b62`, RF-011/RF-013 e padrões transacionais existentes. Criar `feat/rf-027-planned-incomes` a partir da main atualizada com este planejamento disponível; se ainda estiver apenas na branch documental, preservar e levar o plano explicitamente, sem merge não autorizado.
- Atividades e aceite:
  - [x] Documentar contrato canônico de receitas e referenciá-lo em domínio/contratos/índice; diferenciar expressamente previsão de recebimento. Não aprovar silenciosamente propostas das tasks seguintes.
  - [x] Implementar domínio puro com descrição obrigatória, notas opcionais, valor esperado BRL e data civil prevista com conhecimento/evidência. Campos não informados ficam `unknown`; zero confirmado não é desconhecido nem prova de recebimento. Valor esperado não negativo, dentro de BIGINT; jamais aceitar ponto flutuante. Não inferir competência, conta, terceiro ou recorrência.
  - [x] Persistir Income e comandos/histórico com proprietário, versão, evidência manual e estados `planned`/`cancelled`; constraints SQL de valores/referências e migration aditiva sem reset. Datas técnicas e civis permanecem separadas. Cancelamento é explícito e terminal nesta fatia, sem exclusão física; nova previsão exige nova ação.
  - [x] Implementar criar, listar paginado, detalhar, editar, cancelar e consultar histórico em API autenticada. Proposta de rotas: `POST/GET /api/incomes`, `GET/PATCH /api/incomes/:id`, `POST /api/incomes/:id/cancel`, `GET /api/incomes/:id/history`. Especificação final acompanha implementação, sem publicar rotas inexistentes no OpenAPI antecipadamente.
  - [x] Idempotency-Key em cada escrita; expectedVersion em edição/cancelamento. Mesmo payload/chave recupera resposta original após resposta perdida/restart; payload diferente conflita. Revalidar autorização/estado/versão dentro da transação com trava do proprietário e journal atômico, seguindo os padrões existentes. Edição de cancelada é recusada; futura receita com vínculos exigirá guardas específicas antes de habilitar RF-028/RF-029.
  - [x] UI permite cadastrar/corrigir/cancelar com confirmação explícita, listar e consultar histórico, informar desconhecido e distinguir cancelada. Formulário conserva entrada/chave em resposta perdida, oferece recuperação de conflito e atualiza consultas afetadas sem recarga completa. Labels e navegação por teclado utilizáveis em desktop/móvel.
  - [x] Nenhuma ação cria BankEntry, cobrança, fatura, despesa, liquidação ou saldo. Não expor estado recebido/pago, total de caixa ou orçamento deduzido dessas previsões. Valor esperado zero permanece previsão, sem pagamento sintético.
  - [x] Atualizar operações/schemas/snapshot OpenAPI com exemplos fictícios, contratos reais e erros; preservar sessão, Origin/CSRF, limites e política de documentação RF-026. Revisar guardas de erro JSON para o novo prefixo.
  - [x] Executar validações abaixo e registrar comandos, versão, resultados, falhas e limites nesta task; revisar diff/segredos antes de qualquer commit/push autorizado.
- Testes necessários:
  - Domínio: desconhecido versus zero, centavos canônicos/overflow/negativos rejeitados, datas inválidas/bissextas, limpeza explícita versus campo omitido, transições de cancelamento e ausência de inferências financeiras.
  - PostgreSQL/API: dois usuários sem leitura/escrita/vínculo cruzados; sem sessão/origem indevida; validação de campos extras/dinheiro/data/JSON; replay com resposta perdida e após edição/restart; chave conflitante; disputa entre editar/cancelar com versão antiga; rollback de fato/versão/journal; persistência e constraints; nenhum movimento financeiro criado.
  - Chromium: login → criar previsão com dado desconhecido → completar/corrigir → recarregar → conferir histórico → cancelar; conflito e resposta perdida sem duplicação; estado claro e viewport móvel. Fixtures exclusivamente fictícias.
  - Comandos de entrega: `npm run check`, `npm run test:integration`, `npm run test:e2e`, `git diff --check`. Durante desenvolvimento, direcionar suites; após código final, rodar conjuntos aplicáveis, incluindo contratos OpenAPI, importação CSV/OFX e ciclo de cartão. Migrations testadas em schema isolado de `rovere_test`; Docker local só declarado validado se efetivamente executado, sem apagar volume.
- Implementação: [contrato canônico](../planned-incomes.md), [ADR-0014](../decisions/0014-manual-planned-incomes.md), [domínio](../../packages/domain/src/incomes.ts), [migration aditiva](../../apps/api/prisma/migrations/202610140001_planned_incomes/migration.sql), [serviço](../../apps/api/src/incomes/incomes.service.ts), [controller](../../apps/api/src/incomes/incomes.controller.ts), [UI](../../apps/web/src/incomes.tsx), [testes de domínio](../../packages/domain/test/incomes.test.ts), [integração](../../apps/api/test/incomes.integration.test.ts), [Chromium](../../tests/e2e/incomes.spec.ts) e [OpenAPI](../api/openapi.json). Branch própria com planejamento preservado; nenhuma outra task implementada.
- Evidências (14/10/2026): `git fetch origin` confirmou base `a5b0b62`; `git switch -c feat/rf-027-planned-incomes origin/main` levou os seis arquivos locais de planejamento sem descarte. Node 24.14.0/npm 11.9.0 via `C:/nvm4w/nodejs` em execução autorizada fora do sandbox. `npm run typecheck` e `npm run api:docs:generate` aprovados. Suites direcionadas: 29 testes de domínio, 9 PostgreSQL/API e 1 jornada Chromium aprovados. Na versão final do código, `npm run check` aprovado: 50 documentos/28 tasks, links/hash histórico, tipos, 146 unitários (15 suites), builds, 91 operações OpenAPI e smoke HTML/2 assets. `npm run test:integration`: 118 testes aprovados em 12 suites; `npm run test:e2e`: 13 jornadas aprovadas. Incluem contratos HTTP de Income/lista/histórico, dois proprietários, constraints/FKs, concorrência editar/cancelar, rollback de criação/edição/cancelamento/versão/journal, replay após edição/cancelamento/restart e nenhum BankEntry/cobrança/fatura/despesa/alocação criado. Regressões completas CSV/OFX (inclusive 500 registros/formato), cartão e Swagger aprovadas. Capturas móveis de resumo/editor/cancelada inspecionadas, sem overflow, com labels e navegação de teclado verificados. Comparação semântica do OpenAPI contra origin/main: todos os paths/schemas/securitySchemes anteriores idênticos, somente seis operações e dois schemas de receitas adicionados (texto geral atualizado).
- Docker: `docker compose config --quiet` e `docker compose up --build -d --wait --wait-timeout 120` aprovados; quatro serviços saudáveis, migration `202610140001_planned_incomes` aplicada no banco existente sem reset/remoção de volume. Testes financeiros em schemas isolados de `rovere_test` e email local. HTTP pelo proxy: `/`, health/ready, docs e JSON 200; incomes/me anônimos 401; OpenAPI servido com 91 operações.
- Falhas/ajustes resolvidos: primeira jornada direcionada falhou com `Route is already handled` porque o botão de recuperação apareceu antes de terminar a requisição interceptada; UI passou a exibi-lo somente após resposta incerta e teste aguarda esse estado. Suites finais sem falhas. Avisos existentes de pg sobre consultas concorrentes e de Playwright NO_COLOR/FORCE_COLOR permanecem; Docker npm avisou scripts de instalação não cobertos por allowScripts, sem falha de build/migration. Sandbox restringiu acesso inicial a Node/Docker; execuções autorizadas resolveram, sem rejeição automática.
- Revisão: diff de código, migration, planejamento e snapshot revisados; exemplos/fixtures exclusivamente fictícios. Busca de padrões de chaves privadas/tokens sem achados; arquivos gerados, `.env`, uploads, banco e capturas/traces fora do versionamento. `git diff --check` aprovado. Evidências correspondem ao código final desta branch; registros posteriores de Git serão somente documentais.
- Versionamento: implementação/testes/planejamento no commit `e5df0b3` (`feat: add manual planned incomes`), publicado em `origin/feat/rf-027-planned-incomes` por `git push -u origin feat/rf-027-planned-incomes`. Identidade Git configurada, sem assinatura/coautoria do agente. Registro posterior somente documental; [abrir revisão](https://github.com/Gabacles/rovere-finance/compare/main...feat/rf-027-planned-incomes?expand=1). Nenhum PR/merge/push direto na main realizado nesta entrega.
- Integração conferida na retomada: [PR #14](https://github.com/Gabacles/rovere-finance/pull/14), merge `a46b9f2` na main; `git fetch origin` e comparação de código com `546e205` sem diferenças em apps/packages/scripts/tests/CI/manifests. API GitHub confirmou merged:true e [CI do merge aprovada](https://github.com/Gabacles/rovere-finance/actions/runs/38642729169/job/116121986943). Testes RF-027 históricos acima não foram reatribuídos à retomada; regressões de previsões fazem parte das suites finais RF-028.
- Próximo passo/limitação: RF-027 integrada; seguir RF-028 e decidir P3-03. Sem recorrência, liquidação, associação de importação, classificação automática, categorias/orçamento ou alteração do ciclo de cartão nesta fatia RF-027. Histórico HTTP limitado às últimas 20 versões; journal completo persistido. Tentativa incerta preservada enquanto a UI estiver montada, sem rascunho financeiro em armazenamento do browser após reload. Produção/TLS ainda não validados.

## [x] RF-028 — Liquidações de receitas e disponibilidade bancária conjunta

- Estado: concluída
- Descrição: vincular entradas bancárias confirmadas às receitas, com parcial/total e reversão de vínculo.
- Contexto/objetivo: importar salário sem criar outra receita nem usar dinheiro reservado por outro módulo.
- Dependências: RF-027 integrada em `a46b9f2`, RF-024/RF-025 entregues e P3-03 aprovada antes do comportamento dependente.
- Decisão: usuário aprovou expressamente a recomendação P3-03; [contrato detalhado](../income-settlements.md). Aprovação anterior de abertura do PR para main ao concluir permanece; merge não autorizado.
- Atividades e aceite:
  - [x] Alocações tipadas, limite na origem/destino e direção confirmada; consulta e escrita de todos os módulos consumidores consideram as mesmas reservas ativas. Preservar as alocações de fatura existentes e impedir confirmar o mesmo movimento simultaneamente como entrada e saída incompatíveis.
  - [x] Migration aditiva com backfill das saídas existentes, FKs compostas, evidências/journal imutáveis e reversão única. Avançar versões Income/BankEntry e journal na mesma transação sob trava de User, com replay durável e conflitos de payload/versão/estado.
  - [x] API autenticada: consulta paginada/criação/reversão de liquidações, consulta da fonte compartilhada e histórico unificado. Guardas de erros JSON, Origin/CSRF e OpenAPI/snapshot atualizados, sem afetar contratos de fatura existentes.
  - [x] UI seleciona manualmente movimentos CSV/OFX, exige confirmação de entrada e reversão, conserva tentativas incertas/chave, oferece recuperação de conflito e atualiza projeções afetadas sem reload; labels/teclado/mobile verificados.
  - [x] Domínio puro verifica parcial/múltiplos destinos, desconhecido/zero/overflow e ausência de baixa/caixa sintético; integração verifica isolamento/FKs, limites/concorrência inclusive fatura versus receita, rollback/replay/restart/reversão e migração de fontes existentes; Chromium cobre CSV e OFX, diferenças, revisão de vínculos e perda de resposta.
  - [x] Executar npm run check, npm run test:integration, npm run test:e2e e git diff --check na versão final; revisar diff/segredos e registrar evidências antes de commit/push/PR autorizado.
  - [x] Receita/valor desconhecido ou cancelada não admite liquidação; correção abaixo do já recebido exige revisão explícita sem apagar recebimento. Reversão de vínculo preserva movimento e libera apenas sua reserva, sem criar estorno de caixa.
  - [x] UI/API/OpenAPI mostram previsto, recebido, pendente e diferenças; seleção manual de movimentos CSV/OFX confirmados, sem nova receita automática. Relações SQL tipadas, sem tabela financeira genérica `tipo + id`.
- Testes necessários: parcial, múltiplos movimentos/destinos, excedente, direção incompatível, corrida pelo mesmo dinheiro inclusive com fatura, limites/overflow, isolamento, rollback/replay/reversão, contratos e jornada com CSV e OFX.
- Implementação: [contrato canônico](../income-settlements.md)/[ADR-0015](../decisions/0015-explicit-income-settlements.md), [domínio de recebimentos](../../packages/domain/src/income-settlements.ts)/[disponibilidade](../../packages/domain/src/bank-availability.ts), [consulta compartilhada](../../apps/api/src/accounts/bank-availability.ts), [migration aditiva](../../apps/api/prisma/migrations/202610140002_income_settlements/migration.sql), [serviço](../../apps/api/src/incomes/settlements.service.ts)/[controller](../../apps/api/src/incomes/settlements.controller.ts), [guardas de receitas](../../apps/api/src/incomes/incomes.service.ts), [UI](../../apps/web/src/income-settlements.tsx) e [OpenAPI](../api/openapi.json). IncomeSettlement tipada, reversão única e journal unificado; pagamentos preservam formato anterior e passam a somar as reservas de receitas pela mesma consulta.
- Evidências (desenvolvimento): retomada limpa, base `origin/main` em `a46b9f2` e RF-027 sem diferença de código. Node 24.14.0/npm 11.9.0 fora do sandbox. `docker compose up -d db mailpit --wait --wait-timeout 120` aprovado sem reset de volume. P3-03 aprovada expressamente antes das regras dependentes. `npm run typecheck`, build e geração OpenAPI aprovados (95 operações). Direcionados: 11 testes puros de recebimentos, 2 de disponibilidade, 13 PostgreSQL/API de liquidações, 3 de confirmação comum, 14 de regressão de pagamentos, 1 de upgrade com fontes/alocações/journal antigos fictícios e 1 jornada Chromium CSV/OFX aprovados. Capturas móveis de resumo/editor inspecionadas, sem overflow e com teclado verificado. Validações completas da versão final ainda pendentes; resultados direcionados não as substituem.
- Falhas de desenvolvimento resolvidas: Prisma P1012 exigiu unicidade composta na relação BankEntryConfirmation/BankEntry; corrigida no schema/migration. Validador documental exigiu rótulos canônicos Implementação: e Evidências (desenvolvimento):; corrigidos antes da validação final. Chromium: seletor de status ambíguo entre previsão/recebimentos e timeout ao procurar descrição OFX sem memo; seletores ajustados para mensagens específicas e descrição real preservada, repetição aprovada sem ampliar timeout.
- Evidências (versão final, 14/10/2026): `npm run check` aprovado: 52 documentos/28 tasks, links/hash histórico, tipos, 159 unitários em 17 suites, builds, OpenAPI 3.1.1/referências/inventário/snapshot com 95 operações e smoke HTML/2 assets. `npm run test:integration`: 135 testes aprovados em 15 suites, incluindo migração de fontes antigas, concorrência receita/receita e receita/fatura, edição/cancelamento versus recebimento, duas versões/journal atômicos, constraints/FKs, isolamento, erros/limites, replay após alterações/restart e CSV/OFX/reimportação. `npm run test:e2e`: 14 jornadas aprovadas, incluindo CSV e OFX, recebimentos parciais, excedente sem alocação, resposta perdida na associação/reversão, conflito/recarregamento, guardas de edição/cancelamento, histórico, teclado/mobile e regressões completas de cartão/importação/Swagger (inclusive 500 registros/formato).
- Docker final: `docker compose config --quiet` e `docker compose up --build -d --wait --wait-timeout 120` aprovados; quatro serviços saudáveis, migration `202610140002_income_settlements` aplicada sem reset/remoção de volume. HTTP pelo proxy: frontend/health/ready/docs/JSON 200; novas rotas de recebimentos/fonte 401 sem sessão. OpenAPI servido com 95 operações. Testes financeiros executados exclusivamente em schemas próprios de rovere_test, dados fictícios e SMTP/Mailpit local; upgrade validado em schema isolado preenchido com dados antigos fictícios.
- Revisão: diff/schema/migration/domínio/API/UI/testes e contratos revisados; comparação semântica OpenAPI contra main preservou todos os paths/security e schemas anteriores, exceto extensão intencional IncomeHistory para alocações/reversões. Quatro novas operações, sem relaxar proteção ou publicar endpoints futuros. Capturas de resumo/editor móveis inspecionadas, sem overflow. `git diff --check` aprovado; arquivos financeiros, `.env`, tokens, gerados e artefatos de teste não fazem parte da entrega. Avisos pg de consultas concorrentes e NO_COLOR/FORCE_COLOR permanecem para manutenção futura; suites finais sem falhas.
- Versionamento: implementação validada `3de1cd2` (`feat: settle planned incomes with shared bank availability`) publicada em `origin/feat/rf-028-income-settlements`; [PR #15 aberto para main](https://github.com/Gabacles/rovere-finance/pull/15), conforme autorização. Identidade Git configurada, sem assinatura/coautoria do agente; nenhum merge/push direto na main. Na abertura, [CI do head de implementação](https://github.com/Gabacles/rovere-finance/actions/runs/38653642649/job/116158156770) estava queued; não declarada aprovada. Registro posterior somente documental, sem mudar o código validado.
- Integração conferida na retomada: PR #15 integrado na main em `9612bcb`; fetch e comparação com `8b4ba58` sem diferenças em apps/packages/scripts/tests/CI/manifests. Produção informada pelo usuário, sem homologação remota por esta execução.
- Próximo passo/limitação: RF-028 integrada; seguir RF-029 com P3-01 expressamente aprovada. Sem merge, baixa automática, tributo presumido, recorrência, terceiros ou geração de caixa manual. Histórico HTTP limitado a 20 versões (journal integral persistido); tentativas incertas preservadas somente enquanto tela montada. Direção confirmada permanece após reversão; troca exige fluxo futuro explícito, não reinterpretar dinheiro silenciosamente. Cancelar/limpar/reduzir abaixo do recebido exige revisão dos vínculos e é recusado até correção explícita; recebimentos reais não são apagados. Produção/TLS não homologados. RF-029 exige P3-01 antes de geração mensal.

## [ ] RF-029 — Receitas recorrentes mensais

- Estado: em andamento
- Descrição: criar regra mensal e materializar previsões únicas em intervalo confirmado.
- Contexto/objetivo: salário nos dias 15 e 30 como previsões independentes, posteriormente liquidáveis por RF-028.
- Dependências: RF-027/RF-028 integradas; main atualizada em `9612bcb` pelo merge PR #15, sem diferenças de código para `8b4ba58`. P3-01 aprovada expressamente em 15/10/2026, antes da implementação dependente. Branch própria `feat/rf-029-recurring-incomes`, working tree inicial limpa.
- Atividades e aceite:
  - [x] Prévia, geração limitada e confirmada, unicidade regra/período e vínculo tipado ocorrência/receita; reexecução/concorrência não duplicam previsões, mesmo quando duas regras caem na mesma data de fevereiro.
  - [x] Âncora preservada, início/fim explícitos e origem da regra registrada; nenhuma geração de caixa/fatura. UI/API/OpenAPI permitem conferir as ocorrências.
  - [x] Domínio puro valida valor fixo BRL/BIGINT, dias 1–31, vigência inclusiva e intervalo civil finito até 120 meses; reutiliza occurrenceInMonth e preserva zero/desconhecido sem inferir dinheiro recebido.
  - [x] Persistência/migration aditiva com RecurrenceRule/ScheduledOccurrence/RecurrenceCommand, FKs compostas por proprietário, origem recurrence distinta de manual, unicidade regra/período e receita por ocorrência; histórico imutável e sem apagar registros.
  - [x] Criação/lista paginada/detalhe/prévia/geração/histórico autenticados; Origin/CSRF/JSON/erros e OpenAPI/snapshot reais. Prévia é leitura; geração exige expectedVersion/previewHash/confirmação/chave e revalida tudo sob trava User com journals atômicos.
  - [x] Retry após resposta perdida/restart recupera resultado original; payload/chave conflitante e preview/versão obsoletos falham. Sobreposição/concorrência não duplicam receitas, mesmo com duas regras na mesma data. Guardas recusam edição/cancelamento de ocorrência gerada até RF-030, preservando liquidação RF-028.
  - [x] UI cadastra regra, solicita intervalo, mostra prévia e exige confirmação; mantém formulário/chave em incerteza, recupera conflito e atualiza lista de receitas sem reload; histórico/labels/teclado/mobile verificados.
  - [ ] Executar check/integração/E2E/diff check finais, medir limite proposto em domínio e PostgreSQL isolado, preservar CSV/OFX/cartão/recebimentos, revisar diff/segredos e registrar evidências antes de commit/push/PR autorizado. Não fazer merge/push direto na main.
- Testes necessários: dias 15/30/31, fevereiro bissexto/não bissexto e março, limites de ano/intervalo, duas regras distintas, replay/concorrência/rollback, autorização e jornada de geração.
- Implementação: [domínio puro](../../packages/domain/src/income-recurrences.ts), [migration](../../apps/api/prisma/migrations/202610150001_income_recurrences/migration.sql), [serviço/API](../../apps/api/src/incomes/recurrences.service.ts), [UI](../../apps/web/src/income-recurrences.tsx), [contrato](../recurring-incomes.md)/[ADR-0016](../decisions/0016-confirmed-monthly-income-generation.md), [integração](../../apps/api/test/income-recurrences.integration.test.ts) e [Chromium](../../tests/e2e/income-recurrences.spec.ts). Reutiliza occurrenceInMonth sem reimplementar calendário.
- Evidências de base: fetch confirmou main `9612bcb`; comparação com `8b4ba58` em apps/packages/scripts/tests/CI/manifests sem diferenças. Node 24.14.0/npm 11.9.0 disponíveis fora do sandbox; Docker sem containers ativos na retomada; db/Mailpit iniciados sem reset. Build do domínio aprovado. Medição isolada da primitiva existente: 120.000 datas civis (1.000 intervalos de 120 meses), 20 ms neste host; não mede capacidade de banco/produção nem comprova RF-029. P3-01 aprovada. [CI do merge RF-028 aprovada](https://github.com/Gabacles/rovere-finance/actions/runs/38798105817/job/116639735897); GitHub confirmou merged:true.
- Evidências: `npm run api:docs:generate` e `npm run check` finais aprovados: 54 documentos/28 tasks, tipos, 194 unitários/18 suites, builds, 101 operações OpenAPI e smoke. `npm run test:e2e`: 15 jornadas aprovadas, incluindo recuperação de chave, conflito, histórico, atualização da lista e mobile; capturas inspecionadas. `docker compose config --quiet` e `docker compose up -d --build --wait --wait-timeout 120` aprovados; 13ª migration aplicada sem reset do volume, db/API/web saudáveis, HTML/ready 200 e novas leituras sem sessão 401/no-store. `npm run test:integration -- --silent=false` final aprovado: 146 testes/17 suites, incluindo upgrade de dados RF-028, geração, paginação/histórico, recebimentos de ocorrências via CSV/OFX e ciclo de cartão. Limite de 120 meses: prévia + geração de 120 receitas/journals em 442 ms neste host (medição anterior 436 ms), zero exato; timeout transacional de 60 s. Não é benchmark de produção. `git diff --check` aprovado.
- Falha corrigida: nova jornada de recebimento CSV/OFX usava a mesma conta e fingerprint de uma massa existente; confirmação corretamente retornou 409. Massa isolada em outra conta fictícia; primeira regressão completa passou. Nenhuma política de duplicidade alterada. Logs de falhas injetadas são esperados nos testes de rollback. Avisos pg de consultas concorrentes e NO_COLOR/FORCE_COLOR preexistentes permanecem; não são falhas de validação.
- Próximo passo/limitação: revisar staged diff, commit/push da branch e abrir PR para main conforme autorizado; sem valor variável inferido, cadências avançadas ou mutações de série até RF-030.

## [ ] RF-030 — Ciclo de vida de recorrências

- Estado: pendente
- Descrição: editar futuro, corrigir ocorrência, pausar, retomar e cancelar com histórico e prévia de impacto.
- Contexto/objetivo: preservar ocorrências e liquidações reais quando o planejamento muda.
- Dependências: RF-029, RF-028 e decisão P3-02.
- Atividades e aceite:
  - [ ] Separar alcance de alteração individual/futura; manter ocorrências passadas e vínculos, versões e unicidade. Retomada e regeneração não recriam canceladas silenciosamente.
  - [ ] Ocorrências liquidadas ou em disputa exigem revisão; UI explica impacto antes de confirmar. Sem edição retroativa ou apagamento automático de receitas/caixa.
- Testes necessários: pausa/retomada com lacunas, mudança de dia/valor, cancelamento com ocorrência liquidada, edição versus geração/liquidação concorrentes, replay, isolamento e jornada com histórico.
- Implementação: não iniciada.
- Evidências: somente plano; nenhum teste desta task executado.
- Próximo passo/limitação: detalhar após RF-029/RF-028; não substituir os planos imutáveis de parcelas RF-022.

## [ ] RF-031 — Despesas e assinaturas recorrentes

- Estado: pendente
- Descrição: prever despesas recorrentes e confirmar sua relação com o fato econômico efetivo.
- Contexto/objetivo: assinatura prevista, despesa registrada e cobrança importada não contam três vezes.
- Dependências: RF-030, RF-021/RF-022/RF-023; decisão P3-04.
- Atividades e aceite:
  - [ ] Reutilizar ciclo de recorrência, com relação tipada à Expense; criação ou vínculo explicitamente confirmado sem fatura/conta fictícia. Preservar valor previsto, efetivo e diferença.
  - [ ] CSV/OFX e correções manuais conservam evidências; consultas da ocorrência não somam previsão já realizada e compra/cobrança como fatos novos. Interface distingue previsto, registrado e liquidado quando houver evidência suportada.
- Testes necessários: assinatura no cartão, despesa sem cartão, valor divergente, ocorrência já vinculada, reimportação nos dois formatos, concorrência, isolamento, cancelamento com dependências e jornada UI.
- Implementação: não iniciada.
- Evidências: somente plano; nenhum teste desta task executado.
- Próximo passo/limitação: detalhar após RF-030; não antecipar orçamento nem alegar liquidação bancária de despesa própria ainda inexistente.

## [ ] RF-032 — Cadastro privado de terceiros

- Estado: pendente
- Descrição: cadastrar, consultar, corrigir e arquivar pessoas de referência dos compromissos.
- Contexto/objetivo: identidade interna estável para receber/pagar sem compartilhamento familiar ou convite externo.
- Dependências: RF-026 e identidade existente; independente das decisões de calendário/liquidação.
- Atividades e aceite:
  - [ ] Cadastro mínimo por proprietário, versões/histórico e arquivamento sem apagar vínculos. Nome igual não implica pessoa igual; nenhuma fusão automática.
  - [ ] UI/API/OpenAPI próprios; não exigir CPF, conta bancária ou contato para registrar compromisso, nem enviar comunicação.
- Testes necessários: isolamento, validação, homônimos, replay/versão, arquivamento e jornada CRUD com persistência.
- Implementação: não iniciada.
- Evidências: somente plano; nenhum teste desta task executado.
- Próximo passo/limitação: alternativa independente; detalhar ao iniciar, sem portal/conta do terceiro.

## [ ] RF-033 — Reembolsos previstos e revisão de elegibilidade

- Estado: pendente
- Descrição: criar recebível ligado a despesa e terceiro, com calendário independente e revisão após alterações/estornos.
- Contexto/objetivo: Uber de 50 com reembolso esperado de 25; guarda-roupa em cinco parcelas com reembolso em outra programação.
- Dependências: RF-032, RF-025; decisões P3-05/P3-06.
- Atividades e aceite:
  - [ ] Total/cronograma confirmados e FKs tipadas; soma dos recebíveis de todos os terceiros respeita custo elegível conhecido, sem estimar total a partir de parcela. Compra com elegibilidade desconhecida exige confirmação antes de compromisso monetário.
  - [ ] Mostrar original, estorno, esperado e pendente sem presumir recebido. Mudanças de compra/estorno invalidam contexto dependente atomicamente e exigem revisão, preservando histórico; preparar a proteção de recebimentos reais antes de RF-035.
- Testes necessários: divisão exata, múltiplos terceiros disputando teto, custo desconhecido/zero, estorno posterior, correção da compra, calendário diferente do cartão, isolamento, idempotência e jornada UI.
- Implementação: não iniciada; referência ao [custo elegível RF-025](../card-adjustments.md).
- Evidências: somente plano; nenhum teste desta task executado.
- Próximo passo/limitação: detalhar após RF-032; liquidações em RF-035, sem tratar expectativa como caixa ou liberar orçamento bruto.

## [ ] RF-034 — Compromissos a pagar a terceiros

- Estado: pendente
- Descrição: registrar obrigação com terceiro e vencimentos confirmados vinculados à despesa/compromisso de origem.
- Contexto/objetivo: passagens compradas pelo irmão em quatro vencimentos, sem cartão próprio fictício.
- Dependências: RF-032, RF-021; decisão P3-05.
- Atividades e aceite:
  - [ ] Origem econômica explícita e tipada, cronograma próprio e total exato; criação/vínculo da despesa não duplica consumo. UI mostra valores a pagar sem presumir pagamento.
  - [ ] Correção/cancelamento preserva histórico e revalida dependências. Não inferir juros, renegociação, compensação de recebível ou dívida por estorno.
- Testes necessários: quatro vencimentos, centavos restantes, origem já existente, ausência de cartão, conflito de versão, rollback, isolamento e jornada UI.
- Implementação: não iniciada.
- Evidências: somente plano; nenhum teste desta task executado.
- Próximo passo/limitação: detalhar após RF-032; pagamentos em RF-035, sem motor genérico de financiamento.

## [ ] RF-035 — Liquidações de terceiros e revisão de excedentes

- Estado: pendente
- Descrição: alocar recebimentos/pagamentos efetivos a vencimentos selecionados de recebíveis/pagáveis.
- Contexto/objetivo: antecipação e pagamento parcial sem mudar o calendário do cartão nem duplicar caixa/consumo.
- Dependências: RF-028, RF-033, RF-034; decisões P3-05/P3-06.
- Atividades e aceite:
  - [ ] Alocações tipadas de entrada/saída com disponibilidade conjunta incluindo receitas e faturas; um movimento atende múltiplos vencimentos, e um vencimento recebe múltiplos movimentos, dentro dos limites transacionais.
  - [ ] Reversão explícita e revisão após estorno/correção mantêm recebimentos/reservas reais. Eventual devolução exige compromisso explicitamente confirmado e rastreado; excedente não vira dinheiro livre nem baixa automática.
  - [ ] UI/API/OpenAPI separam esperado, recebido/pago, pendente e excedente para revisão, com efeitos de caixa apenas nos movimentos existentes; orçamento bruto e cobranças do cartão preservados.
- Testes necessários: pai paga tudo no primeiro mês com cinco cobranças preservadas, Uber não pago, parcial/múltiplos Pix, pagamento ao irmão, corrida fatura versus pagável e receita versus reembolso, estorno após recebimento, devolução explícita, rollback/replay/reversão, isolamento e CSV/OFX.
- Implementação: não iniciada.
- Evidências: somente plano; nenhum teste desta task executado.
- Próximo passo/limitação: detalhar após RF-028/RF-033/RF-034; sem compensação automática entre contas de terceiros ou orçamento líquido.

## [ ] RF-036 — Conciliação assistida e aceite integrado da fase

- Estado: pendente
- Descrição: apresentar candidatos e confirmar liquidações de movimentos importados usando comandos já validados.
- Contexto/objetivo: completar a experiência de previsão → importação → confirmação → liquidação, sem reescrever o pipeline correto.
- Dependências: RF-028 a RF-035; decisão P3-07.
- Atividades e aceite:
  - [ ] Distinguir vínculo de evidência/importação e alocação de dinheiro; candidatos nunca confirmam automaticamente. Movimento deve estar confirmado antes da liquidação; revisão mostra diferenças, disponibilidade e decisões anteriores.
  - [ ] Reimportação/link preserva receitas, recebíveis, pagáveis, personalizações e histórico; não duplicar receita nem reembolso. Resposta perdida/restart/decisão obsoleta não gera gravação parcial.
  - [ ] Validar jornadas do domínio: salário dias 15/30, guarda-roupa e reembolso independente/antecipado, Uber parcial/não pago, passagens do irmão, estorno após recebimento. Documentar limites e pendências da V1 sem declarar orçamento/relatórios concluídos.
- Testes necessários: contratos HTTP, autorização, concorrência entre módulos, rollback/replay, todas as jornadas com CSV e OFX, regressões de 500 registros por formato, ciclo de cartão e Swagger; testes das etapas anteriores devem já estar aprovados.
- Implementação: não iniciada; reutilizar [confirmação de importação](../import-confirmation.md), sem substituir parsers ou alterar origem imutável.
- Evidências: somente plano; nenhum teste desta task executado.
- Próximo passo/limitação: detalhar após as entregas anteriores; transferências próprias continuam exigindo tratamento próprio, jamais classificadas como receita por aproximação.

## Evidências da entrega de planejamento

Branch `docs/phase-3-planning`, base `origin/main` atualizada em `a5b0b62`; escopo somente documental. Inspecionados manifests, schema, registro de controllers, comandos de compras/pagamentos/importações, primitivas/testes de calendário e implementação/testes/CI da RF-026. `git diff --exit-code 224c81a origin/main -- apps packages scripts tests .github package.json package-lock.json` aprovado: sem diferenças de código.

`npm run docs:check` aprovado: 48 documentos Markdown, 28 tasks, links locais e SHA-256 do histórico preservado. Executado por `C:/nvm4w/nodejs/npm.cmd` com Node 24.14.0, pois o Node do NVM não estava acessível no sandbox inicial; execução autorizada fora do sandbox resolveu a limitação. `git diff --check` aprovado; diff e arquivo novo revisados, somente documentação e exemplos fictícios. GitHub CLI indisponível: merge/CI conferidos pela API pública do GitHub; fetch também exigiu execução autorizada por restrição de escrita em `.git`.

Não foram reexecutados Docker, banco, unitários, integração ou Chromium nesta entrega de plano; resultados anteriores pertencem às versões e execuções citadas na fase 2. Nenhuma migration, funcionalidade financeira, commit, push ou merge faz parte desta entrega. Próxima ação: RF-027; decisões dependentes e detalhes das demais tasks permanecem para suas entregas.
