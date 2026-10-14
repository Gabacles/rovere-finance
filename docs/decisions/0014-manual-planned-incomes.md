# ADR-0014 — Receitas previstas manuais sem efeito de caixa

- Estado: aceita no escopo RF-027 autorizado em 14/10/2026.
- Contexto: prever receita avulsa requer conhecimento parcial, correções e cancelamento sem comprovar recebimento nem antecipar decisões de recorrência/liquidação.
- Decisão: agregado Income próprio, fatos/evidências manuais, cancelamento terminal, journal imutável e comandos versionados/idempotentes sob trava por proprietário. [Contrato canônico](../planned-incomes.md).
- Consequências: previsão não altera caixa; desconhecido difere de zero. Migration é aditiva e histórico recupera respostas originais. RF-028/RF-029 exigirão guardas de dependências antes de habilitar vínculos; P3-01 a P3-07 não são aprovadas por esta decisão.
