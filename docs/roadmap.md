# Roadmap

> Arquitetura geral aprovada em 08/10/2026. Este documento define o destino planejado; consulte [progresso](progress.md) e [tasks](tasks/README.md) para saber o que está implementado.

| Entrega | Resultado revisável |
|---|---|
| **0 — Decisões e contratos** | Regras financeiras aprovadas, modelo, fluxos, matriz de formatos e ADRs iniciais |
| **1 — Fundação e importação completa** | Autenticação, contas/cartões mínimos, CSV e OFX, revisão, persistência e idempotência |
| **2 — Ciclo de cartão** | Compras manuais e importadas, parcelas, faturas, pagamentos, ajustes e estornos |
| **3 — Planejamento e terceiros** | Recorrências, receitas, reembolsos, compromissos e conciliação de liquidações |
| **4 — Orçamento e visão anual** | Categorias, metas, projeções e consultas consolidadas |
| **5 — Preparação da V1** | Segurança, acessibilidade, desempenho, backup, documentação e demonstração |
| **Após V1** | Prova de conceito e eventual contratação de Open Finance |

CSV e OFX serão critérios de conclusão da entrega 1 e do lançamento da V1. Os vínculos mais avançados serão incorporados nas entregas seguintes, sem substituir o mecanismo de importação.

A documentação prevista inclui README com execução local, diagramas de componentes e dados, OpenAPI, catálogo de formatos suportados, exemplos fictícios, regras financeiras, estratégia de testes e ADRs. A demonstração pública deverá apresentar apenas dados fictícios.

## Execução incremental

O roadmap é macro. Detalhar apenas a fase atual e a próxima entrega próxima. Os estados e checklists individuais são mantidos exclusivamente em [tasks](tasks/README.md). O ponto de retomada é [progress.md](progress.md).

- [Fase 0 — decisões, contratos e contexto](tasks/phase-0.md)
- [Fase 1 — fundação e primeira importação](tasks/phase-1.md)
- [Fase 2 — compras e ciclo de cartão](tasks/phase-2.md)
- [Fase 3 — planejamento e terceiros](tasks/phase-3.md)

RF-026 (OpenAPI/Swagger) foi solicitada para depois do ciclo de cartão e antes da fase 3; critérios na fase 2. [Documentação da API](api-documentation.md) descreve acesso, contratos e manutenção incremental.

A fase 3 tem RF-027 a RF-029 integradas; PR #16 conferido na main `9fb9de3`, com CI aprovada. RF-030 concluída/validada no PR #17, aguardando revisão; RF-031 a RF-036 continuam propostas, a refinar imediatamente antes da execução; decisões dependentes permanecem pendentes, exceto P3-01/P3-02/P3-03 aprovadas. Fases 4/5 serão decompostas ao se aproximarem. Não marcar fases inteiras como prontas por existir scaffolding.

A [revisão da V1 de 15/10/2026](v1-review.md) relaciona escopo, código e telas. Lançamentos bancários manuais, transferências próprias, saldos de referência/limites e calendário/estimativas ainda exigem entregas concretas; não estão implicitamente concluídos por RF-036 ou pelas fases 4/5. A navegação e a visão consolidada também permanecem pendentes. Após avaliação, RF-030 foi implementada e aguarda revisão; reformulação visual/navegação permanece obrigatória para o aceite da V1 conforme [UX](ux.md).
