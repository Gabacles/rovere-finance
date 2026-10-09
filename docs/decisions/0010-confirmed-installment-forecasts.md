# ADR-0010 — Previsões mensais separadas das cobranças efetivas

- Estado: aceita na continuidade autorizada em 09/10/2026.
- Contexto: RF-022 deve distribuir total confirmado e conciliar importações sem criar cobranças ausentes ou duplicar realizado e previsto.
- Decisão: plano mensal explícito e imutável na v0, distribuição exata existente, previsões separadas e conciliação manual tipada/versionada, com valores efetivos preservados. [Contrato canônico](../installment-plans.md).
- Consequências: diferenças não mudam plano ou origem; mudanças de total e desfazimento de vínculos com dependências exigem comando explícito. Substituição/cancelamento do plano fica para evolução, sem antecipar pagamentos ou natureza financeira.
