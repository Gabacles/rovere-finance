# Fase 1 — Base técnica e primeira importação

## [x] RF-010 — Preparar workspaces e aplicação mínima executável

- Estado: concluída
- Descrição: estruturar React/Vite, NestJS e pacote de domínio; fixar dependências, comandos e build.
- Contexto/objetivo: base consistente para entregas verticais sem simular finanças ainda inexistentes.
- Dependências: RF-000 e RF-001.
- Atividades e aceite:
  - [x] Instalar dependências com lockfile.
  - [x] Compilar frontend, API e domínio, com verificação de tipos.
  - [x] Validar liveness HTTP real e página inicial com estado técnico honesto.
  - [x] Documentar execução e preparar pipeline de validação.
- Testes necessários: tipos, build, teste HTTP da API e verificação documental.
- Implementação: [frontend](../../apps/web/src/main.tsx), [API](../../apps/api/src/app.ts), [manifests](../../package.json), [CI](../../.github/workflows/ci.yml), [README](../../README.md), [teste HTTP atual](../../apps/api/test/identity.integration.test.ts) e [smoke web](../../scripts/smoke-web.mjs). O teste HTTP inicial foi incorporado à integração na RF-013.
- Evidências (08/10/2026): Node 24.14.0/npm 11.9.0; `npm install --no-fund` gerou lockfile e auditou sem vulnerabilidades conhecidas; `npm run check` passou (documentação, tipos, 42 testes e builds); `npm run smoke:web` passou, servindo HTML e 2 assets compilados por HTTP. Git local inicializado, sem commit ou remoto. CI preparada, ainda não executada no GitHub.
- Falha resolvida: o primeiro typecheck apontou TS2591 por ausência de `types: ["node"]` na API; configuração corrigida e checks repetidos com sucesso.
- Limitação: smoke HTTP e build não substituem validação visual/E2E em navegador. A página é informativa; não implementa funcionalidades financeiras.
- Próximo passo: RF-012 e RF-013, preservando a distinção entre liveness e readiness de banco.

## [x] RF-011 — Implementar primitivas exatas de dinheiro e datas

- Estado: concluída
- Descrição: parsing canônico de centavos, operações com overflow, distribuição exata e datas civis/recorrência ancorada.
- Contexto/objetivo: executar INV-01, INV-02 e INV-10 antes dos fluxos financeiros completos.
- Dependências: RF-001 e RF-010.
- Atividades e aceite:
  - [x] Rejeitar valores imprecisos, inválidos ou fora do intervalo BIGINT.
  - [x] Distribuir centavos preservando soma e sinal.
  - [x] Validar datas gregorianas e preservar âncora no ajuste de mês curto.
  - [x] Passar testes de borda e varredura determinística de alocações.
- Testes necessários: Vitest unitário; negativos, zero, limites, fevereiro e bissextos.
- Implementação: [dinheiro](../../packages/domain/src/money.ts), [datas](../../packages/domain/src/civil-date.ts), [testes de dinheiro](../../packages/domain/test/money.test.ts) e [testes de datas](../../packages/domain/test/civil-date.test.ts).
- Evidências (08/10/2026): `npm test` passou com 42 testes em 3 arquivos (inclui 2 testes HTTP da API); varredura de 4.060 combinações de valores/quantidades verifica soma, sinal e diferença máxima de um centavo; typecheck e build do domínio passaram. Limites BIGINT e datas bissextas cobertos.
- Limitação: distribuição matemática não cria plano de compra, fatura ou cobrança. Tipos de importação não substituem validadores HTTP/parsers futuros.
- Próximo passo: reutilizar as primitivas nos casos de uso financeiros, adicionando testes de integração para suas regras específicas.

## [x] RF-012 — Validar ambiente Docker Compose

