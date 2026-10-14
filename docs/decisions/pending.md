# Decisões de negócio pendentes

Não há questões BIZ ativas que bloqueiem a v0 dentro dos limites adotados. BIZ-02/BIZ-04/BIZ-05 foram resolvidas em 09/10/2026 por delegação do usuário: [políticas canônicas](../v0-policies.md) e [ADR-0009](0009-v0-business-policies.md). Recursos além desses limites exigirão decisões futuras.

Em 14/10/2026, o [plano da fase 3](../tasks/phase-3.md#recomendações-para-decisões-ainda-abertas) registra propostas P3-01 a P3-07: geração e alterações de recorrências, diferenças de receitas, confirmação de despesas recorrentes, cronogramas de terceiros, revisão/devolução após estorno e sugestões de conciliação. Não são políticas aprovadas nem reabrem BIZ-01 a BIZ-05. Não bloqueiam RF-027; devem ser resolvidas antes de implementar os comportamentos dependentes indicados no plano. Ao decidir, atualizar a fonte canônica aplicável e registrar ADR quando relevante.

P3-03 resolvida por aprovação explícita do usuário em 14/10/2026: [liquidações de receitas](../income-settlements.md) e [ADR-0015](0015-explicit-income-settlements.md). Sai da lista ativa; somente P3-01/P3-02/P3-04 a P3-07 permanecem pendentes. Não repetir a aprovação.

BIZ-01 foi resolvida pela escolha de orçamento bruto registrada no ADR-0002: recebimentos aparecem no caixa/custo líquido, sem recompor o orçamento bruto. O ID não será reutilizado.

BIZ-03 resolvida em 08/10/2026: exigir competência confirmada antes de gravar cobranças; manter incompletas na revisão. [ADR-0005](0005-missing-statement-period.md).

Limites de 10 MB/10 mil linhas e retenção de 30 dias são propostas técnicas, ainda sujeitas a medição e política de privacidade. Não apresentá-los como capacidade testada ou obrigação legal.

Guardas computacionais dos parsers RF-015: [catálogo](../import-formats.md). Não definem retenção ou desempenho do pipeline persistido.

Quando resolvida, mover a decisão para seu documento canônico e registrar a aprovação/ADR, removendo-a desta lista ativa. Não repetir perguntas já respondidas.
