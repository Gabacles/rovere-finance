# ADR-0017 — Alterações explícitas de recorrências

- Estado: aceita em 15/10/2026 por aprovação explícita P3-02.
- Contexto: mudar planejamento não pode apagar ocorrências, correções ou recebimentos reais.
- Decisão: separar programação futura e exceção individual, com prévia/confirmação, revisões imutáveis e estados de série; regras canônicas em [ciclo de vida](../recurrence-lifecycle.md).
- Consequências: pausa/retomada não geram receitas; cancelamento terminal de série preserva receitas existentes. Histórico, unicidade e guardas de recebimentos permanecem; UX incremental não representa aceite visual da V1.
