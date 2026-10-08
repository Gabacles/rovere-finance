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
- Implementação: [frontend](../../apps/web/src/main.tsx), [API](../../apps/api/src/app.ts), [manifests](../../package.json), [CI](../../.github/workflows/ci.yml), [README](../../README.md), [teste HTTP](../../apps/api/test/health.test.ts) e [smoke web](../../scripts/smoke-web.mjs).
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

## [ ] RF-013 — Autenticação e isolamento de dados

- Estado: pendente
- Descrição: sessão persistida, recuperação de acesso e autorização por proprietário em API/banco.
- Contexto/objetivo: requisito anterior a uploads financeiros e persistência multiusuário.
- Dependências: RF-010, RF-012 e migrations iniciais detalhadas nesta task ao iniciá-la.
- Atividades e aceite:
  - [ ] Implementar autenticação/sessões e migrações com credenciais de desenvolvimento fictícias.
  - [ ] Testar acesso cruzado negado, expiração, revogação e CSRF.
  - [ ] Documentar setup e evidências com PostgreSQL real.
- Testes necessários: integração de banco e API; jornada de login/logout.
- Implementação: ainda inexistente.
- Evidências: nenhuma; não iniciada.
- Próximo passo: detalhar os contratos de identidade e o schema inicial quando a base estiver validada.

## [ ] RF-014 — Primeira fatia vertical de importação CSV e OFX

- Estado: pendente
- Descrição: upload privado, parsing, revisão persistida e confirmação com destino para arquivos fictícios dos dois formatos.
- Contexto/objetivo: reduzir cadastro manual em lote e provar a arquitetura de importação.
- Dependências: RF-013; contas/cartões mínimos; resolver BIZ-03 para o caso de fatura ausente.
- Atividades e aceite:
  - [ ] Detalhar esta entrega em tasks menores ao iniciá-la, preservando CSV e OFX no mesmo marco.
  - [ ] Homologar CSV genérico e OFX 1.x/2.x com fixtures fictícias.
  - [ ] Confirmar lote de 500 compras com idempotência, erros e conciliação verificáveis.
  - [ ] Demonstrar isolamento, preservação de metadados e ausência de inferências silenciosas.
- Testes necessários: parsers, PostgreSQL real, API e E2E de revisão/confirmar/reimportar.
- Implementação: ainda inexistente.
- Evidências: nenhuma; não iniciada.
- Próximo passo: após autenticação e destinos, decompor por contratos e testes da [matriz](../quality.md).
