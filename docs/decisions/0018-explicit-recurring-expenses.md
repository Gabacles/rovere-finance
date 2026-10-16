# ADR-0018 — Confirmação explícita de despesas recorrentes

- Estado: aceita em 15/10/2026 por aprovação explícita P3-04.
- Contexto: assinatura prevista, compra registrada e cobrança importada não podem gerar três consumos ou inferir pagamento.
- Decisão: competência de planejamento explícita e confirmação cria/vincula uma Expense com data/valor conhecidos, preservando diferenças e evidências. Regras canônicas em [despesas recorrentes](../recurring-expenses.md).
- Consequências: calendário/ciclo puro reutilizado, persistência separada com relações tipadas e journals atômicos. Correções da despesa exigem revisão explícita do contexto; assinatura sem cartão continua sem cartão. Liquidação bancária própria e indicadores consolidados exigem futuras fatias; UX funcional não encerra o aceite visual da V1.
