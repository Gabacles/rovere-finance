# Fase 3 — Planejamento e terceiros

Planejamento registrado em 14/10/2026 e preservado na entrega RF-027. Receitas previstas avulsas implementadas e validadas dentro desta única fatia. RF-028 a RF-036 permanecem propostas pendentes, a refinar imediatamente antes de começar, sem ampliar esta branch para toda a fase.

## Base conferida e limites

- RF-026 integrada pelo [PR #13](https://github.com/Gabacles/rovere-finance/pull/13) na main `a5b0b62`. Head final `1de60af`, implementação `224c81a`; a comparação de código entre implementação e merge não encontrou diferenças. CI do head e do merge aprovadas; evidências na [fase 2](phase-2.md).
- Há [dinheiro exato](../../packages/domain/src/money.ts), [calendário ancorado](../../packages/domain/src/civil-date.ts), compras, planos, faturas, ajustes, estornos e pagamentos. Na inspeção inicial da main, [schema](../../apps/api/prisma/schema.prisma) e [controllers](../../apps/api/src/app.ts) não implementavam receitas. RF-027 acrescenta Income/IncomeCommand manuais; RecurrenceRule, ScheduledOccurrence, Counterparty, Receivable, Payable e suas liquidações permanecem futuros. Testes de datas não comprovam um módulo de recorrências persistido.
- A [disponibilidade atual](../../apps/api/src/credit/payment-projection.ts) soma somente alocações de fatura. Novos destinos exigem disponibilidade conjunta, direção explicitamente confirmada e a mesma disciplina transacional por proprietário. Não bastará reutilizar a fórmula em consultas isoladas por módulo.
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
| P3-01 — geração | Iniciar com cadência mensal, valor fixo explicitamente informado e uma âncora por regra. Salário dias 15/30 usa duas regras. Gerar somente intervalo finito explicitamente solicitado, com prévia; regra sem fim não materializa futuro infinito. Unicidade por regra/período, sem job externo ou crédito automático. | RF-029; confirmar também início/fim inclusivos e o limite operacional de geração, que será técnico e medido. |
| P3-02 — alterações | Separar correção de ocorrência e alteração futura da regra. Prévia do conjunto afetado; pausa não apaga ocorrências e retomada não recompõe meses silenciosamente. Cancelamento preserva histórico; ocorrência com vínculo/liquidação exige revisão, nunca apagamento. Preservar versões e não gerar segunda ocorrência do mesmo período após editar a regra. | RF-030, antes de habilitar alterações em série. |
| P3-03 — diferenças de receita | Permitir recebimento parcial e múltiplos movimentos. Valor acima do previsto exige revisão explícita do valor esperado ou outro destino confirmado; excedente fica não alocado. Valor abaixo do previsto não quita automaticamente o restante. Não classificar Pix, transferência própria ou reembolso como salário por descrição/sinal. | RF-028; confirmar a regra de diferença, sem inferir tributo, tarifa ou baixa. |
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
- Próximo passo/limitação: enviar a branch para revisão e conferir CI antes de integração autorizada; não fazer merge/push direto na main. Após integração, detalhar RF-028 e decidir P3-03. Sem recorrência, liquidação, associação de importação, classificação automática, categorias/orçamento ou alteração do ciclo de cartão. Histórico HTTP limitado às últimas 20 versões; journal completo persistido. Tentativa incerta preservada enquanto a UI estiver montada, sem rascunho financeiro em armazenamento do browser após reload. Produção/TLS e CI remota desta entrega ainda não validados.

## [ ] RF-028 — Liquidações de receitas e disponibilidade bancária conjunta

- Estado: pendente
- Descrição: vincular entradas bancárias confirmadas às receitas, com parcial/total e reversão de vínculo.
- Contexto/objetivo: importar salário sem criar outra receita nem usar dinheiro reservado por outro módulo.
- Dependências: RF-027, RF-024/RF-025; resolver P3-03 antes do comportamento de diferenças.
- Atividades e aceite:
  - [ ] Alocações tipadas, limite na origem/destino e direção confirmada; consulta e escrita de todos os módulos consumidores consideram as mesmas reservas ativas. Preservar as alocações de fatura existentes e impedir confirmar o mesmo movimento simultaneamente como entrada e saída incompatíveis.
  - [ ] Receita/valor desconhecido ou cancelada não admite liquidação; correção abaixo do já recebido exige revisão explícita sem apagar recebimento. Reversão de vínculo preserva movimento e libera apenas sua reserva, sem criar estorno de caixa.
  - [ ] UI/API/OpenAPI mostram previsto, recebido, pendente e diferenças; seleção manual de movimentos CSV/OFX confirmados, sem nova receita automática. Relações SQL tipadas, sem tabela financeira genérica `tipo + id`.
- Testes necessários: parcial, múltiplos movimentos/destinos, excedente, direção incompatível, corrida pelo mesmo dinheiro inclusive com fatura, limites/overflow, isolamento, rollback/replay/reversão, contratos e jornada com CSV e OFX.
- Implementação: não iniciada; estender a disciplina de [pagamentos](../statement-payments.md), não duplicar disponibilidade por módulo.
- Evidências: somente plano; nenhum teste desta task executado.
- Próximo passo/limitação: detalhar após RF-027; sem baixa automática, tributo presumido ou geração de caixa manual.

## [ ] RF-029 — Receitas recorrentes mensais

- Estado: pendente
- Descrição: criar regra mensal e materializar previsões únicas em intervalo confirmado.
- Contexto/objetivo: salário nos dias 15 e 30 como previsões independentes, posteriormente liquidáveis por RF-028.
- Dependências: RF-027 e decisão P3-01.
- Atividades e aceite:
  - [ ] Prévia, geração limitada e confirmada, unicidade regra/período e vínculo tipado ocorrência/receita; reexecução/concorrência não duplicam previsões, mesmo quando duas regras caem na mesma data de fevereiro.
  - [ ] Âncora preservada, início/fim explícitos e origem da regra registrada; nenhuma geração de caixa/fatura. UI/API/OpenAPI permitem conferir as ocorrências.
- Testes necessários: dias 15/30/31, fevereiro bissexto/não bissexto e março, limites de ano/intervalo, duas regras distintas, replay/concorrência/rollback, autorização e jornada de geração.
- Implementação: não iniciada; reutilizar [occurrenceInMonth](../../packages/domain/src/civil-date.ts), sem reimplementar o calendário validado.
- Evidências: somente plano; testes existentes de calendário não validam esta task.
- Próximo passo/limitação: detalhar após RF-027; sem valor variável inferido, cadências avançadas ou mutações de série até RF-030.

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