- Estado: concluída
- Descrição: executar frontend, API e PostgreSQL em containers com healthchecks e dados locais isolados.
- Contexto/objetivo: verificar ambiente reproduzível antes de migrations e persistência.
- Dependências: RF-010; Docker Engine disponível.
- Atividades e aceite:
  - [x] Validar sintaxe e configuração do Compose.
  - [x] Construir imagens e iniciar serviços.
  - [x] Verificar HTTP e PostgreSQL saudáveis e documentar parada sem excluir volumes.
- Testes necessários: `docker compose config --quiet`, build, healthchecks e consulta HTTP.
- Implementação: [compose.yaml](../../compose.yaml), [Dockerfile](../../Dockerfile), [.dockerignore](../../.dockerignore).
- Evidências (08/10/2026): `docker compose config --quiet` passou. Docker Desktop iniciado via CLI; engine 29.3.1. `docker compose up --build -d --wait --wait-timeout 90` passou; API, web e PostgreSQL ficaram healthy. Frontend retornou HTTP 200; liveness respondeu diretamente na porta 3100 e pelo proxy web na 18080; `SELECT current_database(), 1 AS connectivity_check` retornou `rovere | 1`. `docker compose down` concluiu sem excluir o volume.
- Falhas resolvidas: engine inicialmente desligado; portas 5432, 3000 e 8080 já ocupadas. Configuradas portas próprias 15432, 3100 e 18080 sem interromper serviços existentes.
- Estado do ambiente ao encerrar: containers do Rovere parados/removidos pelo Compose; volume preservado. Docker Desktop continua ativo. Para retomar: `docker compose up -d --wait`.
- Limitação: PostgreSQL executável foi validado, mas a API ainda não possui conexão de aplicação, schema financeiro ou migrations.
- Próximo passo: RF-013, autenticação, migrações e isolamento de dados com testes em PostgreSQL real.

## [x] RF-013 — Autenticação e isolamento de dados

- Estado: concluída
- Descrição: sessão persistida, recuperação de acesso e autorização por proprietário em API/banco.
- Contexto/objetivo: requisito anterior a uploads financeiros e persistência multiusuário.
- Dependências: RF-010, RF-012 e migrations iniciais detalhadas nesta task ao iniciá-la.
- Atividades e aceite:
  - [x] Implementar autenticação/sessões e migrações com credenciais de desenvolvimento fictícias.
  - [x] Testar acesso cruzado negado, expiração, revogação e CSRF.
  - [x] Documentar setup e evidências com PostgreSQL real.
- Testes necessários: integração de banco e API; jornada de login/logout.
- Implementação: branch `feat/rf-013-authentication`; [auth](../../apps/api/src/identity/auth.ts), [guard](../../apps/api/src/identity/guard.ts), [contas](../../apps/api/src/accounts/accounts.controller.ts), [schema](../../apps/api/prisma/schema.prisma), [migração](../../apps/api/prisma/migrations/202610080001_identity/migration.sql), [frontend](../../apps/web/src/main.tsx), [integração](../../apps/api/test/identity.integration.test.ts), [E2E](../../tests/e2e/identity.spec.ts), [setup](../../README.md) e [ADR-0004](../decisions/0004-identity-persistence.md). Contrato em [identidade](../identity.md).
- Evidências (08/10/2026): `npm run check` passou: 25 documentos Markdown/7 tasks, tipos dos workspaces, 45 testes unitários, builds e smoke HTTP com 2 assets. `npm run test:integration`: 10 testes em PostgreSQL 18 real e Mailpit aprovados; cobrem email confirmado, hash, autorização, sessão inválida/expirada/revogada, persistência após reiniciar a aplicação, CSRF, callbacks externos, reset genérico/expirado/reutilizado/concorrente e rate limit mesmo com IP forjado. `npm run test:e2e`: 1 jornada Chromium aprovada, com cadastro, email, login, conta persistida, reload, logout e recuperação; screenshot móvel 390×844 inspecionado, sem overflow horizontal. `npm audit` e `npm audit --omit=dev`: zero vulnerabilidades conhecidas.
- Evidências Docker: `docker compose up --build -d --wait --wait-timeout 120` passou; db, Mailpit, API e web saudáveis; migração terminou com código 0. Reexecução não reaplicou a migração. Proxy web: `/` 200, `/api/health` 200, `/api/ready` 200, `/api/me` 401 sem sessão e `/api/auth/get-session` 200. Sem reset do banco de desenvolvimento. Serviços deixados ativos nas portas do README.
- Falhas resolvidas: geração de SQL passou a usar `--config apps/api/prisma.config.ts`; proteções de origem/CSRF explicitamente habilitadas também em ambiente de teste; descrição acessível da senha separada do label; teardown de schema E2E adaptado ao encerramento de processos no Windows; OpenSSL instalado no estágio de build/migração. Schemas das tentativas iniciais foram removidos somente de `rovere_test`. Overrides transitivos registrados no ADR.
- Limitações: contas mínimas sem saldos/cartões/movimentações. Isolamento demonstrado para os recursos atuais, sem RLS ou módulos financeiros futuros. SMTP externo, TLS público, retry durável de emails e tratamento de IP atrás de ingress ainda dependem da implantação; [detalhes](../identity.md). CI configurada para integração/E2E, resultado remoto ainda não verificado.
- Integração: usuário realizou merge pelo PR #1; conferido em `origin/main` (`c167e95`) antes de iniciar RF-015. Árvore local limpa na retomada; não foi necessário refazer testes idênticos da RF-013.
- Próximo passo: RF-014 e suas subtarefas. BIZ-03 resolvida pelo [ADR-0005](../decisions/0005-missing-statement-period.md).

