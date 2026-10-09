# ADR-0011 — Natureza explícita e cobertura confirmada dos totais

- Estado: aceita na continuidade autorizada em 09/10/2026, aplicando a delegação das recomendações para a v0.
- Contexto: sinal importado não define consumo/pagamento/estorno, e todas as linhas disponíveis não comprovam que toda a fatura foi importada.
- Decisão: classificação manual com magnitude confirmada, subtotais separados por natureza e total completo condicionado à cobertura atual explicitamente confirmada. [Contrato canônico](../statement-calculation.md).
- Consequências: pagamentos informados ficam fora do consumo/total antes das liquidações; mudanças de linhas invalidam atualidade da cobertura sem apagar afirmações. Diferenças são revisadas, não compensadas automaticamente. Alocações de caixa e ajustes continuam nas próximas tasks.
