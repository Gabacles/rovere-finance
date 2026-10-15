# Revisão da V1 — 15/10/2026

Ponto de controle solicitado pelo usuário antes de continuar o desenvolvimento. Base: main `9fb9de3`, merge do [PR #16](https://github.com/Gabacles/rovere-finance/pull/16). Comparação com o head validado `c24738c` sem diferenças em apps/packages/scripts/tests/CI/manifests/OpenAPI. Esta revisão não implementa RF-030 nem altera políticas ou escopo.

## Leitura do estado atual

Já existe uma aplicação funcional com interface, API e persistência, adequada a testes dos fluxos implementados com dados fictícios. A V1 completa ainda não foi entregue. O avanço está concentrado na integridade financeira, importação, ciclo de cartão e início de receitas/recorrências; a experiência integrada e os principais relatórios ainda faltam.

As [tasks](tasks/README.md) registram 21 entregas concluídas entre 28 detalhadas: fases 0/1/2 e RF-027 a RF-029. RF-014 é uma entrega agregadora de importação e suas subtarefas também estão nessa contagem. Isso não representa percentual da V1: tarefas têm tamanhos distintos, há sobreposição de contagem e fases 4/5 ainda são macro. Na fase 3, três das dez tasks estão concluídas.

## Requisitos versus implementação

Estados desta matriz descrevem cobertura de requisitos, não substituem os estados/evidências das tasks. Fontes de escopo: [escopo aprovado](scope.md), [domínio](domain.md), [experiência planejada](ux.md) e [roadmap](roadmap.md).

| Requisito da V1 | O que existe | O que falta |
|---|---|---|
| Acesso e isolamento | Cadastro, confirmação por email, login/logout, recuperação de senha, sessões e autorização por proprietário | Homologação operacional final, acessibilidade e revisão de segurança da V1 |
| Contas e cartões | Cadastros mínimos; cartões físicos/virtuais/adicionais compartilham crédito/fatura; consulta dos movimentos importados | Saldo de referência e calculado de conta, limite informado/estimado de cartão e experiência completa de gestão |
| Lançamentos manuais | Compra econômica manual, previsão avulsa de receita e ajustes efetivos informados de cartão | Entrada/saída bancária manual de uso geral e sua relação explícita com receita/despesa/caixa; previsão não substitui dinheiro recebido |
| CSV e OFX | Upload privado, parsing, revisão, correções, confirmação em lote, prevenção de duplicatas e rastreabilidade; jornadas com 500 cobranças por formato | Homologar layouts específicos quando houver exemplos autorizados; não há promessa de suporte universal a todos os bancos |
| Compra, parcelas e fatura | Compra parcial/completa, plano exato de parcelas, vínculo com cobranças, fatos/cobertura de fatura e total calculado condicionado a dados confirmados | Regras de calendário/estimativa de competência e funcionalidades de limite/saldo ainda não entregues; vínculos continuam explícitos |
| Pagamento e estorno | Pagamento parcial/múltiplo por movimento bancário existente, reservas conjuntas, reversão de vínculo, ajuste/estorno de cartão e histórico | Não há financiamento automático, que está fora dos limites aprovados da v0; estorno de cartão não equivale a reembolso de terceiro |
| Receitas e recorrências | Previsão avulsa, recebimento por movimento CSV/OFX e regras mensais fixas com prévia/confirmação, até 120 meses | RF-030: editar, pausar, retomar/cancelar série e corrigir ocorrência; RF-031: despesas/assinaturas recorrentes |
| Terceiros, reembolsos e compromissos | Custo elegível da compra e primitivas de alocação como base técnica | RF-032 a RF-035: cadastro privado, valores a receber/pagar, calendários independentes, liquidações e revisão após estorno |
| Conciliação assistida | Decisões explícitas de duplicidade/importação, associação de cobranças e seleção manual de movimentos para pagamentos/recebimentos | RF-036: candidatos e jornada integrada de liquidações de receitas/terceiros; não há baixa automática |
| Transferências próprias | Movimentos podem ser importados; isso não comprova vínculo de transferência | Relacionar as duas pontas e distingui-las de receita/despesa, inclusive alocação para investimento próprio |
| Categorias, orçamento e visão anual | Ainda não há módulo de produto | Fase 4: categorias, metas/orçamento, consultas consolidadas, projeções, dashboard e prevenção de dupla contagem nos indicadores |
| Experiência e preparação de lançamento | Formulários funcionais, paginação/histórico e jornadas de teclado/mobile; Docker e CI | Navegação principal, lista central unificada, ação Nova movimentação, organização visual, revisão ampla de acessibilidade/desempenho, backup/restauração, operação e demonstração da V1 |

## Telas que podem ser testadas agora

Ambiente Docker local conferido nesta revisão: [aplicação](http://127.0.0.1:18080), [emails fictícios no Mailpit](http://127.0.0.1:18025), [Swagger](http://127.0.0.1:18080/api/docs). HTTP HTML/ready/OpenAPI retornou 200 e db/API/web estão saudáveis. Não é evidência de implantação pública.

O percurso inicial é criar conta, confirmar email no Mailpit, entrar e cadastrar os destinos. Existem blocos Suas contas, Crédito e cartões, Destino para importar, Importar e revisar, Compras, Recorrências de receitas e Receitas previstas. Os detalhes de fatura, parcelas, pagamentos e recebimentos aparecem conforme a seleção de registros/destinos.

A interface atual reúne módulos em uma única página, sem a navegação por áreas prevista em UX. Inspeção Chromium com conta fictícia nova: sete títulos principais, página de 6.427 px para viewport 1280×900, sem estouro horizontal ou erros JavaScript. Capturas locais em test-results/v1-review-login.png e test-results/v1-review-authenticated.png, ignoradas pelo Git. Foi criado somente usuário fictício, com confirmação/login/logout; nenhum registro financeiro. Os fluxos financeiros completos têm as evidências E2E da entrega RF-029.

Roteiro sugerido de avaliação: importar banco/cartão fictícios; revisar e confirmar; abrir compra/fatura; conferir plano, pagamento e estorno; cadastrar previsão avulsa e regra mensal; gerar e consultar ocorrências; vincular recebimento existente. Anotar dificuldade de navegação, excesso de confirmações, nomes confusos e ausência de informação. Não usar a ausência de dashboard para concluir que os dados não foram persistidos.

## Aderência ao pedido e pontos de atenção

Não foi identificada, nos módulos, rotas, schema e dependências inspecionados, funcionalidade de produto alheia ao escopo aprovado. Importações, cartão, receitas e recorrências têm vínculo com requisitos registrados. OpenAPI foi solicitado expressamente; precisão monetária, autorização, transações, versões, idempotência, histórico e testes são escolhas técnicas de sustentação desses fluxos. Quantidade de código ou de operações HTTP não mede produto entregue: as 101 operações incluem rotas de identidade da biblioteca, algumas sem funcionalidade de produto configurada.

Permanecem fora desta entrega Open Finance, IA, OCR/PDF, microsserviços, compartilhamento familiar, app nativo e provedor financeiro contratado. Regras de geração P3-01 e diferenças de receita P3-03 foram aprovadas; P3-02/P3-04 a P3-07 continuam sem implementação dependente. Esta conferência é de rastreabilidade e estado, não uma auditoria formal de todas as linhas de código ou da segurança em produção.

Há quatro diferenças relevantes entre o plano e a experiência real:

1. **Cobertura do plano:** movimentos bancários manuais, transferências, saldos de referência/limites e calendário/estimativas precisam de entregas concretas ligadas ao aceite. RF-036 e fases 4/5 não os entregam implicitamente. São requisitos pendentes ou aspectos planejados a detalhar, não novos recursos aprovados por esta revisão.
2. **Produto:** a interface funciona, mas é uma montagem incremental de formulários. A navegação Visão geral/Movimentações/Contas e cartões/A receber e a pagar/Orçamento/Importações ainda é intenção. Há risco de acumular módulos antes de validar a usabilidade integrada.
3. **Implementação técnica:** React/Vite/NestJS/Prisma/PostgreSQL estão presentes. TanStack Query, React Hook Form, Zod, Radix/shadcn e cliente gerado citados como propostas não foram adotados no frontend; hoje há fetch, estado React e controles HTML/CSS. Não são novas funcionalidades obrigatórias nem motivo para instalar bibliotecas sem benefício demonstrado. A invalidação/cache e os formulários precisam de revisão conforme a interface cresce.
4. **Preparação operacional:** a CI atual cobre documentação, tipos, testes, builds, Compose, integração e E2E. Etapas dedicadas de lint/formatação, análise de dependências/segredos e homologação de backup/restauração descritas na estratégia de qualidade não constam como verificações automatizadas independentes. HTTP local e merge em main não demonstram publicação, HTTPS, SMTP real ou prontidão de produção.

Também havia registros desatualizados: RF-029 ainda aparecia aguardando revisão/CI, e README/domínio ainda diziam que recorrências eram futuras. Esta revisão os corrige, sem reabrir tarefas validadas ou modificar o histórico original.

## Evidências e próxima ação

- Git: fetch confirmou main `9fb9de3`; comparação com `c24738c` sem mudanças de código/contrato. GitHub confirmou PR #16 merged:true.
- [CI do head final aprovada](https://github.com/Gabacles/rovere-finance/actions/runs/38801137262/job/116650159190) e [CI do merge aprovada](https://github.com/Gabacles/rovere-finance/actions/runs/38805382190/job/116664764032), consultadas nesta revisão.
- Resultados locais da implementação `fc38e03`, preservados na [RF-029](tasks/phase-3.md): 194 unitários/18 suites, 146 testes de integração/17 suites, 15 jornadas E2E, build/OpenAPI/smoke e Docker aprovados. Não foram reexecutados nesta revisão documental; o código foi comparado e a CI do merge foi conferida.
- Nesta revisão foram executados Docker ps, HTTP de disponibilidade, inspeção autenticada Chromium e conferência das fontes/código/testes/CI. `npm run docs:check` aprovado (55 documentos/28 tasks, links e hash histórico); `git diff --check` aprovado e código/contrato sem alterações em relação à main. Nenhum novo resultado financeiro é presumido.

Recomendação: fazer agora uma rodada guiada de avaliação das telas existentes e transformar os pontos de cobertura acima em um mapa de entregas para fechar a V1. Depois, continuar a sequência RF-030 a RF-036, decidir as políticas dependentes e detalhar fases 4/5 com vínculo aos requisitos ainda não cobertos. Não substituir essa análise por percentual arbitrário, nova stack ou ampliação automática do escopo. Próxima ação imediata: usuário avaliar este diagnóstico e o fluxo local antes de retomar implementação.

Continuidade após este diagnóstico: o usuário testou e rejeitou a apresentação/usabilidade atual como V1; autorizou continuar as tasks funcionais e aprovou P3-02. O [aceite de UX](ux.md) exige reformulação visual/navegação e campos orientados antes da V1. Esta matriz conserva o retrato da main 9fb9de3; o estado posterior RF-030 está na [task](tasks/phase-3.md) e no [progresso](progress.md).