## [ ] RF-014 — Primeira fatia vertical de importação CSV e OFX

- Estado: em andamento
- Descrição: upload privado, parsing, revisão persistida e confirmação com destino para arquivos fictícios dos dois formatos.
- Contexto/objetivo: reduzir cadastro manual em lote e provar a arquitetura de importação.
- Dependências: RF-013 concluída; RF-015 a RF-018 abaixo. BIZ-03 resolvida: exigir período antes de confirmar cobranças.
- Atividades e aceite:
  - [x] Detalhar esta entrega em tasks menores ao iniciá-la, preservando CSV e OFX no mesmo marco.
  - [x] Homologar CSV genérico e OFX 1.x/2.x com fixtures fictícias.
  - [ ] Confirmar lote de 500 compras com idempotência, erros e conciliação verificáveis.
  - [ ] Demonstrar isolamento, preservação de metadados e ausência de inferências silenciosas.
- Testes necessários: parsers, PostgreSQL real, API e E2E de revisão/confirmar/reimportar.
- Implementação: RF-015 possui adaptadores puros em `packages/importers` integrados pelo PR #2; RF-016 destinos; RF-017 upload/revisão; RF-018 confirmação/aceite vertical. [Catálogo RF-015](../import-formats.md).
- Evidências: ver subtarefas; não há upload ou confirmação financeira executável ainda. Parsing de 500 registros não comprova importação persistida/idempotente.
- Próximo passo: revisar/integrar RF-017 e executar RF-018, mantendo ambos os formatos no aceite vertical. RF-015/RF-016 já integradas.

## [x] RF-015 — Adaptadores genéricos CSV e OFX com proveniência

- Estado: concluída
- Descrição: interpretar CSV configurável e OFX SGML/XML, produzindo candidatos sem gravações financeiras.
- Contexto/objetivo: reduzir o risco de normalização e comprovar INV-01/INV-03 antes de persistir importações.
- Dependências: RF-011 e contratos RF-001; BIZ-03 aprovada para validar lacunas de competência.
- Atividades e aceite:
  - [x] Tratar encoding, datas, dinheiro exato e mapeamento CSV explícito.
  - [x] Extrair banco/cartão OFX 1.x/2.x e separar múltiplas contas.
  - [x] Preservar origem, identificadores, incertezas e sugestões; não criar parcelas, faturas ou totais ausentes.
  - [x] Testar 500 registros em ambos os formatos, arquivos malformados, entidades e limites computacionais.
  - [x] Validar workspaces/build/Docker e atualizar evidências antes do commit.
