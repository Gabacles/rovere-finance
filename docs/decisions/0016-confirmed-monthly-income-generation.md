# ADR-0016 — Geração mensal confirmada de receitas

- Estado: aceita por aprovação explícita P3-01 em 15/10/2026.
- Contexto: RF-029 precisa materializar previsões sem futuro infinito, duplicação por retry/concorrência ou alteração de caixa.
- Decisão: regras mensais fixas com âncora, vigência inclusiva, prévia e geração limitada/confirmada; vínculo tipado e unicidade regra/período. [Contrato canônico](../recurring-incomes.md).
- Consequências: datas curtas preservam âncora; duas regras continuam distintas; histórico e journals são atômicos. Limite inicial de 120 meses é técnico e medido, sem promessa de produção. Mutações de série/ocorrência dependentes de P3-02 ficam na RF-030; nenhuma nova política de recebimentos ou orçamento.
