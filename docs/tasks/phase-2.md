# Fase 2 — Compras e ciclo de cartão

Entrega incremental após RF-014/RF-018. Não confundir dados de fatura com pagamento, nem cobrança com compra completa. [Domínio](../domain.md), [contratos](../contracts.md) e [decisões abertas](../decisions/pending.md). Detalhar DTOs/schema de cada task ao iniciá-la.

## [x] RF-020 — Dados explícitos e ciclo informado da fatura

- Estado: concluída
- Descrição: acrescentar fechamento, vencimento, total declarado e ciclo conhecido/desconhecido, com edição versionada e histórico.
- Contexto/objetivo: preparar o ciclo de cartão preservando lacunas e a competência já confirmada; independente de BIZ-02.
- Dependências: RF-016/RF-018 integradas; ADR-0005 e estados dos contratos.
- Atividades e aceite:
  - [x] Preservar desconhecimento das faturas existentes sem presumir datas, total zero ou ciclo aberto.
  - [x] Implementar domínio puro, migration, leitura/edição autorizadas e histórico atômico com expectedVersion.
  - [x] Disponibilizar formulário mínimo, reabertura e conflitos sem alterar competência, cobranças ou pagamento.
  - [x] Validar banco/API entre usuários, concorrência, dinheiro/datas e Chromium; registrar evidências.
- Testes necessários: unitários de conhecimento/validação, PostgreSQL real para propriedade/rollback/versões e E2E de edição/reload.
- Implementação: branch `feat/rf-020-statement-facts`, base main `d3831c8`. [Contrato](../card-statements.md), [ADR-0008](../decisions/0008-explicit-statement-facts.md), [domínio puro](../../packages/domain/src/statement-facts.ts), [serviço](../../apps/api/src/credit/statements.service.ts), [controller](../../apps/api/src/credit/statements.controller.ts), [migration](../../apps/api/prisma/migrations/202610090002_statement_facts/migration.sql), [UI](../../apps/web/src/statement-facts.tsx), [integração](../../apps/api/test/statement-facts.integration.test.ts), [Chromium](../../tests/e2e/statement-facts.spec.ts). Listas/cadastro de competência RF-016 preservam contrato mínimo anterior.
- Evidências (09/10/2026): `npm run check`: 35 documentos/17 tasks, links/hash histórico, tipos de quatro workspaces, 93 unitários (5 novos), builds e smoke HTTP aprovados. `npm run test:integration`: 49 aprovados (8 RF-020) com PostgreSQL/Mailpit, desconhecimento versus zero, datas independentes da competência, histórico imutável, concorrência/versionamento, isolamento por usuário/crédito, entradas inválidas, rollback de fatos se histórico falha, restart, limpeza explícita de afirmação e importação histórica sem reabrir ciclo/presumir pagamento. `npm run test:e2e`: 6 jornadas aprovadas; formulário, zero informado, ciclo fechado, reload, edição concorrente, recarregar sem perder dados já salvos, limpeza para unknown e histórico; jornadas CSV/OFX de 500 registros mantidas. Captura móvel inspecionada, sem overflow do documento. `docker compose config --quiet` e `docker compose up --build -d --wait --wait-timeout 120`: quatro serviços saudáveis, quinta migration exit 0, volume preservado; camadas npm ci anteriores reutilizadas. `node node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema apps/api/prisma/schema.prisma --config apps/api/prisma.config.ts --exit-code`: sem diferenças, exit 0. Proxy `/`, health/ready 200; fatura sem sessão 401. `git diff --check` aprovado.
- Falhas/ajustes resolvidos: união de tipos do campo data/ciclo no frontend corrigida após TS2345. E2E compartilha peer loopback e acionou 429 na sexta jornada; contador de auth agora isolado por teste somente no schema verificado `rovere_test`, sem alterar proteção da aplicação, que permanece coberta pela integração. Execução seguinte revelou 409 real da importação entre salvar e recarregar versão: mutações agora aguardam o snapshot atualizado; reexecução final das seis jornadas aprovada. Parser de entrada monetária compartilhado com importação sem mudar sua lógica.
- Limitações: somente fatos manuais; sem total calculado, natureza financeira de linhas, plano, saldo/limite, pagamento/atraso, rotativo ou estimativa de datas. Fatura fechada não trava importação histórica. Histórico privado retorna vinte alterações recentes; snapshots completos permanecem no banco. CI remota da branch ainda não verificada.
- Próximo passo: revisar/integrar RF-020 e iniciar RF-021 a partir da main atualizada. BIZ-02/BIZ-04/BIZ-05 continuam abertas conforme pending; nenhuma regra dependente implementada.

## [ ] RF-021 — Compra manual e associação de cobranças conhecidas

- Estado: pendente
- Descrição: registrar Expense com dados conhecidos e ligar cobranças próprias, mantendo compra parcial quando necessário.
- Contexto/objetivo: diferenciar fato econômico, data original e cobranças; evitar dupla contagem e multiplicação de parcela para inventar total.
- Dependências: RF-018/RF-020; detalhar contrato da compra ao iniciar.
- Atividades e aceite:
  - [ ] Definir compra completa/parcial e referências tipadas de cobranças, sem duplicar registros importados.
  - [ ] Implementar cadastro/associação explícitos, autorização, idempotência e controle de versão.
  - [ ] Demonstrar compra manual depois vinculada à importação, preservando correções e incerteza.