- Testes necessários: Vitest de parsers, fixtures sintéticas, limites e tipos; build e instalação reproduzível.
- Implementação: branch `feat/rf-015-import-parsers`; [adaptadores](../../packages/importers/src/index.ts), [normalização](../../packages/importers/src/normalize.ts), [testes](../../packages/importers/test/parsers.test.ts), [catálogo](../import-formats.md).
- Evidências (08/10/2026): `npm run check` passou (27 documentos/11 tasks e hash histórico; tipos dos quatro workspaces; 79 testes, sendo 34 específicos de parsers; builds e smoke HTTP). Casos incluem CSV/OFX com 500 registros, variantes banco/cartão SGML/XML, Windows-1252/UTF-8, descrições multilinha, limites BIGINT, parcelas explícitas/sugeridas, fatura ausente, múltiplas contas, dados inválidos, DTD/entidades, profundidade e limites de tamanho/linhas. `npm audit`: zero vulnerabilidades conhecidas. `docker compose config --quiet` e `docker compose up --build -d --wait --wait-timeout 120` passaram, incluindo `npm ci` no build limpo; quatro serviços saudáveis e migração existente finalizada sem nova aplicação. Docker Desktop estava desligado e foi iniciado pela CLI. Nenhuma migration financeira nesta subtask; banco preservado.
- Limitação: biblioteca ainda não conectada à API/UI. Compatibilidade restrita ao catálogo homologado; sem conciliação, persistência ou confirmação financeira nesta subtask.
- Revisão desta retomada (08/10/2026): código e testes inspecionados no commit `103cc00`; `npm run check` passou novamente com 79 testes, tipos, builds, smoke HTTP e 27 documentos/11 tasks. Sem defeitos relevantes encontrados. `git fetch origin` confirmou que esse commit ainda não é ancestral de `origin/main` (`c167e95`). RF-015 posteriormente integrada pelo usuário no PR #2 (`49ec1c9`); RF-016 atualizada com essa main na continuidade autorizada.
- Próximo passo: reutilizar os parsers; RF-015 integrada via PR #2 e RF-016 via PR #4.

## [x] RF-016 — Destinos mínimos de contas, crédito e faturas

- Estado: concluída
- Descrição: preparar conta de crédito, cartões e competência da fatura como destinos autorizados da importação.
- Contexto/objetivo: confirmar destino real sem deduzir vínculos a partir de números no arquivo.
- Dependências: RF-013; ADR-0005.
- Atividades e aceite:
  - [x] Detalhar schema/contratos e migrations sem conflitar `Account` de autenticação com conta financeira.
  - [x] Cadastrar/listar destinos e períodos com propriedade validada na API e nas relações SQL.
  - [x] Validar API/banco com dois usuários e UI mínima de seleção de destinos.
