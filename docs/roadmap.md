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

As fases seguintes serão decompostas ao se aproximarem. Não marcar fases inteiras como prontas por existir scaffolding.