- Testes necessários: domínio, banco/API e jornada manual/importada; unicidade e rollback de associações.
- Implementação: ainda inexistente.
- Evidências: nenhuma; não iniciada.
- Próximo passo: após RF-020 integrada, detalhar contratos e natureza financeira explicitamente confirmada.

## [ ] RF-022 — Plano confirmado de parcelas e conciliação de previsões

- Estado: pendente
- Descrição: distribuir total/quantidade confirmados e conservar previsões separadas das cobranças efetivas.
- Contexto/objetivo: usar primitivas exatas existentes e conciliar novas importações sem criar parcelas ausentes silenciosamente.
- Dependências: RF-021; calendário e primeira competência explicitamente confirmados.
- Atividades e aceite:
  - [ ] Definir plano, distribuição e unicidade da parcela, sem substituir valores efetivos conhecidos.
  - [ ] Gerar previsões rastreáveis após confirmação explícita de total, quantidade e calendário.
  - [ ] Vincular previsões e cobranças importadas, cobrindo centavos indivisíveis e conhecimento parcial.
- Testes necessários: INV-02, datas/competências, PostgreSQL concorrente e E2E de plano/conciliação.
- Implementação: ainda inexistente; primitivas de dinheiro/datas RF-011 disponíveis.
- Evidências: nenhuma; não iniciada.
- Próximo passo: detalhar estados e conflitos do plano ao iniciar, sem reimplementar primitivas validadas.

## [ ] RF-023 — Natureza das linhas e consultas do ciclo da fatura

- Estado: pendente
- Descrição: confirmar natureza financeira das linhas e consultar total calculado separado do declarado, com diferenças para revisão.
- Contexto/objetivo: não classificar consumo/pagamento/estorno por descrição ou sinal; preparar obrigação consultável sem ajuste artificial.
- Dependências: RF-020/RF-021; natureza e convenções de cálculo detalhadas antes do comportamento dependente.
- Atividades e aceite:
  - [ ] Definir classificação explícita, total declarado/calculado e efeitos de cada natureza.
  - [ ] Implementar consultas e revisão de diferenças sem gerar lançamentos para fazer bater.
  - [ ] Demonstrar competências independentes do caixa e ausência de dupla contagem.
- Testes necessários: domínio, banco/API, consultas e INV-04/INV-12 nos conceitos já implementados.
- Implementação: ainda inexistente; fatos informados da fatura serão entregues na RF-020.
- Evidências: nenhuma; não iniciada.
- Próximo passo: apresentar recomendações para qualquer regra financeira ainda não definida antes de implementá-la.

## [ ] RF-024 — Pagamentos de fatura e alocações de caixa

- Estado: pendente
- Descrição: vincular saídas bancárias próprias a faturas, com pagamentos parciais e limites de alocação revalidados na transação.
- Contexto/objetivo: reduzir obrigação sem criar outra despesa de consumo; impedir utilização duplicada do mesmo dinheiro.
- Dependências: RF-023; fluxo básico não inclui rotativo/renegociação (BIZ-02 ainda aberta).
- Atividades e aceite:
  - [ ] Detalhar alocações tipadas, valor disponível e saldo conhecido da obrigação.
  - [ ] Implementar pagamento parcial/integral, idempotência e controle concorrente em PostgreSQL.
  - [ ] Validar caixa versus consumo, duas faturas por movimento e isolamento entre usuários.
- Testes necessários: INV-04/INV-06/INV-08/INV-12 e jornada de pagamento/reenvio.
- Implementação: ainda inexistente.
- Evidências: nenhuma; não iniciada.
- Próximo passo: confirmar regras de alocação; financiamento/encargos dependem da resolução de BIZ-02.

## [ ] RF-025 — Ajustes, estornos e aceite vertical do ciclo de cartão

- Estado: pendente
- Descrição: tratar ajustes/reversões informados com dependências rastreáveis e validar a entrega 2 integrada.
- Contexto/objetivo: conservar origem e correções, sem apagar fatos confirmados ou ajustar terceiros silenciosamente.
- Dependências: RF-021 a RF-024; BIZ-02 para financiamento, BIZ-05 para excedente de reembolso quando esse módulo existir.
- Atividades e aceite:
  - [ ] Detalhar ajustes/estornos/reversões e revalidação de pagamentos/associações existentes.
  - [ ] Implementar comandos explícitos, auditoria, idempotência e recuperação de conflitos.
  - [ ] Validar compra → parcelas → importação → fatura → pagamento → estorno, sem declarar toda a V1 concluída.
- Testes necessários: domínio, transações concorrentes, API e Chromium dos dois formatos.
- Implementação: ainda inexistente.
- Evidências: nenhuma; não iniciada.
- Próximo passo: detalhar apenas quando as dependências se aproximarem; manter limites de decisões abertas.