- Testes necessários: migrations, chaves compostas e HTTP contra PostgreSQL real; seleção no navegador.
- Implementação: branch `feat/rf-016-import-destinations`, criada de `origin/main` atualizada em `c167e95`. [Contratos](../destinations.md), [schema](../../apps/api/prisma/schema.prisma), [migration](../../apps/api/prisma/migrations/202610080002_import_destinations/migration.sql), [serviço](../../apps/api/src/credit/destinations.service.ts), [controller](../../apps/api/src/credit/credit.controller.ts), [UI](../../apps/web/src/destinations.tsx), [período](../../packages/domain/src/statement-period.ts), [integração](../../apps/api/test/destinations.integration.test.ts), [E2E](../../tests/e2e/destinations.spec.ts). Conta bancária RF-013 reutilizada; nenhum saldo/limite/total/vencimento inferido.
- Evidências (08/10/2026): `npm run check` passou: 27 documentos/11 tasks, links e hash histórico; tipos dos três workspaces; 47 testes unitários (incluindo 2 de competência); builds e smoke HTTP com 2 assets. `npm run test:integration`: 18 aprovados (10 RF-013 e 8 RF-016), com PostgreSQL real/Mailpit, dois usuários, FK composta, cadastro concorrente idempotente, validação e reexecução de migrations sem perder cadastros. `npm run test:e2e`: 2 jornadas Chromium aprovadas na versão final; seleciona conta bancária/crédito, três tipos de cartão, competência explícita, reload, troca de crédito e descarte de resposta atrasada; captura móvel 390×844 inspecionada sem overflow. `docker compose config --quiet` e `docker compose up --build -d --wait --wait-timeout 120` passaram: instalação limpa, build, quatro serviços saudáveis e segunda migration aplicada (exit 0), volume preservado. `node --env-file-if-exists=.env node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema apps/api/prisma/schema.prisma --config apps/api/prisma.config.ts --exit-code`: sem diferenças, exit 0. Proxy HTTP: `/`, `/api/health`, `/api/ready` 200; `/api/credit-accounts` 401 sem sessão. Instalações npm local e Docker reportaram zero vulnerabilidades conhecidas. `git diff --check` passou.
- Falhas resolvidas: build do domínio adicionado antes de typecheck/test/integração; imagem API inclui pacote de domínio compilado. Primeiro E2E falhou por seletores de nome de conta e combobox; ajustados para correspondência exata e papel acessível, com reexecução aprovada.
- Limitações: cadastros sem ciclo/pagamento/total de fatura ou movimentos. Seleção é local na UI; persistência de revisão depende da RF-017. RF-015 integrada pelo usuário via PR #2; esta entrega incorpora os parsers na atualização da branch.
- Atualização nesta continuidade: `origin/main` (`49ec1c9`) incorporada à branch RF-016 e validada por `npm run check` (28 documentos/11 tasks, 81 testes, tipos/builds/smoke), `npm run test:integration` (18) e `npm run test:e2e` (2). Nenhuma funcionalidade validada foi reimplementada; conflitos resolvidos preservando ambas as entregas. Revisão automática rejeitou merge/push na main por falta de autorização explícita específica; ação não executada, autorização solicitada.
- Integração concluída após autorização explícita: [PR #4](https://github.com/Gabacles/rovere-finance/pull/4) aberto e integrado em `d94332b`. CI de push e do PR aprovadas no head `5cae38c`; RF-017 criada dessa main atualizada.
- Próximo passo: pipeline RF-017/RF-018; próximas entregas em branches próprias para revisão antes de integrar.

## [x] RF-017 — Upload privado e revisão persistida dos dois formatos

- Estado: concluída
- Descrição: receber arquivos CSV/OFX, processar lote em tarefa recuperável e salvar origem/revisão versionadas.
- Contexto/objetivo: permitir corrigir e retomar centenas de linhas sem cadastro individual.
- Dependências: RF-015, RF-016; contratos de importação e limites medidos.
- Atividades e aceite:
  - [x] Implementar armazenamento privado, limites e worker com estado/tentativas persistidos.
  - [x] Persistir origem e configuração do parser, candidatos, correções e decisões por linha/em lote.
  - [x] Disponibilizar prévia paginada, mapeamento CSV, destino/período confirmados e erros claros.
  - [x] Testar isolamento de arquivos/lotes, conflitos de versão e recuperação sem sobrescrever revisão.
- Testes necessários: banco/API, autorização, retry concorrente e E2E da prévia nos dois formatos.
- Implementação: branch `feat/rf-017-import-review` criada de main `d94332b`. [Contrato](../import-review.md), [ADR-0006](../decisions/0006-private-import-review.md), [schema](../../apps/api/prisma/schema.prisma), [migration](../../apps/api/prisma/migrations/202610080003_import_review/migration.sql), [serviço](../../apps/api/src/imports/imports.service.ts), [worker](../../apps/api/src/imports/worker.ts), [correções puras](../../packages/domain/src/import-review.ts), [UI](../../apps/web/src/imports.tsx), [integração](../../apps/api/test/imports.integration.test.ts), [Chromium](../../tests/e2e/imports.spec.ts).
- Evidências (08/10/2026): `npm run check` aprovado: 30 documentos/11 tasks, links/hash histórico, tipos de 4 workspaces, 85 unitários (4 novos de correção), builds e smoke HTTP com 2 assets. `npm run test:integration`: 28 aprovados (10 RF-017), PostgreSQL/Mailpit reais; 500 registros CSV e OFX em threads, paginação, bytes/origem, dois usuários, downloads e comandos privados, limites/quota, upload idempotente, rollback, correções sem mutação, restart da API, conflito/retry concorrente, destinos/competência divergentes, recuperação de lease sem execução antiga sobrescrever correções, timeout/claims esgotados e remoção explícita. `npm run test:e2e`: 3 jornadas aprovadas, CSV de 500 linhas com paginação/correção/seleção/reload e OFX com competência; capturas móveis inspecionadas, documento sem overflow (tabela tem rolagem interna); encerramento e limpeza de schema aprovados na execução final. `docker compose config --quiet` e `docker compose up --build -d --wait --wait-timeout 120` aprovados: instalação limpa/builds, 4 serviços saudáveis, terceira migration exit 0, volume preservado. `node node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema apps/api/prisma/schema.prisma --config apps/api/prisma.config.ts --exit-code`: sem diferenças, exit 0. Proxy `/`, health e ready 200; `/api/imports` 401 sem sessão. Instalações npm reportaram zero vulnerabilidades conhecidas. `git diff --check` aprovado.
- Falhas resolvidas: unicidade composta de arquivo/lote e nested create do Prisma; geração SQL com `--config` (arquivo vazio inicial detectado antes de migrar); SQL cru e ORM agora usam mesmo search_path nos testes. UI corrigiu keys e seleção assíncrona. Teardown passou a parar worker antes de remover schema; rota test-only registrada antes do fallback Vite. Tentativa de teardown falha limpa somente em `rovere_test` após conferir servidor encerrado; reexecução final exit 0. Erros de JSON/persistência redigidos sem payload financeiro.
- Limitações: sem efeitos financeiros ou links a registros inexistentes; create/skip persistidos, link/distinctFrom ficam na RF-018. Mapeamento de revisão interpretada exige novo upload; retry de falha aceita nova configuração via API e preserva histórico. Sem perfis reutilizáveis independentes, retenção automática ou capacidade de produção comprovada; limites/remoção explícita documentados. CI remota desta nova branch ainda não verificada.
- Próximo passo: revisar/integrar RF-017 e criar RF-018 da main atualizada para confirmação atômica, conciliação e aceite vertical. RF-014 continua em andamento.

## [ ] RF-018 — Confirmação, conciliação e aceite vertical de importação

- Estado: pendente
- Descrição: confirmar registros selecionados com vínculos, rastreabilidade, atomicidade e idempotência.
- Contexto/objetivo: concluir o aceite de RF-014 para CSV e OFX em banco e navegador.
- Dependências: RF-015, RF-016, RF-017; modelo mínimo de movimentos/cobranças detalhado ao iniciar.
- Atividades e aceite:
  - [ ] Implementar criação/vínculo/ignorar, preservando decisões manuais e recusando identidades externas conflitantes.
  - [ ] Confirmar lote de 500 compras em cada formato, com destinos e competência válidos.
  - [ ] Testar rollback, duplicidade, reenvio simultâneo, perda de resposta e conflito de versão/idempotência.
  - [ ] Validar jornada upload → revisar → confirmar → reimportar e atualizar o aceite de RF-014.
- Testes necessários: transações concorrentes no PostgreSQL, API e Playwright; INV-07/08/09.
- Implementação: ainda inexistente.
- Evidências: nenhuma; não iniciada.
- Próximo passo: depois da revisão persistida, detalhar chaves externas e comandos sem antecipar regras financeiras ainda pendentes.
